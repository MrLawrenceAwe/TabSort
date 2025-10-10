const MESSAGE_TYPES = { ERROR: 'error', LOG: 'log' };

const TAB_STATES = {
  UNSUSPENDED: 'unsuspended',
  SUSPENDED: 'suspended',
  LOADING: 'loading',
};

const USER_ACTIONS = {
  RELOAD_TAB: 'Reload tab',
  INTERACT_WITH_TAB: 'Interact with tab',
  FACILITATE_LOAD: 'Facilitate load',
  INTERACT_WITH_TAB_THEN_RELOAD: 'Interact with tab/Reload tab',
  NO_ACTION: ''
};

let tabsInCurrentWindowAreKnownToBeSorted = false; // only true when ALL tabs known AND ordered
let totalWatchTabsInWindow = 0;          
let watchTabsReadyCount = 0;     // tabs with known remaining time
let knownWatchTabsOutOfOrder = false; // whether the known subset is out of order

initialise();

function initialise() {
  chrome.runtime.sendMessage({ action: "updateYoutubeWatchTabsInfos" });
  const refreshBg = setInterval(() => chrome.runtime.sendMessage({ action: "updateYoutubeWatchTabsInfos" }), 1000);

  updatePopup();
  const refreshPopup = setInterval(updatePopup, 500);

  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', () => chrome.runtime.sendMessage({ action: "sortTabs" }));
  }

  window.onunload = () => { clearInterval(refreshBg); clearInterval(refreshPopup); };
}

async function updatePopup() {
  const activeTabId = await getActiveTabId().catch(() => null);

  chrome.runtime.sendMessage({ action: "sendTabsInfos" }, (response) => {
    if (!response) return;

    const table = document.getElementById('infoTable');
    if (!table) return;

    const tabsInfos = response.youtubeWatchTabsInfosOfCurrentWindow || {};
    const orderIds = response.youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime || [];

    // rebuild table body
    while (table.rows.length > 1) table.deleteRow(1);
    const frag = document.createDocumentFragment();
    for (const tabId of orderIds) {
      const row = table.insertRow(-1);
      const tabInfo = tabsInfos[tabId];
      if (!tabInfo) continue;
      tabInfo.isActiveTab = (String(tabId) === String(activeTabId));
      insertRowCells(row, tabInfo);
      frag.appendChild(row);
    }
    table.appendChild(frag);

    // recompute state for header/footer
    totalWatchTabsInWindow = Object.keys(tabsInfos).length;
    watchTabsReadyCount = countTabsReadyForSorting(tabsInfos);
    knownWatchTabsOutOfOrder = areFiniteTabsOutOfOrder(tabsInfos);
    tabsInCurrentWindowAreKnownToBeSorted = allTabsKnownAndSorted(tabsInfos);

    setActionAndStatusColumnsVisibility(!tabsInCurrentWindowAreKnownToBeSorted);

    if ((totalWatchTabsInWindow === watchTabsReadyCount) && !tabsInCurrentWindowAreKnownToBeSorted) {
      addClassToAllRows(table, "all-ready-row");
    }

    updateHeaderFooter();
  });
}

// ---- helpers

async function getActiveTabId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length) resolve(tabs[0].id);
      else reject(new Error('No active tab'));
    });
  });
}

function setActionAndStatusColumnsVisibility(visible) {
  const actionRequired = document.querySelector('.action-required');
  const tabStatus = document.querySelector('.tab-status');
  const method = visible ? 'remove' : 'add';
  if (actionRequired) actionRequired.classList[method]('hide');
  if (tabStatus) tabStatus.classList[method]('hide');
}

