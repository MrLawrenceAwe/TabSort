import { createAutoPreparationState } from './state.js';

// One run at a time. Cancellation is checked after every asynchronous boundary.
export function createAutoPreparationRunner({ inspect, moveTabToPreparationWindow, refresh, finishTabPreparation, cleanup = async () => {}, publish,
  now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 15000, pollMs = 500, settleMs = 3000,
  resumeJumpToleranceSeconds = 5, state = createAutoPreparationState() }) {
  let current = null;
  const snapshot = () => ({ ...state });
  const emit = () => publish(snapshot());
  function setPhase(phase) {
    if (state.phase === phase) return;
    state.phase = phase;
    emit();
  }
  function stop(reason = 'Stopped') {
    if (!current) return snapshot();
    current.abortController.abort();
    state.reason = reason;
    setPhase('stopping');
    return current.done;
  }
  async function run(job) {
    try {
      for (const item of job.items) {
        if (job.signal.aborted) return;
        const initial = await inspect(item.id, job.windowId);
        if (job.signal.aborted) return;
        if (!initial || initial.videoId !== item.videoId || initial.excluded) {
          state.skipped += 1;
        } else if (initial.ready) {
          state.ready += 1;
        } else {
          state.currentTabId = item.id;
          state.title = item.title;
          state.phase = 'moving';
          emit();
          let ready = false;
          try {
            const moved = await moveTabToPreparationWindow(item.id, job.windowId);
            if (job.signal.aborted) return;
            if (!moved) {
              state.skipped += 1;
              state.completed += 1;
              state.currentTabId = null;
              emit();
              continue;
            }
            const deadline = now() + timeoutMs;
            let readySince = null;
            let lastRemainingSeconds = null;
            let lastSampleAt = null;
            let lastRefreshAt = null;
            while (!job.signal.aborted && now() < deadline) {
              const tab = await inspect(item.id, job.windowId);
              if (job.signal.aborted) return;
              if (!tab || tab.videoId !== item.videoId || tab.excluded) break;
              if (!tab.active) { stop('Stopped because the selected tab changed inside the preparation window'); return; }
              setPhase(tab.ready ? 'settling' : tab.loaded ? 'reading' : 'loading');
              const sampledAt = now();
              if (tab.ready) {
                if (readySince == null) readySince = sampledAt;
                if (
                  Number.isFinite(tab.remainingSeconds) &&
                  Number.isFinite(lastRemainingSeconds) &&
                  lastSampleAt != null
                ) {
                  const elapsedSeconds = Math.max(0, (sampledAt - lastSampleAt) / 1000);
                  const allowedChange = resumeJumpToleranceSeconds + elapsedSeconds * 2;
                  if (Math.abs(tab.remainingSeconds - lastRemainingSeconds) > allowedChange) {
                    readySince = sampledAt;
                  }
                }
                lastRemainingSeconds = tab.remainingSeconds;
                lastSampleAt = sampledAt;
                if (sampledAt - readySince >= settleMs) { ready = true; break; }
              } else {
                readySince = null;
                lastRemainingSeconds = null;
                lastSampleAt = null;
              }
              // Inspect a completed read immediately so its settling period
              // starts now, not one poll later. Read time counts toward the
              // polling interval instead of adding to it on every iteration.
              const untilNextRead = lastRefreshAt == null ? 0 : lastRefreshAt + pollMs - now();
              const waitMs = Math.max(0, Math.min(
                tab.loaded ? untilNextRead : pollMs,
                deadline - now(),
              ));
              if (waitMs > 0) await delay(waitMs);
              if (job.signal.aborted) return;
              if (now() >= deadline) break;
              if (tab.loaded) {
                lastRefreshAt = now();
                await refresh(item.id, job.windowId, Math.max(1, deadline - now()), job.signal);
              }
            }
            if (job.signal.aborted) return;
          } finally {
            setPhase('returning');
            await finishTabPreparation(item.id, job.windowId, {
              autoPrepared: ready, wasDiscarded: initial.discarded,
            });
          }
          if (job.signal.aborted) return;
          if (ready) state.ready += 1;
          else state.skipped += 1;
        }
        state.completed += 1;
        state.currentTabId = null;
        emit();
      }
    } catch (error) {
      job.abortController.abort();
      state.reason = error?.message || 'Auto-preparation interrupted';
    } finally {
      try { await cleanup({ completed: !job.signal.aborted }); } catch (error) {
        job.abortController.abort();
        state.reason = error?.message || 'Could not return the preparation tab';
      }
      current = null;
      state.phase = null;
      state.status = job.signal.aborted ? 'stopped' : 'complete';
      state.currentTabId = null;
      state.title = '';
      emit();
    }
  }

  return {
    snapshot, stop,
    replaceTabId(addedTabId, removedTabId) {
      for (const item of current?.items ?? []) {
        if (item.id === removedTabId) item.id = addedTabId;
      }
      if (state.currentTabId === removedTabId) state.currentTabId = addedTabId;
    },
    start(windowId, items) {
      if (current) return { ok: false, error: 'alreadyAutoPreparing' };
      const abortController = new AbortController();
      const job = { windowId, items, abortController, signal: abortController.signal };
      current = job;
      delete state.reason;
      Object.assign(state, { status: 'running', windowId, total: items.length, completed: 0,
        ready: 0, skipped: 0, currentTabId: null, title: '', phase: 'starting' });
      emit();
      // Return immediately: the toolbar popup can close while the run continues.
      job.done = run(job);
      return { ok: true };
    },
  };
}
