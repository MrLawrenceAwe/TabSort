const PREPARATION_STATUS_LABELS = Object.freeze({
  idle: 'No auto-prepare in progress',
  running: 'Auto-preparing tabs',
  complete: 'Auto-prepare complete',
  stopped: 'Auto-prepare stopped',
});

export function formatPreparationHeading(state) {
  return PREPARATION_STATUS_LABELS[state.status] || PREPARATION_STATUS_LABELS.idle;
}

export function formatPreparationCounts({ completed = 0, total = 0, ready = 0, skipped = 0 }) {
  return `${completed} of ${total} checked · ${ready} ready · ${skipped} skipped`;
}

const PREPARATION_PHASE_LABELS = Object.freeze({
  starting: 'Starting preparation',
  moving: 'Moving video to the preparation window',
  loading: 'Waiting for the tab to load',
  reading: 'Waiting for video data (up to 15 seconds)',
  settling: 'Checking saved playback progress',
  returning: 'Returning video to its original window',
  stopping: 'Stopping — waiting for the current step to finish',
});

export function formatPreparationDetail(state) {
  if (state.status === 'stopped') return state.reason || 'Stopped';
  if (state.status !== 'running') return '';
  return PREPARATION_PHASE_LABELS[state.phase] || 'Preparing video';
}

export function formatPreparationStatus(state) {
  if (state.status === 'idle') return '';
  const detail = formatPreparationDetail(state);
  return `${formatPreparationHeading(state)}: ${formatPreparationCounts(state)}${detail ? ` · ${detail}` : ''}`;
}
