import { TAB_STATES } from '../shared/constants.js';
import { now, resolveTrackedWindowId } from './state.js';

export async function moveTabsSequentially(tabIds, startingIndex = 0) {
  let targetIndex = startingIndex;
  for (const tabId of tabIds) {
    if (typeof tabId !== 'number') continue;
    try {
      await chrome.tabs.move(tabId, { index: targetIndex });
      targetIndex += 1;
    } catch (_) {
      // ignore move failure and retry same index for next tab
    }
  }
}

export function queryTabs(query) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn(
            `[TabSort] tabs.query failed for ${JSON.stringify(query)}: ${err.message}`,
          );
          resolve([]);
          return;
        }
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    } catch (error) {
      console.warn(
        `[TabSort] tabs.query threw for ${JSON.stringify(query)}: ${error.message}`,
      );
      resolve([]);
    }
  });
}

export async function getTabsForTrackedWindow(windowId, options = {}) {
  const targetWindowId = resolveTrackedWindowId(windowId, options);
  const baseQuery =
    targetWindowId != null ? { windowId: targetWindowId } : { currentWindow: true };

  const [visibleTabs, hiddenTabs] = await Promise.all([
    queryTabs(baseQuery),
    queryTabs({ ...baseQuery, hidden: true }),
  ]);

  const deduped = [];
  const seen = new Set();
  for (const tab of [...visibleTabs, ...hiddenTabs]) {
    if (!tab || typeof tab.id !== 'number') continue;
    if (seen.has(tab.id)) continue;
    seen.add(tab.id);
    deduped.push(tab);
  }

  return { tabs: deduped, windowId: targetWindowId };
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
    chrome.tabs.sendMessage(tabId, payload, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.debug(`[TabSort] skipped message to tab ${tabId}: ${err.message}`);
        resolve({ ok: false, error: err });
        return;
      }
      resolve({ ok: true, data: resp });
    });
  });
}

export function statusFromTab(tab) {
  if (tab.discarded) return TAB_STATES.SUSPENDED;
  if (tab.status === 'loading') return TAB_STATES.LOADING;
  return TAB_STATES.UNSUSPENDED;
}

export function setUnsuspendTimestamp(record, prevStatus, nextStatus) {
  if (
    ((prevStatus === TAB_STATES.SUSPENDED || prevStatus === TAB_STATES.LOADING) ||
      prevStatus == null) &&
    nextStatus === TAB_STATES.UNSUSPENDED
  ) {
    record.unsuspendedTimestamp = now();
  }
}
