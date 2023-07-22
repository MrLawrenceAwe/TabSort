import WindowsOfYoutubeWatchTabsInfos from './WindowsOfYoutubeWatchTabsInfos.js';
import YoutubeWatchTabInfo from './YoutubeWatchTabInfo.js';
import YoutubeWatchTabsInfos from './YoutubeWatchTabsInfos.js';

let youtubeWatchTabsInfosOfCurrentWindow = new YoutubeWatchTabsInfos();
populateYoutubeWatchTabsInfosOfCurrentWindow();

chrome.runtime.onMessage.addListener(handleMessage);

initialiseTabsListeners();

let tabUrls = {};
initialiseTabUrls();

let lastFocusedChromeWindowId = getCurrentWindowId();
let windowsOfYoutubeWatchTabsInfos = new WindowsOfYoutubeWatchTabsInfos();
let nonChromeWindowInFocus = false;

initialiseWindowsListeners()

//#region Functions
async function populateYoutubeWatchTabsInfosOfCurrentWindow(){
    try {
        const tabs = await getTabsInWindow({currentWindow: true, url: "*://*.youtube.com/watch*"});
        tabs.forEach(loadYoutubeWatchTab);
    } catch (error) {
        console.error(error);
    }
}

async function initialiseTabsListeners(){
    chrome.tabs.onUpdated.addListener(handleUpdatedTab);
    chrome.tabs.onRemoved.addListener(handleRemovedTab);
    chrome.tabs.onDetached.addListener(handleDetachedTab);
    chrome.tabs.onReplaced.addListener(handleReplacedTab);
}

function initialiseTabUrls(){
    chrome.tabs.query({}, (tabs) => {
        for (let tab of tabs) {
            tabUrls[tab.id] = tab.url;
        }
    });
}

async function getCurrentWindowId() {
    let window = await chrome.windows.getCurrent();
    return window.id;
}

function initialiseWindowsListeners(){
    chrome.windows.onFocusChanged.addListener((newWindowId) => {
        if (lastFocusedChromeWindowId !== undefined) {
            windowsOfYoutubeWatchTabsInfos[lastFocusedChromeWindowId] = youtubeWatchTabsInfosOfCurrentWindow;
        }
        if (newWindowId !== chrome.windows.WINDOW_ID_NONE) {
            nonChromeWindowInFocus = false;
            youtubeWatchTabsInfosOfCurrentWindow = windowsOfYoutubeWatchTabsInfos[newWindowId] !== undefined ? windowsOfYoutubeWatchTabsInfos[newWindowId] : new YoutubeWatchTabsInfos();
            lastFocusedChromeWindowId = newWindowId;
        }
        else nonChromeWindowInFocus = true;
    });
    
    chrome.windows.onRemoved.addListener((removedWindowId) => {
        if (windowsOfYoutubeWatchTabsInfos[removedWindowId])
        delete windowsOfYoutubeWatchTabsInfos[removedWindowId]
    });
}

function handleMessage(message, sender, sendResponse){
    //#region INNER FUNCTIONS
    function logMessage(message, url, color = 'color: purple;') {
        console.log(`%cMessage from ${message.source} on tab with url ${url}:`, color, message.text);
    }

    function errorMessage(message, url) {
        console.error(`Error from ${message.source} on tab with url ${url}:`, message.text);
    }

    function handleContentScriptReady() {
        if(youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].contentScriptReady) return;
        loadYoutubeWatchTab(sender.tab);
        youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].contentScriptReady = true;
        sendMessageToTab(tabId, "sendMetadataLoaded", "Requesting metaDataLoaded");

    
        sendResponse({message: "contentScriptAck"});
    }

    function handleMetadataLoaded() {
        if (youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id]) {
            youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].metadataLoaded = true;
            youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].status = 'unsuspended';
    
            let videoDetails = getYoutubeWatchTabVideoDetailsFromTab(sender.tab);
            loadYoutubeWatchTabVideoDetails(sender.tab, videoDetails);
        } else {
            throw new Error(`Received metadataLoaded message from tab with url ${sender.tab.url}, but no tab info was found`);
        }
    }
    //#endregion

    message.message = message.action || message.message;

    const handlers = {
        logMessage: () => {
            if (message.type === "error") {
                errorMessage(message, sender.tab.url);
            } else {
                logMessage({source: 'content script', text: message.message}, sender.tab.url);
            }
        },
        logPopupMessage: () => {
            if (message.type === "error") {
                errorMessage(message, sender.tab.url);
                console.log(youtubeWatchTabsInfosOfCurrentWindow[message.message])
            } else {
                logMessage({source: 'popup', text: message.message}, sender.tab.url);
            }
        },
        sendTabsInfo: () => {
            console.log("Received getTabsInfo message from popup");
            for (let id in youtubeWatchTabsInfosOfCurrentWindow) {
                if (youtubeWatchTabsInfosOfCurrentWindow[id].metadataLoaded){
                    if (youtubeWatchTabsInfosOfCurrentWindow[id].status != 'unsuspended')
                    youtubeWatchTabsInfosOfCurrentWindow[id].status = 'unsuspended'
                    updateRemainingTimeOfVideo(parseInt(id));
                }
            }
            sendResponse(youtubeWatchTabsInfosOfCurrentWindow);
        },
        activateTab: () => {
            chrome.tabs.update(message.tabId, { active: true });
        },
        sortTabs: () => {
            console.log("%csortTabs message received, now attempting to sort tabs", "color: blue");
            sortTabs();
        },
        updateYoutubeWatchTabsInfos: () => {
            if (nonChromeWindowInFocus) return; 
            updateYoutubeWatchTabsInfos()
        },
        reloadTab: () => {
            chrome.tabs.reload(message.tabId)
            loadYoutubeWatchTabState(message.tabId);
        },
        contentScriptReady: () => {
            console.log("Received contentScriptReady message from tab with url " + sender.tab.url);
            handleContentScriptReady();
        },
        metadataLoaded: () => {
            console.log("Received metadataLoaded message from tab with url " + sender.tab.url);
            handleMetadataLoaded();
        }
    }

    if(handlers[message.message]) {
        handlers[message.message]();
    }
}

