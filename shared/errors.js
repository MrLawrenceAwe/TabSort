export function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
