const MESSAGE_TYPES = {
  ERROR: 'error',
  LOG: 'log',
};

const TAB_STATES = {
  UNSUSPENDED: 'unsuspended',
  SUSPENDED: 'suspended',
  LOADING: 'loading',
};

const INFO_KEYS = ['contentScriptReady', 'videoDetails', 'metadataLoaded', 'status'];

initialise();

//#region Functions 
function logAndSend(type = MESSAGE_TYPES.ERROR, message = "Message is undefined") {
  const formattedMessage = typeof message === 'string' ? message : (message.message || JSON.stringify(message));

  if (console[type] && typeof console[type] === 'function') {
    console[type](formattedMessage);
  } else {
    console.log(formattedMessage);
  }

  chrome.runtime.sendMessage({action: "logPopupMessage", type, message: formattedMessage});
}

function insertRowCells(row, tabInfo) {
  // Insert URL cell
  row.insertCell(0).textContent = tabInfo.url;

  // Insert cells for each info key
  INFO_KEYS.forEach((key, index) => {
    const cell = row.insertCell(index + 1);
    let value = tabInfo[key];

    if (key === 'videoDetails') {
      value = JSON.stringify(value) || '';
    }

    cell.textContent = value || (key === 'contentScriptReady' || key === 'metadataLoaded' ? false : '');
  });

  const userAction = determineUserAction(tabInfo);
  const userActionCell = row.insertCell(INFO_KEYS.length + 1);
  const userActionLink = document.createElement('a');
  userActionLink.href = '#';

  let messageAction;
  if (userAction === 'Reload tab') {
    messageAction = "reloadTab";
    userActionLink.textContent = userAction;
  } 
  else {
    messageAction = "activateTab";
    if (tabInfo.isActiveTab) {
      userActionCell.textContent = userAction;
    } 
    else if (userAction === 'Interact with tab') {
      const userActionText = document.createElement('span');
      userActionText.textContent = userAction.replace('tab', '');
      userActionLink.textContent = 'tab';
      userActionCell.appendChild(userActionText);
    } 
    else {
      userActionLink.textContent = userAction;
    }
  }

  userActionLink.addEventListener('click', () => {
    chrome.runtime.sendMessage({action: messageAction, tabId: tabInfo.id});
  });

  if (userActionLink.textContent) {
    userActionCell.appendChild(userActionLink);
  }


  // Add tabId and tabIndex to the table
  row.insertCell(INFO_KEYS.length + 2).textContent = tabInfo.id;
  row.insertCell(INFO_KEYS.length + 3).textContent = tabInfo.index; 
}

function determineUserAction(tabInfo) {
  switch(tabInfo.status) {
    case TAB_STATES.UNSUSPENDED:
      if((tabInfo.isActiveTab && !tabInfo.metadataLoaded) || !tabInfo.isActiveTab && (!tabInfo.contentScriptReady && !tabInfo.metadataLoaded)) {
        return 'Reload tab';
      }
      return (!tabInfo.contentScriptReady || !tabInfo.metadataLoaded) ? 'Interact with tab' : '';
    case TAB_STATES.SUSPENDED:
      return 'Interact with tab';
    case TAB_STATES.LOADING:
      return 'Facilitate load...';
    default:
      return '';
  }
}

async function updatePopup() {
  let activeTabId;

  try {
    activeTabId = await getActiveTabId();
  } catch (error) {
    logAndSend(MESSAGE_TYPES.ERROR, error);
    return;
  }

  chrome.runtime.sendMessage({action: "sendTabsInfo"}, function(tabsInfo) {
    logAndSend(MESSAGE_TYPES.LOG, "Tabs info fetched");

    const table = document.getElementById('infoTable');

    // Clear the table first
    while (table.rows.length > 1) {
      table.deleteRow(1);
    }

    // Now add the tabs info
    for (let tabId in tabsInfo) {
      const row = table.insertRow(-1);
      const tabInfo = tabsInfo[tabId];
      tabInfo.isActiveTab = tabId == activeTabId;

      if(!tabInfo.url){
        logAndSend(MESSAGE_TYPES.ERROR, `${tabId}`);
        continue;
      } 

      insertRowCells(row, tabInfo);
    }

    updateTabStatus(tabsInfo);
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

function updateTabStatus(tabsInfo) {
  // Count the tabs that need no user action
  let numTabsThatRequireNoAction = 0;
  const totalTabs = Object.keys(tabsInfo).length;

  // Iterate through tabs
  for (let tabId in tabsInfo) {
    const tabInfo = tabsInfo[tabId];
    if(!tabInfo.url){
      continue;
    } 
    // If no user action is needed, increment the counter
    if (determineUserAction(tabInfo) === '') {
      numTabsThatRequireNoAction++;
    }
  }

  // Update the message or show the button
  const tabStatusDiv = document.getElementById('tabStatus');
  const sortButton = document.getElementById('sortButton');

  if (numTabsThatRequireNoAction === totalTabs || totalTabs === 1) {
    tabStatusDiv.style.display = 'none';
    sortButton.style.display = 'block';
  } else {
    tabStatusDiv.textContent = `${numTabsThatRequireNoAction}/${totalTabs} ready for sort.`;
    tabStatusDiv.style.display = 'block';
    sortButton.style.display = 'none';
  }
}


function initialise() {
  logAndSend(MESSAGE_TYPES.LOG, "Popup script started");
  
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
//#endregion