function loadYoutubeWatchTab(tab){
    try {
        youtubeWatchTabsInfosOfCurrentWindow[tab.id] = new YoutubeWatchTabInfo(tab) 
        loadYoutubeWatchTabState(tab.id);
        //console.log(`%cLoaded state for tab with url ${tab.url}`, "color: blue");
    } catch (error) {
        console.error(error);
    }
}

async function loadYoutubeWatchTabState(tabId) {
    //#region Inner Functions
    function setTabState(tab, status) {
        if (!youtubeWatchTabsInfosOfCurrentWindow[tab.id]) {
            youtubeWatchTabsInfosOfCurrentWindow[tab.id] = new YoutubeWatchTabInfo();
        }
        youtubeWatchTabsInfosOfCurrentWindow[tab.id].status = status;
    }
    //#endregion 

    try {
        const tab = await getTab(tabId);
        const prefix = `Tab with url ${tab.url} is `;

        if (tab.discarded || tab.status === "unloaded") {
            console.log(prefix + "suspended");
            setTabState(tab, 'suspended');
        } else if (tab.status === "complete") {
            console.log(prefix + "unsuspended");
            setTabState(tab, 'unsuspended');
        } else if (tab.status === "loading") {
            console.log(prefix + "loading");
            setTabState(tab, 'loading');
            listenForLoadingTabComplete(tab);
        } else {
            throw new Error("Unknown tab status for tab with url " + tab.url);
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function updateRemainingTimeOfVideo(tabId) {
    try {
        const tab = await getTab(tabId);
        
        //#region Helper functions
        function throwErrorIfNoTabInfo() {
            if (!youtubeWatchTabsInfosOfCurrentWindow[tabId]) throw new Error(`No information available for tab with id ${tabId}`);
        }

        function throwErrorIfContentScriptNotReady() {
            if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].contentScriptReady) {
                throw new Error(`Cannot update remaining time of tab with tab with url ${youtubeWatchTabsInfosOfCurrentWindow[tabId].url} as content script is not ready`);
            }
        }

        function throwErrorIfMetadataNotLoaded() {
            if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].metadataLoaded) {
                throw new Error(`Cannot update remaining time as tab with url ${youtubeWatchTabsInfosOfCurrentWindow[tabId].url} is ready, but metadata has not been loaded yet`);
            }
        }

        async function updateRemainingTime() {
            const response = await getRemainingTimeOfVideoFromTab(tab.id);
            if (!response) throw new Error(`Something went wrong getting the remaining time for from tab with URL ${tab.url}`);

            youtubeWatchTabsInfosOfCurrentWindow[tab.id].videoDetails = {
                ...youtubeWatchTabsInfosOfCurrentWindow[tab.id].videoDetails,
                remainingTime: response.remainingTime,
            };
        }
        //#endregion Helper functions

        throwErrorIfNoTabInfo();
        throwErrorIfContentScriptNotReady();
        throwErrorIfMetadataNotLoaded();
        await updateRemainingTime();

    } catch (error) {
        console.error(`Could not get tab or update remaining time for tab with id ${tabId}: ${error}`);
        throw new Error(error)
    }
}

