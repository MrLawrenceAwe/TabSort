// One run at a time. Cancellation is checked after every asynchronous boundary.
export function createPreparationController({ inspect, activate, refresh, settle, publish,
  now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 15000, pollMs = 500, settleMs = 3000,
  resumeJumpToleranceSeconds = 5 }) {
  let current = null;
  let state = { status: 'idle', total: 0, completed: 0, ready: 0, skipped: 0, currentTabId: null };
  const snapshot = () => ({ ...state });
  const emit = () => publish(snapshot());
  function stop(reason = 'Stopped') {
    if (!current) return snapshot();
    current = null;
    state = { ...state, status: 'stopped', currentTabId: null, reason };
    emit();
    return snapshot();
  }
  async function run(job) {
    try {
      for (const item of job.items) {
        if (current !== job) return;
        const initial = await inspect(item.id, job.windowId);
        if (current !== job) return;
        if (!initial || initial.identity !== item.identity || initial.excluded) {
          state.skipped += 1;
        } else if (initial.ready) {
          state.ready += 1;
        } else {
          state.currentTabId = item.id;
          state.title = item.title;
          emit();
          const activated = await activate(item.id, job.windowId);
          if (current !== job) return;
          let ready = false;
          if (activated) {
            const deadline = now() + timeoutMs;
            let readySince = null;
            let lastRemainingSeconds = null;
            let lastSampleAt = null;
            while (current === job && now() < deadline) {
              const tab = await inspect(item.id, job.windowId);
              if (current !== job) return;
              if (!tab || tab.identity !== item.identity || tab.excluded) break;
              if (!tab.active) { stop('Stopped because you switched tabs'); return; }
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
              if (tab.loaded) await refresh(item.id, job.windowId, Math.max(1, deadline - now()));
              if (current !== job) return;
              await delay(pollMs);
            }
            if (current !== job) return;
            const settled = await settle(
              item.id, job.windowId, job.returnTabId, {
                prepared: ready,
                wasDiscarded: initial.discarded,
              },
            );
            if (typeof settled !== 'number') {
              stop('Stopped because the original tab is no longer available');
              return;
            }
            job.returnTabId = settled;
          }
          if (current !== job) return;
          if (ready) state.ready += 1;
          else state.skipped += 1;
        }
        state.completed += 1;
        state.currentTabId = null;
        emit();
      }
      if (current !== job) return;
      current = null;
      state.status = 'complete';
      state.title = '';
      emit();
    } catch (error) {
      if (current === job) stop(error?.message || 'Preparation interrupted');
    }
  }
  return {
    snapshot, stop,
    start(windowId, items, returnTabId) {
      if (current) return { ok: false, error: 'alreadyPreparing' };
      const job = { windowId, items, returnTabId };
      current = job;
      state = { status: 'running', windowId, total: items.length, completed: 0,
        ready: 0, skipped: 0, currentTabId: null, title: '' };
      emit();
      // Return immediately: the toolbar popup can close while the run continues.
      void run(job);
      return { ok: true };
    },
  };
}
