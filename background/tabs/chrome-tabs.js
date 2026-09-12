import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { logDebug, logWarn } from '../../shared/log.js';

const MESSAGE_FAILURE_REASONS = Object.freeze({
  NO_RECEIVER: 'noReceiver',
  EXTENSION_CONTEXT_INVALIDATED: 'extensionContextInvalidated',
  CHROME_ERROR: 'chromeError',
});

function classifyRuntimeMessageFailure(runtimeError) {
  const message = runtimeError?.message || String(runtimeError || '');
  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return MESSAGE_FAILURE_REASONS.NO_RECEIVER;
  }
  if (/Extension context invalidated|context invalidated/i.test(message)) {
    return MESSAGE_FAILURE_REASONS.EXTENSION_CONTEXT_INVALIDATED;
  }
  return MESSAGE_FAILURE_REASONS.CHROME_ERROR;
}

export async function moveTabsInOrder(tabIds, startIndex = 0, currentTabIds = []) {
  const desiredTabIds = tabIds.filter((tabId) => typeof tabId === 'number');
  const currentOrder = currentTabIds.filter((tabId) => typeof tabId === 'number');
  const orderAlreadyMatches =
    desiredTabIds.length === currentOrder.length &&
    desiredTabIds.every((tabId, index) => currentOrder[index] === tabId);
  if (!desiredTabIds.length || orderAlreadyMatches) {
    return { ok: true, movedCount: 0, failedCount: 0 };
  }

  const movedCount =
    desiredTabIds.length === currentOrder.length
      ? desiredTabIds.filter((tabId, index) => currentOrder[index] !== tabId).length
      : desiredTabIds.length;
  try {
    await chrome.tabs.move(desiredTabIds, { index: startIndex });
    return { ok: true, movedCount, failedCount: 0 };
  } catch (error) {
    logDebug(`tabs.move failed for ${desiredTabIds.join(',')}`, error);
    return { ok: false, movedCount: 0, failedCount: movedCount };
  }
}

export async function listWindowTabs(windowId = null) {
  const query = windowId != null ? { windowId } : { lastFocusedWindow: true };
  try {
    const tabs = await chrome.tabs.query(query);
    return tabs.filter(tab => tab && typeof tab.id === 'number');
  } catch (error) {
    logWarn(`tabs.query failed for ${JSON.stringify(query)}`, error);
    return null;
  }
}

export function getTab(tabId) {
  return chrome.tabs.get(tabId);
}

export async function updateTab(tabId, updateProperties) {
  try {
    await chrome.tabs.update(tabId, updateProperties);
    return true;
  } catch (error) {
    logDebug(`tabs.update failed for ${tabId}`, error);
    return false;
  }
}

export async function discardTab(tabId) {
  try {
    const tab = await chrome.tabs.discard(tabId);
    return Boolean(tab?.discarded);
  } catch (error) {
    logDebug(`tabs.discard failed for ${tabId}`, error);
    return false;
  }
}

export async function reloadChromeTab(tabId) {
  try {
    await chrome.tabs.reload(tabId);
    return true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
    return false;
  }
}

export async function sendMessageToTab(tabId, payload) {
  try {
    return { ok: true, data: await chrome.tabs.sendMessage(tabId, payload) };
  } catch (error) {
    const reason = classifyRuntimeMessageFailure(error);
    logDebug(`skipped message to tab ${tabId}`, error);
    return { ok: false, reason, error };
  }
}

export async function executeScriptInTab(tabId, files) {
  if (!chrome.scripting?.executeScript) {
    return { ok: false, reason: 'scriptingUnavailable' };
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
    return { ok: true };
  } catch (error) {
    logDebug(`scripting.executeScript failed for ${tabId}`, error);
    return { ok: false, reason: 'chromeError', error };
  }
}

export { MESSAGE_FAILURE_REASONS };

export function getTabLoadState(tab) {
  if (tab.discarded) return TAB_LOAD_STATES.DISCARDED;
  if (tab.status === 'loading') return TAB_LOAD_STATES.LOADING;
  return TAB_LOAD_STATES.LOADED;
}
