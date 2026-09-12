export function formatPreparationCounts({ completed = 0, total = 0, ready = 0, skipped = 0 }) {
  return `${completed} of ${total} checked · ${ready} ready · ${skipped} skipped`;
}