function insertRowCells(row, tabInfo) {
  const ACTIVATE_TAB = 'activateTab';
  const RELOAD_TAB_ACTION = 'reloadTab';

  // Title / URL
  row.insertCell(0).textContent = (tabInfo.videoDetails?.title) ? tabInfo.videoDetails.title : tabInfo.url;

  // Action column (only when NOT “Tabs sorted”)
  const userAction = determineUserAction(tabInfo);
  if (!tabsInCurrentWindowAreKnownToBeSorted) insertUserActionCell(row, tabInfo, userAction);

  // Info columns
  insertInfoCells(row, tabInfo);

  // Row highlight when ready to sort
  const rt = tabInfo?.videoDetails?.remainingTime;
  const remainingTimeAvailable = (typeof rt === 'number' && isFinite(rt));
  if (remainingTimeAvailable && !tabsInCurrentWindowAreKnownToBeSorted) row.classList.add('ready-row');

  function insertInfoCells(r, info) {
    const INFO_KEYS = (tabsInCurrentWindowAreKnownToBeSorted)
      ? ['videoDetails', 'index']
      : ['videoDetails', 'index', 'status'];

    INFO_KEYS.forEach((key, i) => {
      const offset = (tabsInCurrentWindowAreKnownToBeSorted) ? 1 : 2;
      const cell = r.insertCell(i + offset);

      let value = info[key];
      if (key === 'videoDetails') {
        const rt2 = info?.videoDetails?.remainingTime;
        value = (typeof rt2 === 'number' && isFinite(rt2))
          ? (!info.isLiveStream ? formatRemaining(rt2) : 'Live Stream')
          : 'unavailable';
      }
      if (key === 'index') value = (Number.isFinite(value) ? value + 1 : '');

      cell.textContent = (tabsInCurrentWindowAreKnownToBeSorted)
        ? value
        : ((k, v) => (!v ? ((k === 'contentScriptReady' || k === 'metadataLoaded') ? false : USER_ACTIONS.NO_ACTION) : v))(key, value);
    });
  }

  function insertUserActionCell(r, info, action) {
    const cell = r.insertCell(1);

    if (action === USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD) {
      const interact = createLink(USER_ACTIONS.INTERACT_WITH_TAB, ACTIVATE_TAB, info.id);
      const reload = createLink(USER_ACTIONS.RELOAD_TAB, RELOAD_TAB_ACTION, info.id);
      cell.appendChild(interact);
      cell.appendChild(document.createTextNode('/'));
      cell.appendChild(reload);
    } else {
      const link = createLink(action, (action === USER_ACTIONS.RELOAD_TAB) ? RELOAD_TAB_ACTION : ACTIVATE_TAB, info.id);
      cell.appendChild(link);
    }
  }

  function createLink(text, messageAction, tabId) {
    const a = document.createElement('a');
    a.href = '#';
    a.classList.add('user-action-link');
    a.textContent = text;
    a.addEventListener('click', () => chrome.runtime.sendMessage({ action: messageAction, tabId }));
    return a;
  }
}

function formatRemaining(seconds) {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const s = Math.floor(seconds % 60);
  return h < 1 ? `${m}m ${s}s` : `${h}h ${m}m ${s}s`;
}

// Count tabs with usable remaining time
function countTabsReadyForSorting(tabsInfos) {
  return Object.values(tabsInfos).filter(t => {
    const rt = t?.videoDetails?.remainingTime;
    return typeof rt === 'number' && isFinite(rt);
  }).length;
}

// Are the known (finite) tabs out of order relative to their current tab positions?
function areFiniteTabsOutOfOrder(tabsInfos) {
  const infos = Object.values(tabsInfos);
  if (infos.length === 0) return false;

  const withRt = infos.map(t => {
    const rt = t?.videoDetails?.remainingTime;
    return { id: t.id, index: t.index, remaining: (typeof rt === 'number' && isFinite(rt)) ? rt : null };
  });

  const currentFiniteOrder = withRt
    .filter(x => x.remaining !== null)
    .sort((a, b) => a.index - b.index)
    .map(x => x.id);

  const expectedFiniteOrder = withRt
    .filter(x => x.remaining !== null)
    .sort((a, b) => a.remaining - b.remaining)
    .map(x => x.id);

  if (currentFiniteOrder.length < 2) return false; 
  if (currentFiniteOrder.length !== expectedFiniteOrder.length) return true;
  return !currentFiniteOrder.every((id, i) => id === expectedFiniteOrder[i]);
}

