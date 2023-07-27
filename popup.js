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
  NO_ACTION: ''
}

let tabsInCurrentWindowAreKnownToBeSorted = true;

initialise();

//#region Functions 
function initialise() {
  chrome.runtime.sendMessage({action: "updateYoutubeWatchTabsInfos"})
  const updateYoutubeWatchTabsInfosIntervalId = setInterval(() => chrome.runtime.sendMessage({action: "updateYoutubeWatchTabsInfos"}), 500); 

  updatePopup();
  const updatePopupIntervalId = setInterval(updatePopup, 500); 

  document.getElementById('sortButton').addEventListener('click', function() {
    chrome.runtime.sendMessage({action: "sortTabs"});
  });

  window.onunload = function() {
    clearInterval(updatePopupIntervalId);
    clearInterval(updateYoutubeWatchTabsInfosIntervalId)
  };

  document.getElementById('sortButton').addEventListener('click', function() {
    chrome.runtime.sendMessage({action: "sortTabs"});
  });
}

async function updatePopup() {
  let activeTabId;

  try {
    activeTabId = await getActiveTabId();
  } catch (error) {
    logAndSend(MESSAGE_TYPES.ERROR, error);
    return;
  }

  if (tabsInCurrentWindowAreKnownToBeSorted) hideColumnsThatAreUnWantedWhenTabsInTheCurrentWindowAreKnownToBeSorted()
  else showColumnsThatAreUnWantedWhenTabsInTheCurrentWindowAreKnownToBeSorted()


  chrome.runtime.sendMessage({action: "sendTabsInfos"}, function(response) {
    const table = document.getElementById('infoTable');
    let tabsInfos = response.youtubeWatchTabsInfosOfCurrentWindow;
    let youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime = response.youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime;

    while (table.rows.length > 1) {
      table.deleteRow(1);
    }

    for (let tabId of youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime) {
      const row = table.insertRow(-1);
      const tabInfo = tabsInfos[tabId];
      tabInfo.isActiveTab = tabId == activeTabId;

      if(!tabInfo.url){
       logAndSend(MESSAGE_TYPES.ERROR, `No url for tab with id ${tabId}`);
        continue;
      } 

      insertRowCells(row, tabInfo);
    }

    updateTabStatusDiv(tabsInfos);
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

function hideColumnsThatAreUnWantedWhenTabsInTheCurrentWindowAreKnownToBeSorted() {
  const actionRequired = document.querySelector('.action-required');
  const tabStatus = document.querySelector('.tab-status');

  actionRequired.classList.add('hide-col-action-required');
  tabStatus.classList.add('hide-col-tab-status');
}

function showColumnsThatAreUnWantedWhenTabsInTheCurrentWindowAreKnownToBeSorted() {
  const actionRequired = document.querySelector('.action-required');
  const tabStatus = document.querySelector('.tab-status');

  actionRequired.classList.remove('hide-col-action-required');
  tabStatus.classList.remove('hide-col-tab-status');
}

function insertRowCells(row, tabInfo) {
  const ACTIVATE_TAB = 'activateTab';
  const RELOAD_TAB_ACTION = 'reloadTab';
  
  row.insertCell(0).textContent = (tabInfo.videoDetails?.title) ? tabInfo.videoDetails.title : tabInfo.url;
  const userAction = determineUserAction(tabInfo);
  if (!tabsInCurrentWindowAreKnownToBeSorted) insertUserActionCell(row, tabInfo, userAction);
  insertInfoCells(row, tabInfo);
  if (userAction === USER_ACTIONS.NO_ACTION && !tabsInCurrentWindowAreKnownToBeSorted) row.classList.add('ready-row');

  //#region Inner Functions

  function insertInfoCells(row, tabInfo) {
    let INFO_KEYS = (tabsInCurrentWindowAreKnownToBeSorted) ? ['videoDetails', 'index'] : ['videoDetails', 'index', 'status'] 
    INFO_KEYS.forEach((key, index) => {
      let offset = (tabsInCurrentWindowAreKnownToBeSorted) ? 1 : 2
      const cell = row.insertCell(index + offset);
      let value = tabInfo[key];
      if (key === 'videoDetails'){
        value = (value?.remainingTime !== null && value?.remainingTime !== undefined) ? ((!tabInfo.isLiveStream) ? convertSecondsToStringHoursMinutesandSeconds(value.remainingTime): "Live stream") : 'unavailable';
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
    const userActionLink = document.createElement('a');
    userActionLink.href = '#';
    userActionLink.classList.add('user-action-link');
  
    let messageAction = (userAction === USER_ACTIONS.RELOAD_TAB) ? RELOAD_TAB_ACTION : ACTIVATE_TAB;
  
    if (userAction === USER_ACTIONS.RELOAD_TAB || !(tabInfo.isActiveTab)) {
      userActionLink.textContent = userAction;
    } 
    else userActionCell.textContent = userAction;
  
    userActionLink.addEventListener('click', () => {
      chrome.runtime.sendMessage({action: messageAction, tabId: tabInfo.id});
    });
  
    if (userActionLink.textContent) {
      userActionCell.appendChild(userActionLink);
    }
  }
  //#endregion 
}

async function updateTabStatusDiv(tabData) {
  //#region Inner Functions
  function getTotalTabs() {
    return Object.keys(tabData).length;
  }
  
  function countTabsReadyForSorting(tabData) {
    return Object.values(tabData).filter(tabInfo => isTabReadyForSorting(tabInfo)).length;
  }
  
  function isTabReadyForSorting(tabInfo) {
    return tabInfo.url && determineUserAction(tabInfo) === USER_ACTIONS.NO_ACTION;
  }
  
  function checkIfTabsSortedInCurrentWindow() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({action: "areTabsInCurrentWindowKnownToBeSorted"}, resolve);
    });
  }
  
  function getHTMLElementById(elementId) {
    return document.getElementById(elementId);
  }
  
  function updateTabStatusMessage() {
    if (!tabsInCurrentWindowAreKnownToBeSorted) {
      tabStatusElement.style.display = totalTabs <= 1 ? 'none' : 'block';
      tabStatusElement.textContent = `${tabsReadyCount}/${totalTabs} ready for sort.`;
      tabStatusElement.style.color = "white";
    }
    else tabStatusElement.style.display = 'none'
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
      sortButton.style.display = 'block';
      tabsSortedElement.style.display = 'none'

    }
    
    const allTabsReady = (tabsReadyCount === totalTabs);
    if (allTabsReady){
      sortButton.style.backgroundColor = 'forestgreen';
      sortButton.innerHTML = 'Sort All Tabs';
    }
    else{
      sortButton.style.backgroundColor = 'white';
      sortButton.innerHTML = 'Sort Ready & Non Youtube Watch Tabs';
    } 
  }
  //#endregion

  const totalTabs = getTotalTabs();
  const tabsReadyCount = countTabsReadyForSorting(tabData);

  tabsInCurrentWindowAreKnownToBeSorted = await checkIfTabsSortedInCurrentWindow();

  const tabStatusElement = getHTMLElementById('tabStatus');
  const sortButton = getHTMLElementById('sortButton');

  updateTabStatusMessage();
  updateSortButtonAndTabsSortedText();
}

function determineUserAction(tabInfo) {
  let remainingTimeAvailable = (tabInfo.videoDetails?.remainingTime !== null && tabInfo.videoDetails?.remainingTime !== undefined)
  if (!remainingTimeAvailable){
    switch(tabInfo.status) {
      case TAB_STATES.UNSUSPENDED:
        if((tabInfo.isActiveTab) || (!tabInfo.isActiveTab && !tabInfo.contentScriptReady)){
          return USER_ACTIONS.RELOAD_TAB;
        }

        return USER_ACTIONS.INTERACT_WITH_TAB;
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
//#endregion