function getYoutubeWatchTabVideoDetailsFromTab(tab) {
    async function handleResponse(response){
        function checkForErrorWithResponse() {
            if (response && response.remainingTime !== undefined) {
                return;
            } 
            else if (response.error) {
                console.error(`An error occurred in the content script for tab with url ${responder.url} : ${response.error}`);
                throw new Error(response.error);
            }
        }

        if (response) {
            console.log("Video details received from content script for tab with url " + tab.url + " : " + JSON.stringify(response));
            return response;
        }
        else {
            console.error("no response received from content script for tab with url " + tab.url);
        }
        try {
            checkForErrorWithResponse();
        } catch (error) {
            console.error(error)
        }
    }

    sendMessageToTab(tab.id, "sendDetails", "Requesting video details from tab", (response) => handleResponse(response));
}

async function loadYoutubeWatchTabVideoDetails(tab,videoDetails) {
    if (!youtubeWatchTabsInfosOfCurrentWindow[tab.id]) {
        youtubeWatchTabsInfosOfCurrentWindow[tabId] = new YoutubeWatchTabInfo();
    }

    youtubeWatchTabsInfosOfCurrentWindow[tab.id].videoDetails = videoDetails;
}

async function sendMessageToTab(tabId, action, logMessage, callback) {
    console.log(logMessage);
    chrome.tabs.sendMessage(tabId, { action }, callback);
}

async function updateYoutubeWatchTabsInfos() {
    try {
        const tabs = await getTabsInWindow({currentWindow: true, url: "*://*.youtube.com/watch*"});
        let currentWindowTabIds = new Set(tabs.map(tab => tab.id));

        //#region Inner Functions
            function loadUntrackedTabs(tab) {
                if (!youtubeWatchTabsInfosOfCurrentWindow.hasOwnProperty(tab.id)) {
                    console.log(`Tab with url ${tab.url}  not in youtubeWatchTabs, found in current window. Attempting to load`);
                    loadYoutubeWatchTab(tab);
                }
            }

            function removeObsoleteTabs(id) {
                if (!currentWindowTabIds.has(parseInt(id))) {
                    console.log(`Tab with id ${id} found in youtubeWatchTabs but not in current window. Removing from youtubeWatchTabs`);
                    delete youtubeWatchTabsInfosOfCurrentWindow[id];
                }
            }
        //#endregion

        tabs.forEach(loadUntrackedTabs);
        Object.keys(youtubeWatchTabsInfosOfCurrentWindow).forEach(removeObsoleteTabs);
        
    } catch (error) {
        console.error(error);
    }
}

function getRemainingTimeOfVideoFromTab(tabId) {
    return new Promise((resolve, reject) => {
      sendMessageToTab(tabId, "sendRemainingTime", "Requesting remainingTime", resolve);
      setTimeout(() => reject("No response received from content script in 5 second limit"), 5000);
    });
}

function getRemainingTimesFromYoutubeWatchTabsInfos() {
    let remainingTimes = {};

    for (let tabId in youtubeWatchTabsInfosOfCurrentWindow) {
        let tabInfo = youtubeWatchTabsInfosOfCurrentWindow[tabId];

        if (tabInfo.videoDetails) {
            remainingTimes[tabId] = tabInfo.videoDetails.remainingTime;
        }
        else {
            console.log(`%cNo video details for tab with url ${tabInfo.url}`, "color: red");
        }
    }

    return remainingTimes;
}

function listenForLoadingTabComplete(tab) {
    const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            loadYoutubeWatchTabState(tab.id);
        }
    };
    chrome.tabs.onUpdated.addListener(listener);
}

function handleUpdatedTab(tabId, changeInfo, tab) {
    console.log(`Tab with url ${tabUrls[tabId] || 'unknown'} has been updated. New url is ${changeInfo.url}.`);
    tabUrls[tabId] = changeInfo.url;

    const updatedTabIsYoutubeWatchTab = changeInfo.url.startsWith('https://www.youtube.com/watch');
    const updatedTabWasYoutubeWatchTab = youtubeWatchTabsInfosOfCurrentWindow[tabId]
    
    if (updatedTabIsYoutubeWatchTab) {
        handleYoutubeWatchTabUpdate(tabId, tab, changeInfo.url);
    } else if (updatedTabWasYoutubeWatchTab) {
        handleTabChangeToNonYoutubeWatchTab(tabId, tab);
    }
}