// Only true when every tab has a known remaining time AND the whole window is ordered
function allTabsKnownAndSorted(tabsInfos) {
  const infos = Object.values(tabsInfos);
  if (infos.length <= 1) return false; // don’t flash “Tabs sorted” for 0/1 watch tabs

  // all known?
  const allKnown = infos.every(t => typeof t?.videoDetails?.remainingTime === 'number' && isFinite(t.videoDetails.remainingTime));
  if (!allKnown) return false;

  // expected full order: finite (ascending) followed by nothing (since all finite)
  const currentOrder = infos.slice().sort((a, b) => a.index - b.index).map(t => t.id);
  const expectedOrder = infos.slice().sort((a, b) => {
    const ar = a.videoDetails.remainingTime, br = b.videoDetails.remainingTime;
    return ar - br;
  }).map(t => t.id);

  return currentOrder.length === expectedOrder.length &&
         currentOrder.every((id, i) => id === expectedOrder[i]);
}

// Header/footer (status, button, “Tabs sorted”)
function updateHeaderFooter() {
  const statusElement = document.getElementById('youtubeWatchTabsReadyStatus');
  const sortButton = document.getElementById('sortButton');
  const tabsSortedElement = document.getElementById('tabsSorted');
  const table = document.getElementById('infoTable');

  // Status text: N/M ready
  if (statusElement) {
    if (!tabsInCurrentWindowAreKnownToBeSorted) {
      statusElement.style.display = totalWatchTabsInWindow <= 1 ? 'none' : 'block';
      statusElement.textContent = `${watchTabsReadyCount}/${totalWatchTabsInWindow} ready for sort.`;
      statusElement.style.color = 'white';
    } else {
      statusElement.style.display = 'none';
    }
  }

  // “Tabs sorted” shows ONLY when all tabs known AND ordered
  if (tabsSortedElement) {
    tabsSortedElement.style.display = tabsInCurrentWindowAreKnownToBeSorted ? 'block' : 'none';
  }

  if (sortButton) {
    const shouldShowSort =
      (watchTabsReadyCount >= 2) &&
      knownWatchTabsOutOfOrder &&
      !tabsInCurrentWindowAreKnownToBeSorted;

    if (shouldShowSort) {
      // small delay prevents a first-paint flicker
      setTimeout(() => sortButton.style.setProperty('display', 'block', 'important'), 100);

      sortButton.style.backgroundColor = (watchTabsReadyCount === totalWatchTabsInWindow) ? 'forestgreen' : 'white';
      sortButton.textContent = (watchTabsReadyCount === totalWatchTabsInWindow)
        ? 'Sort All Tabs'
        : 'Sort Ready & Non Youtube Watch Tabs';
    } else {
      sortButton.style.display = 'none';
    }
  }

  if (tabsInCurrentWindowAreKnownToBeSorted && table) {
    for (let i = 1; i < table.rows.length; i++) table.rows[i].classList.remove('ready-row');
  }
}

// Add a class to all table rows
function addClassToAllRows(table, className) {
  for (let i = 0; i < table.rows.length; i++) table.rows[i].classList.add(className);
}

function determineUserAction(tabInfo) {
  const remainingTimeAvailable =
    (typeof tabInfo?.videoDetails?.remainingTime === 'number' && isFinite(tabInfo.videoDetails.remainingTime));
  tabInfo.remainingTimeAvailable = remainingTimeAvailable;

  const recentlyUnsuspended =
    tabInfo.unsuspendedTimestamp && (Date.now() - tabInfo.unsuspendedTimestamp) < 5000;

  if (!remainingTimeAvailable) {
    switch (tabInfo.status) {
      case TAB_STATES.UNSUSPENDED:
        if (recentlyUnsuspended) return USER_ACTIONS.NO_ACTION;
        if (tabInfo.isActiveTab || !tabInfo.contentScriptReady) return USER_ACTIONS.RELOAD_TAB;
        return USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD;
      case TAB_STATES.SUSPENDED:
        return USER_ACTIONS.INTERACT_WITH_TAB;
      case TAB_STATES.LOADING:
        return USER_ACTIONS.FACILITATE_LOAD;
      default:
        return USER_ACTIONS.NO_ACTION;
    }
  }
  return USER_ACTIONS.NO_ACTION;
}

// Logging helper
function logAndSend(type = MESSAGE_TYPES.ERROR, message = "Message is undefined") {
  if (type === MESSAGE_TYPES.ERROR) console.error(`Error from popup script ${message}`);
  else console.log(`Message from popup script ${message}`);
  chrome.runtime.sendMessage({ action: "logPopupMessage", type, info: message });
}