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
