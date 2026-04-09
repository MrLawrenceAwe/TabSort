import { TAB_STATES } from '../shared/constants.js';
import { logDebug, logWarn } from '../shared/log.js';

export async function moveTabsInOrder(tabIds, startIndex = 0) {
  let targetIndex = startIndex;
  for (const tabId of tabIds) {
    if (typeof tabId !== 'number') continue;
    try {
      await chrome.tabs.move(tabId, { index: targetIndex });
      targetIndex += 1;
    } catch (error) {
      logDebug(`tabs.move failed for ${tabId}`, error);
    }
  }
}

export function queryTabs(query) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) {
          logWarn(`tabs.query failed for ${JSON.stringify(query)}`, err);
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
  const baseQuery = windowId != null ? { windowId } : { lastFocusedWindow: true };

  const [visibleTabs, hiddenTabs] = await Promise.all([
    queryTabs(baseQuery),
    queryTabs({ ...baseQuery, hidden: true }),
  ]);

  if (!Array.isArray(visibleTabs)) {
    return null;
  }

  const extraTabs = Array.isArray(hiddenTabs) ? hiddenTabs : [];

  const deduped = [];
  const seen = new Set();
  for (const tab of [...visibleTabs, ...extraTabs]) {
    if (!tab || typeof tab.id !== 'number') continue;
    if (seen.has(tab.id)) continue;
    seen.add(tab.id);
    deduped.push(tab);
  }

  return deduped;
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

export function sendMessageToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, (responsePayload) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.debug(`[TabSort] skipped message to tab ${tabId}: ${err.message}`);
        resolve({ ok: false, error: err });
        return;
      }
      resolve({ ok: true, data: responsePayload });
    });
  });
}

export function getTabState(tab) {
  if (tab.discarded) return TAB_STATES.SUSPENDED;
  if (tab.status === 'loading') return TAB_STATES.LOADING;
  return TAB_STATES.UNSUSPENDED;
}
