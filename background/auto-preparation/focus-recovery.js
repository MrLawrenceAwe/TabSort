// Give a stalled player one short foreground opportunity per attempt. Return
// focus only while we still own it; never override a user's later window switch.
export function createPreparationFocusRecovery({ now = Date.now, waitMs = 1000, holdMs = 3000 } = {}) {
  let startedAt = null;
  let attempted = false;
  let lease = null;

  async function release() {
    const owned = lease;
    lease = null;
    if (!owned) return;
    clearTimeout(owned.timer);
    const focused = await chrome.windows.getLastFocused().catch(() => null);
    if (focused?.focused && focused.id === owned.windowId) {
      await chrome.windows.update(owned.previousId, { focused: true }).catch(() => {});
    }
  }

  return {
    async recover(windowId, signal) {
      startedAt ??= now();
      if (signal.aborted || attempted || now() - startedAt < waitMs) return;
      const previous = await chrome.windows.getLastFocused().catch(() => null);
      // Chrome may be inactive while the user is in another app or PiP.
      // That is a deferred opportunity, not an attempted recovery. Keep
      // checking so returning to Chrome can unblock this same attempt.
      if (signal.aborted || !previous?.focused) return;
      attempted = true;
      if (previous.id === windowId) return;
      lease = { windowId, previousId: previous.id, timer: null };
      try {
        await chrome.windows.update(windowId, { focused: true });
        if (signal.aborted) await release();
        else if (lease) lease.timer = setTimeout(() => { void release(); }, holdMs);
      } catch {
        await release();
      }
    },
    release,
    async reset() {
      await release();
      startedAt = null;
      attempted = false;
    },
  };
}
