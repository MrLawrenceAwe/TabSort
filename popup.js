const MESSAGE_TYPES = {
  ERROR: 'error',
  LOG: 'log',
};

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
}

let tabsInCurrentWindowAreKnownToBeSorted = false;
let totalTabs;
let tabsReadyCount;

initialise();

//Functions 
function initialise() {
  
  chrome.runtime.sendMessage({action: "updateYoutubeWatchTabsInfos"})
  const updateYoutubeWatchTabsInfosIntervalId = setInterval(() => chrome.runtime.sendMessage({action: "updateYoutubeWatchTabsInfos"}), 1000); 

  updatePopup();
  const updatePopupIntervalId = setInterval(updatePopup, 500); 

  document.getElementById('sortButton').addEventListener('click', function() {
    chrome.runtime.sendMessage({action: "sortTabs"});
  });

  window.onunload = function() {
    clearInterval(updatePopupIntervalId);
    clearInterval(updateYoutubeWatchTabsInfosIntervalId)
  };
}

async function updatePopup() {
  let activeTabId = await getActiveTabId();

  if (tabsInCurrentWindowAreKnownToBeSorted) setActionAndStatusColumnsVisibility(false)
  else setActionAndStatusColumnsVisibility(true)

  chrome.runtime.sendMessage({action: "sendTabsInfos"}, function(response) {
    const table = document.getElementById('infoTable');
    let tabsInfos = response.youtubeWatchTabsInfosOfCurrentWindow;
    let youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime = response.youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime;

    while (table.rows.length > 1)
      table.deleteRow(1);

    for (let tabId of youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime) {
      const row = table.insertRow(-1);
      const tabInfo = tabsInfos[tabId];
      tabInfo.isActiveTab = tabId == activeTabId;

      insertRowCells(row, tabInfo, tabsInCurrentWindowAreKnownToBeSorted);
    }

    totalTabs = Object.keys(tabsInfos).length;
    tabsReadyCount = countTabsReadyForSorting(tabsInfos);

    updateTabsInCurrentWindowAreKnownToBeSorted()

    if ((totalTabs == tabsReadyCount)  && !tabsInCurrentWindowAreKnownToBeSorted) addClassToAllRows(table, "all-ready-row");
    updateyoutubeWatchTabsReadyStatusDivAndSortButton(tabsReadyCount, totalTabs, tabsInCurrentWindowAreKnownToBeSorted);
  });
}

async function getActiveTabId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length) {
        resolve(tabs[0].id);
      } else {
        reject(new Error('No active tab found'));
      }
    });
  });
}

function setActionAndStatusColumnsVisibility(visible) {
  const actionRequired = document.querySelector('.action-required');
  const tabStatus = document.querySelector('.tab-status');

  const actionMethod = visible ? 'remove' : 'add';

  actionRequired.classList[actionMethod]('hide');
  tabStatus.classList[actionMethod]('hide');
}

function insertRowCells(row, tabInfo) {
  const ACTIVATE_TAB = 'activateTab';
  const RELOAD_TAB_ACTION = 'reloadTab';
  
  row.insertCell(0).textContent = (tabInfo.videoDetails?.title) ? tabInfo.videoDetails.title : tabInfo.url;
  const userAction = determineUserAction(tabInfo);
  if (!tabsInCurrentWindowAreKnownToBeSorted) insertUserActionCell(row, tabInfo, userAction);
  insertInfoCells(row, tabInfo);
  if (tabInfo.remainingTimeAvailable && !tabsInCurrentWindowAreKnownToBeSorted) row.classList.add('ready-row');

  function insertInfoCells(row, tabInfo) {
    let INFO_KEYS = (tabsInCurrentWindowAreKnownToBeSorted) ? ['videoDetails', 'index'] : ['videoDetails', 'index', 'status'] 
    INFO_KEYS.forEach((key, index) => {
      let offset = (tabsInCurrentWindowAreKnownToBeSorted) ? 1 : 2
      const cell = row.insertCell(index + offset);
      let value = tabInfo[key];
      if (key === 'videoDetails'){
        value = (value?.remainingTime !== null && value?.remainingTime !== undefined) ? ((!tabInfo.isLiveStream) ? convertSecondsToStringHoursMinutesandSeconds(value.remainingTime): "Live Stream") : 'unavailable';
      } 
      if (key === 'index') value++
      cell.textContent = (tabsInCurrentWindowAreKnownToBeSorted) ? value : ((key, value) => {
        if (!value) {
          return (key === 'contentScriptReady' || key === 'metadataLoaded') ? false : USER_ACTIONS.NO_ACTION;
        }
        return value;
      })(key, value);
    });
  }

  function convertSecondsToStringHoursMinutesandSeconds(seconds){
    if (typeof seconds !== 'number' || !isFinite(seconds)) {
        logAndSend('error',"Invalid input. The function expects a finite number.");
    }

    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60; // This will give the minutes that are not part of the calculated hours.
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours < 1) {
        return `${remainingMinutes}m ${remainingSeconds}s`;
    } else {
        return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    }
  }
  
  function insertUserActionCell(row, tabInfo, userAction) {
    const userActionCell = row.insertCell(1);
  
    if (userAction === USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD) {
      const interactActionLink = createLink(USER_ACTIONS.INTERACT_WITH_TAB, ACTIVATE_TAB, tabInfo.id);
      const reloadActionLink = createLink(USER_ACTIONS.RELOAD_TAB, RELOAD_TAB_ACTION, tabInfo.id);
      userActionCell.appendChild(interactActionLink);
      userActionCell.appendChild(document.createTextNode("/"));
      userActionCell.appendChild(reloadActionLink);
    } else {
      const userActionLink = createLink(userAction, (userAction === USER_ACTIONS.RELOAD_TAB) ? RELOAD_TAB_ACTION : ACTIVATE_TAB, tabInfo.id);
      userActionCell.appendChild(userActionLink);
    }
  }

  function createLink(text, messageAction, tabId) {
    const link = document.createElement('a');
    link.href = '#';
    link.classList.add('user-action-link');
    link.textContent = text;
    link.addEventListener('click', () => {
      chrome.runtime.sendMessage({action: messageAction, tabId: tabId});
    });
    return link;
  }
  //#endregion 
}

