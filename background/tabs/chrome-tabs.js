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

export async function moveTabsInOrder(tabIds, startIndex = 0) {
  let targetIndex = startIndex;
  const results = [];
  for (const tabId of tabIds) {
    if (typeof tabId !== 'number') continue;
    try {
      await chrome.tabs.move(tabId, { index: targetIndex });
      results.push({ tabId, ok: true, index: targetIndex });
      targetIndex += 1;
    } catch (error) {
      logDebug(`tabs.move failed for ${tabId}`, error);
      results.push({ tabId, ok: false, error });
    }
  }
  return results;
}

function queryTabs(query) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          logWarn(`tabs.query failed for ${JSON.stringify(query)}`, runtimeError);
          resolve(null);
          return;
        }
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    } catch (error) {
      logWarn(`tabs.query threw for ${JSON.stringify(query)}`, error);
      resolve(null);
    }
  });
}

export async function listWindowTabs(windowId = null) {
  const query = windowId != null ? { windowId } : { lastFocusedWindow: true };
  const tabs = await queryTabs(query);

  if (!Array.isArray(tabs)) {
    return null;
  }

  return tabs.filter((tab) => tab && typeof tab.id === 'number');
}

export function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(tab);
    });
  });
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

export async function reloadChromeTab(tabId) {
  try {
    await chrome.tabs.reload(tabId);
    return true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
    return false;
  }
}

export function sendMessageToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, (responsePayload) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        const reason = classifyRuntimeMessageFailure(runtimeError);
        console.debug(`[TabSort] skipped message to tab ${tabId}: ${runtimeError.message}`);
        resolve({ ok: false, reason, error: runtimeError });
        return;
      }
      resolve({ ok: true, data: responsePayload });
    });
  });
}

export function executeScriptInTab(tabId, files) {
  return new Promise((resolve) => {
    const scripting = chrome.scripting;
    if (!scripting?.executeScript) {
      resolve({ ok: false, reason: 'scriptingUnavailable' });
      return;
    }
    try {
      scripting.executeScript({ target: { tabId }, files }, () => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          logDebug(`scripting.executeScript failed for ${tabId}`, runtimeError);
          resolve({ ok: false, reason: 'chromeError', error: runtimeError });
          return;
        }
        resolve({ ok: true });
      });
    } catch (error) {
      logDebug(`scripting.executeScript threw for ${tabId}`, error);
      resolve({ ok: false, reason: 'chromeError', error });
    }
  });
}

export { MESSAGE_FAILURE_REASONS };

export function getTabState(tab) {
  if (tab.discarded) return TAB_LOAD_STATES.SUSPENDED;
  if (tab.status === 'loading') return TAB_LOAD_STATES.LOADING;
  return TAB_LOAD_STATES.UNSUSPENDED;
}