function handleYoutubeWatchTabUpdate(tabId, tab) {
    console.log(`%cA tab has been updated to youtube watch tab with id ${tab.id}. tabId: ${tab.id}`, "color: orange");
    if (!youtubeWatchTabsInfosOfCurrentWindow[tabId]){
        youtubeWatchTabsInfosOfCurrentWindow[tabId] = new YoutubeWatchTabInfo(tab);
    } 
    if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].contentScriptReady) sendMessageToTab(tabId, "sendContentScriptReady", "Requesting contentScriptReady");
    else if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].metadataLoaded){
        youtubeWatchTabsInfosOfCurrentWindow[tabId].status = "loading"
        sendMessageToTab(tabId, "sendMetadataLoaded", "Requesting metaDataLoaded");
        setTimeout(() => {loadYoutubeWatchTabState(tabId)}, 3500)
    }
    else loadYoutubeWatchTabState(tabId);
}

function handleTabChangeToNonYoutubeWatchTab(tabId, tab) {
    console.log(`Youtube tab changed to non youtube tab with id ${tab.id}`);
    delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
}

function handleRemovedTab(tabId, removeInfo) {
    console.log(`Tab with url ${removeInfo.url} was removed`);
    delete tabUrls[tabId]
    deleteFromYoutubeWatchTabIfInYoutubeWatchTabsInfos(tabId);
}

async function deleteFromYoutubeWatchTabIfInYoutubeWatchTabsInfos(tabId){
    if (youtubeWatchTabsInfosOfCurrentWindow[tabId]) {
        delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
    }
}

function handleDetachedTab(tabId, removeInfo) {
    console.log(`Tab with url ${removeInfo.url} was detached`);
    delete tabUrls[tabId]
    deleteFromYoutubeWatchTabIfInYoutubeWatchTabsInfos(tabId);
}

function handleReplacedTab(addedTabId, removedTabId) {
    // Get the details of the new tab
    chrome.tabs.get(addedTabId, (tab) => {
        console.log(`Tab with id ${removedTabId} was replaced with tab with id ${addedTabId}, URL: ${tab.url}`);
        delete youtubeWatchTabsInfosOfCurrentWindow[removedTabId];
        loadYoutubeWatchTab(tab);
    });
}

async function sortTabs() {
    try {
        // Separate tabs into Youtube watch, other Youtube, and non-Youtube tabs
        let tabs = await chrome.tabs.query({currentWindow: true});

        let youtubeShortsTabs = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com/shorts"));
        let youtubeWatchTabs = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com/watch"));
        let otherYoutubeTabs = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com") && !tab.url.startsWith("https://www.youtube.com/watch") && !tab.url.startsWith("https://www.youtube.com/shorts"));
        let nonYoutubeTabs = tabs.filter(tab => !tab.url.startsWith("https://www.youtube.com"));

        let pinnedTabs = await chrome.tabs.query({currentWindow: true, pinned: true});

        let startIndex = pinnedTabs.length;

        await moveTabs(youtubeShortsTabs, null, startIndex);

        startIndex += youtubeShortsTabs.length;

        const remainingTimes = getRemainingTimesFromYoutubeWatchTabsInfos();
        await moveTabs(youtubeWatchTabs, remainingTimes, startIndex);

        startIndex += youtubeWatchTabs.length;

        await moveTabs(otherYoutubeTabs, null, startIndex);

        startIndex += otherYoutubeTabs.length;

        let groups = groupTabsByDomain(nonYoutubeTabs);

        for (let group of groups) {
            await moveTabs(group, null, startIndex);
            startIndex += group.length;
        }
    } catch (error) {
        console.error(`Error sorting tabs ${error}`);
    }
}

async function moveTabs(tabs, remainingTimes, startIndex) {
    if (remainingTimes) {
        tabs.sort((a, b) => remainingTimes[a.id] - remainingTimes[b.id]);
    }

    for (let i = 0; i < tabs.length; i++) {
        try {
            await new Promise((resolve, reject) => {
                chrome.tabs.move(tabs[i].id, {index: startIndex + i}, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        console.log(`%cMoved tab with url ${tabs[i].url} to index ${startIndex + i}`, "color: green");
                        resolve(result);
                    }
                });
            });
        } catch (error) {
            console.error(`Could not move tab with url ${tabs[i].url}: ${error}`);
        }
    }
}

function groupTabsByDomain(tabs) {
    let groups = {};

    for (let tab of tabs) {
        let domain = new URL(tab.url).hostname;
        if (domain === "") domain = "chrome"; // Treating chrome:// tabs as the same domain
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(tab);
    }

    return Object.values(groups); // Return array of groups
}

async function getTab(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tab);
        }
      });
    });
}

function getTabsInWindow(queryInfo) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(tabs);
            }
        });
    });
}
//#endregion