function countTabsReadyForSorting(tabData) {
  //#region Inner Function
  function isTabReadyForSorting(tabInfo) {
    return tabInfo.url && tabInfo.remainingTimeAvailable;
  }
  //#endregion Inner Function
  return Object.values(tabData).filter(tabInfo => isTabReadyForSorting(tabInfo)).length;
}

async function updateTabsInCurrentWindowAreKnownToBeSorted(){
  //#region Inner Function
    function checkIfTabsSortedInCurrentWindow() {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({action: "areTabsInCurrentWindowKnownToBeSorted"}, resolve);
      });
    }
  //#endregion Inner Function
  tabsInCurrentWindowAreKnownToBeSorted = await checkIfTabsSortedInCurrentWindow();
}

async function addClassToAllRows(table, className) {
  for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].classList.add(className);
  }
}

async function updateyoutubeWatchTabsReadyStatusDivAndSortButton() {
  //#region Inner Functions
    function updateyoutubeWatchTabsReadyStatusMessage() {
      if (!tabsInCurrentWindowAreKnownToBeSorted) {
        youtubeWatchTabsReadyStatusElement.style.display = totalTabs <= 1 ? 'none' : 'block';
        youtubeWatchTabsReadyStatusElement.textContent = `${tabsReadyCount}/${totalTabs} ready for sort.`;
        youtubeWatchTabsReadyStatusElement.style.color = "white";
      }
      else youtubeWatchTabsReadyStatusElement.style.display = 'none'
    }
    
    function updateSortButtonAndTabsSortedText() {
      const tabsSortedElement = document.getElementById('tabsSorted');
      const table = document.getElementById('infoTable');
  
      if (tabsInCurrentWindowAreKnownToBeSorted) {
        sortButton.style.display = 'none';
        tabsSortedElement.style.display = 'block'
  
        for (let i = 1; i < table.rows.length; i++) {
          table.rows[i].classList.remove('ready-row');
        }
        
      }
      else {
        setTimeout(() => {
          if (!tabsInCurrentWindowAreKnownToBeSorted)
          sortButton.style.setProperty('display', 'block', 'important')
        }, 500)
        tabsSortedElement.style.display = 'none'
  
      }
      
      if (tabsReadyCount === totalTabs){
        sortButton.style.backgroundColor = 'forestgreen';
        sortButton.innerHTML = 'Sort All Tabs';
      }
      else{
        sortButton.style.backgroundColor = 'white';
        sortButton.innerHTML = 'Sort Ready & Non Youtube Watch Tabs';
      } 
    }
  //#endregion
  const youtubeWatchTabsReadyStatusElement = document.getElementById('youtubeWatchTabsReadyStatus');
  const sortButton = document.getElementById('sortButton');

  updateyoutubeWatchTabsReadyStatusMessage();
  updateSortButtonAndTabsSortedText();
}

function determineUserAction(tabInfo) {
  tabInfo.remainingTimeAvailable = (tabInfo.videoDetails?.remainingTime !== null && tabInfo.videoDetails?.remainingTime !== undefined)
  let unspendedLessThanHalfASecondAgo = tabInfo.unsuspendedTimestamp && (Date.now() - tabInfo.unsuspendedTimestamp) < 500;

  if (!tabInfo.remainingTimeAvailable){
    switch(tabInfo.status) {
      case TAB_STATES.UNSUSPENDED:
        if(unspendedLessThanHalfASecondAgo) return USER_ACTIONS.NO_ACTION;
        if((tabInfo.isActiveTab) || !tabInfo.contentScriptReady)
          return USER_ACTIONS.RELOAD_TAB;

        return USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD;
      case TAB_STATES.SUSPENDED:
        return USER_ACTIONS.INTERACT_WITH_TAB;
      case TAB_STATES.LOADING:
        return USER_ACTIONS.FACILITATE_LOAD
      default:
        return USER_ACTIONS.NO_ACTION;
    }
 }
 else return USER_ACTIONS.NO_ACTION;
}

async function logAndSend(type = MESSAGE_TYPES.ERROR, message = "Message is undefined") {
  if (type === MESSAGE_TYPES.ERROR) {
    console.error(`Error from popup script ${message}`);
  } else {
    console.log(`Message from popup script ${message}`);
  }

  chrome.runtime.sendMessage({action: "logPopupMessage", type:type, info: message});
}