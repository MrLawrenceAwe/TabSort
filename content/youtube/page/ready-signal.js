export function shouldSendContentScriptReadySignal(
  currentUrl,
  lastScriptReadyUrl,
  { force = false } = {},
) {
  return Boolean(currentUrl) && (force || currentUrl !== lastScriptReadyUrl);
}
