import WindowsOfYoutubeWatchTabsInfos from './WindowsOfYoutubeWatchTabsInfos.js';
import YoutubeWatchTabInfo from './YoutubeWatchTabInfo.js';
import YoutubeWatchTabsInfos from './YoutubeWatchTabsInfos.js';

let youtubeWatchTabsInfosOfCurrentWindow = new YoutubeWatchTabsInfos();
populateYoutubeWatchTabsInfosOfCurrentWindow();

let youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime;

chrome.runtime.onMessage.addListener(handleMessage);

initialiseTabsListeners();

let tabsInCurrentWindowAreKnownToBeSorted = false;

let tabUrls = {};
let tabIndexes = {};
initialiseTabUrlsAndIndexes();

let lastFocusedChromeWindowId
initialiselastFocusedChromeWindowId();

let windowsOfYoutubeWatchTabsInfos;
initialiseWindowsOfYoutubeWatchTabsInfos()

let nonChromeWindowInFocus = false;

initialiseWindowsListeners();

//#region Functions
async function populateYoutubeWatchTabsInfosOfCurrentWindow(){
    try {
        const tabs = await getTabsInWindow({currentWindow: true, url: "*://*.youtube.com/watch*"});
        tabs.forEach(loadYoutubeWatchTabInfoIntoYoutubeWatchTabsInfosOfCurrentWindow);
    } catch (error) {
        console.error(error);
    }
}

async function initialiseTabsListeners(){
    chrome.tabs.onUpdated.addListener(handleUpdatedTab);
    chrome.tabs.onRemoved.addListener(handleRemovedTab);
    chrome.tabs.onDetached.addListener(handleDetachedTab);
    chrome.tabs.onReplaced.addListener(handleReplacedTab);
    chrome.tabs.onMoved.addListener(handleMovedTab);
    chrome.tabs.onAttached.addListener(handleAttachedTab)
    chrome.tabs.onCreated.addListener(handleCreatedTab);
}

function initialiseTabUrlsAndIndexes(){
    chrome.tabs.query({}, (tabs) => {
        for (let tab of tabs) {
            tabUrls[tab.id] = tab.url;
            tabIndexes[tab.id] = tab.index
        }
    });
}

async function getCurrentWindowId() {
    let window = await chrome.windows.getCurrent();
    return window.id;
}

async function initialiselastFocusedChromeWindowId(){
    let currentWindowId = await getCurrentWindowId();
    lastFocusedChromeWindowId = currentWindowId;
}

async function initialiseWindowsOfYoutubeWatchTabsInfos() {
    let currentWindowId = await getCurrentWindowId();
    windowsOfYoutubeWatchTabsInfos = new WindowsOfYoutubeWatchTabsInfos();
    windowsOfYoutubeWatchTabsInfos[currentWindowId] = youtubeWatchTabsInfosOfCurrentWindow
}

function initialiseWindowsListeners(){
    chrome.windows.onFocusChanged.addListener((newWindowId) => {
        if (lastFocusedChromeWindowId !== undefined) {
            windowsOfYoutubeWatchTabsInfos[lastFocusedChromeWindowId] = JSON.parse(JSON.stringify(youtubeWatchTabsInfosOfCurrentWindow));
        }
        if (newWindowId !== chrome.windows.WINDOW_ID_NONE) {
            nonChromeWindowInFocus = false;
            if (!windowsOfYoutubeWatchTabsInfos[newWindowId]) {
                windowsOfYoutubeWatchTabsInfos[newWindowId] = new YoutubeWatchTabsInfos();
            }
            youtubeWatchTabsInfosOfCurrentWindow = windowsOfYoutubeWatchTabsInfos[newWindowId];
            lastFocusedChromeWindowId = newWindowId;
        }
        else {
            nonChromeWindowInFocus = true;
        } 
    });
    
    chrome.windows.onRemoved.addListener((removedWindowId) => {
        if (windowsOfYoutubeWatchTabsInfos[removedWindowId])
        delete windowsOfYoutubeWatchTabsInfos[removedWindowId]
    });
}

function handleMessage(message, sender, sendResponse){
    //#region INNER FUNCTIONS
        function logMessage(message, url, color = 'color: purple;') {
            console.log(`%cMessage from content script on tab with url ${url}:`, color, message);
        }

        function errorMessage(message, url) {
            console.error(`Error from content script on tab with url ${url}:`, message);
        }

        function handleContentScriptReady() {
            if(youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].contentScriptReady) return;
            loadYoutubeWatchTabInfoIntoYoutubeWatchTabsInfosOfCurrentWindow(sender.tab);
            youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].contentScriptReady = true;
            sendMessageToTab(sender.tab.id, "sendMetadataLoaded");

        
            sendResponse({message: "contentScriptAck"});
        }

        async function handleMetadataLoaded() {
            try {
                if (youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id]) {
                    youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].metadataLoaded = true;
                    loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(sender.tab.id)
            
                    let videoDetails;
                    if (!youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].videoDetails?.title){
                        videoDetails = await getYoutubeWatchTabVideoDetailsFromTab(sender.tab);
                        if (videoDetails.remainingTime == 172800.5) //Live stream number
                            youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].isLiveStream = true;
            
                        processVideoDetails(videoDetails)
            
                        loadYoutubeWatchTabVideoDetailsIntoYoutubeWatchTabsInfosOfCurrentWindow(sender.tab, videoDetails);
                    }
                } else {
                    throw new Error(`Received metadataLoaded message from tab with url ${sender.tab.url}, but no tab info was found`);
                }
            } catch (error) {
                console.error(error)
            }
        }
    //#endregion

    message.message = message.action || message.message;

    const handlers = {
        logMessage: () => {
            if (message.type === "error") {
                errorMessage(message.info, sender.tab.url);
            } else {
                logMessage(message.info, sender.tab.url);
            }
        },
        logPopupMessage: () => {
            if (message.type === "error") {
                console.error(`error from popup script ${message.info}`)
            } 
        },
        sendTabsInfos: () => {
            for (let id in youtubeWatchTabsInfosOfCurrentWindow) {
                if (youtubeWatchTabsInfosOfCurrentWindow[id].metadataLoaded && !youtubeWatchTabsInfosOfCurrentWindow[id].isLiveStream){
                    loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(parseInt(id));
                    updateRemainingTimeOfVideo(parseInt(id));
                }
            }

            updateYoutubeWatchTabsInfosOfCurrentWindowIdsSortedByRemainingTime()

            sendResponse({youtubeWatchTabsInfosOfCurrentWindow, youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime});
        },
        activateTab: () => {
            chrome.tabs.update(message.tabId, { active: true });
        },
        sortTabs: () => {
            sortTabs();
        },
        updateYoutubeWatchTabsInfos: () => {
            if (nonChromeWindowInFocus) return; 
            updateYoutubeWatchTabsInfos()
        },
        reloadTab: () => {
            chrome.tabs.reload(message.tabId)
            loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(message.tabId);
        },
        contentScriptReady: () => {
            handleContentScriptReady();
        },
        metadataLoaded: () => {
            handleMetadataLoaded();
        },
        areTabsInCurrentWindowKnownToBeSorted: async () => {
            updateTabsInCurrentWindowAreKnownToBeSorted();
            sendResponse(tabsInCurrentWindowAreKnownToBeSorted);
        }
    }

    if(handlers[message.message]) {
        handlers[message.message]();
    }
}

function loadYoutubeWatchTabInfoIntoYoutubeWatchTabsInfosOfCurrentWindow(tab){
    try {
        youtubeWatchTabsInfosOfCurrentWindow[tab.id] = new YoutubeWatchTabInfo(tab) 
        tabIndexes[tab.id] = tab.index;
        loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tab.id);
    } catch (error) {
        console.error(error);
    }
}

async function loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tabId) {
    //#region Inner Function
    function setTabState(tab, status) {
        if (!youtubeWatchTabsInfosOfCurrentWindow[tab.id]) {
            youtubeWatchTabsInfosOfCurrentWindow[tab.id] = new YoutubeWatchTabInfo();
        }
        youtubeWatchTabsInfosOfCurrentWindow[tab.id].status = status;
    }
    //#endregion Inner Function

    try {
        const tab = await getTab(tabId);

        if (tab.discarded || tab.status === "unloaded") {
            setTabState(tab, 'suspended');
        } else if (tab.status === "complete") {
            setTabState(tab, 'unsuspended');
        } else if (tab.status === "loading") {
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
        //#region Inner functions
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
            const response = await getRemainingTimeOfVideoFromTab(tabId);
            if (!response) throw new Error(`Something went wrong getting the remaining time for from tab with URL ${youtubeWatchTabsInfosOfCurrentWindow[tabId].url}`);
            
            youtubeWatchTabsInfosOfCurrentWindow[tabId].videoDetails = {
                ...youtubeWatchTabsInfosOfCurrentWindow[tabId].videoDetails,
                remainingTime: response.remainingTime,
            };
        }
        //#endregion Inner functions

        throwErrorIfNoTabInfo();
        throwErrorIfContentScriptNotReady();
        throwErrorIfMetadataNotLoaded();
        await updateRemainingTime();

    } catch (error) {
        console.error(`Could not get tab or update remaining time for tab with id ${tabId}: ${error}`);
        throw new Error(error)
    }
}

async function getYoutubeWatchTabVideoDetailsFromTab(tab, retryCount = 0) {
    const MAX_RETRIES = 20; 

    async function handleResponse(response){
        async function checkForErrorWithResponse() {
            if (response.remainingTime !== undefined && response.title !== undefined) {
                return;
            } 
            else if (response.error) {
                throw new Error(response.error);
            }
        }

        if (response) {
            try {
                await checkForErrorWithResponse();
            } catch (error) {
                console.error(error)
            }
            return response;
        }
        else {
            if (retryCount <= MAX_RETRIES) {
                return await getYoutubeWatchTabVideoDetailsFromTab(tab, retryCount+1);
            } else {
                throw new Error(`Maximum getYoutubeWatchTabVideoDetailsFromTab retry attempts reached for tab with url ${tab.url}`);
            }
        }
    }

    return new Promise((resolve, reject) => {
        sendMessageToTab(tab.id, "sendDetails", async (response) => {
            try {
                resolve(await handleResponse(response));
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function loadYoutubeWatchTabVideoDetailsIntoYoutubeWatchTabsInfosOfCurrentWindow(tab,videoDetails) {
    if (!youtubeWatchTabsInfosOfCurrentWindow[tab.id]) {
        youtubeWatchTabsInfosOfCurrentWindow[tabId] = new YoutubeWatchTabInfo();
    }
    
    youtubeWatchTabsInfosOfCurrentWindow[tab.id].videoDetails = videoDetails;
}

async function sendMessageToTab(tabId, action, callback) {
    chrome.tabs.sendMessage(tabId, { action }, callback);
}

async function updateYoutubeWatchTabsInfos() {
    try {
        const tabs = await getTabsInWindow({currentWindow: true, url: "*://*.youtube.com/watch*"});
        let currentWindowTabIds = new Set(tabs.map(tab => tab.id));

        //#region Inner Functions
            function loadUntrackedTabsInfos(tab) {
                if (!youtubeWatchTabsInfosOfCurrentWindow.hasOwnProperty(tab.id)) {
                    loadYoutubeWatchTabInfoIntoYoutubeWatchTabsInfosOfCurrentWindow(tab);
                }
            }

            function removeObsoleteTabsInfos(id) {
                if (!currentWindowTabIds.has(parseInt(id))) {
                    delete youtubeWatchTabsInfosOfCurrentWindow[id];
                }
            }
        //#endregion

        tabs.forEach(loadUntrackedTabsInfos);
        Object.keys(youtubeWatchTabsInfosOfCurrentWindow).forEach(removeObsoleteTabsInfos);
        
    } catch (error) {
        console.error(error);
    }
}

function updateYoutubeWatchTabsInfosOfCurrentWindowIdsSortedByRemainingTime(){
    let youtubeWatchTabsInfosArray = Object.entries(youtubeWatchTabsInfosOfCurrentWindow);

    youtubeWatchTabsInfosArray.sort((a, b) => {
        if (!a[1].videoDetails || !b[1].videoDetails) {
            return (!a[1].videoDetails && !b[1].videoDetails) ? 0 : (!a[1].videoDetails ? 1 : -1);
        }

        if (a[1].videoDetails.remainingTime == b[1].videoDetails.remainingTime)
            return a[1].index - b[1].index

        return a[1].videoDetails.remainingTime - b[1].videoDetails.remainingTime;
    });

    youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime = youtubeWatchTabsInfosArray.map(entry => entry[0]);
}

function getRemainingTimeOfVideoFromTab(tabId) {
    return new Promise((resolve, reject) => {
      sendMessageToTab(tabId, "sendRemainingTime", resolve);
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
    }

    return remainingTimes;
}

function listenForLoadingTabComplete(tab) {
    const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tab.id);
        }
    };
    chrome.tabs.onUpdated.addListener(listener);
}

function handleUpdatedTab(tabId, changeInfo, tab) {
    tabUrls[tabId] = changeInfo.url;

    const updatedTabIsYoutubeWatchTab = changeInfo.url?.startsWith('https://www.youtube.com/watch');
    const updatedTabWasYoutubeWatchTab = youtubeWatchTabsInfosOfCurrentWindow[tabId]
    
    if (updatedTabIsYoutubeWatchTab) {
        handleTabUpdateToYoutubeWatchTab(tabId, tab, changeInfo.url, updatedTabWasYoutubeWatchTab);
    } else if (updatedTabWasYoutubeWatchTab) {
        if (changeInfo.url) handleTabUpdateToNonYoutubeWatchTab(tabId, tab);
    }
}

async function handleTabUpdateToYoutubeWatchTab(tabId, tab,tabUrl) {
    
    if (!youtubeWatchTabsInfosOfCurrentWindow[tabId]) {
        youtubeWatchTabsInfosOfCurrentWindow[tabId] = new YoutubeWatchTabInfo(tab);
    } 
    if (youtubeWatchTabsInfosOfCurrentWindow[tabId].metadataLoaded){
        let videoDetails;
        while (videoDetails?.title == "YouTube" || videoDetails == undefined)
            videoDetails = await getYoutubeWatchTabVideoDetailsFromTab(tab);

        if (videoDetails.remainingTime == 172800.5)//Live stream number
            youtubeWatchTabsInfosOfCurrentWindow[tab.id].isLiveStream = true;

        processVideoDetails(videoDetails);
        
        loadYoutubeWatchTabVideoDetailsIntoYoutubeWatchTabsInfosOfCurrentWindow(tab, videoDetails);
        loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tabId)
    }

    if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].contentScriptReady) {
        sendMessageToTab(tabId, "sendContentScriptReady");
        loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tabId);
    }
    else if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].metadataLoaded) {
        sendMessageToTab(tabId, "sendMetadataLoaded");
        loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tabId)
    }
    else loadYoutubeWatchTabStateIntoYoutubeWatchTabsInfosOfCurrentWindow(tabId);
}

async function processVideoDetails(videoDetails) {
    videoDetails.title = videoDetails.title.replace(/&amp;/g, "&");

    if (videoDetails.title.endsWith("- YouTube")) {
        videoDetails.title = videoDetails.title.substring(0, videoDetails.title.length - "- YouTube".length);
    }
}

function handleTabUpdateToNonYoutubeWatchTab(tabId, tab) {
    delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
}

function handleRemovedTab(tabId, removeInfo) {
    delete tabUrls[tabId]
    deleteFromYoutubeWatchTabInfosIfInYoutubeWatchTabsInfos(tabId);
    updateIndexOfAllTabsFromIndex(removeInfo.windowId,tabIndexes[tabId])
    delete tabIndexes[tabId]
}

function handleMovedTab(tabId,moveInfo){
    if (youtubeWatchTabsInfosOfCurrentWindow[tabId]){
        youtubeWatchTabsInfosOfCurrentWindow[tabId].index = moveInfo.toIndex;
        tabIndexes[tabId] = moveInfo.toIndex
    }

    let startIndex = (moveInfo.fromIndex < moveInfo.toIndex) ? moveInfo.fromIndex : (moveInfo.toIndex+1)
    let endIndex = (moveInfo.fromIndex < moveInfo.toIndex) ? (moveInfo.toIndex-1) : moveInfo.fromIndex

    updateIndexOfAllTabsFromIndex(moveInfo.windowId, startIndex, endIndex)
}

async function deleteFromYoutubeWatchTabInfosIfInYoutubeWatchTabsInfos(tabId){
    if (youtubeWatchTabsInfosOfCurrentWindow[tabId]) {
        delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
    }
}

function handleDetachedTab(tabId, detachInfo) {
    delete tabUrls[tabId]
    delete tabIndexes[tabId]
    deleteFromYoutubeWatchTabInfosIfInYoutubeWatchTabsInfos(tabId);
    updateIndexOfAllTabsFromIndex(detachInfo.oldWindowId,detachInfo.oldPosition)
}

function handleAttachedTab(tabId, attachInfo){
    updateIndexOfAllTabsFromIndex(attachInfo.newWindowId, (attachInfo.newPosition+1))
}

async function updateIndexOfAllTabsFromIndex(windowId, startIndex, endIndex = Infinity) {
    let tabsInWindow = await getTabsInWindow({windowId});
    tabsInWindow = tabsInWindow.filter(tab => tab.index >= startIndex && tab.index <= endIndex);
    
    for (const tab of tabsInWindow) {
        const tabInfo = windowsOfYoutubeWatchTabsInfos[windowId]?.[tab.id];
        if (tabInfo) {
            tabInfo.index = tab.index;
            tabIndexes[tab.id] = tab.index
        }
    }
}

function handleReplacedTab(addedTabId, removedTabId) {
    // Get the details of the new tab
    chrome.tabs.get(addedTabId, (tab) => {
        if (youtubeWatchTabsInfosOfCurrentWindow[removedTabId]){
            delete youtubeWatchTabsInfosOfCurrentWindow[removedTabId];
            loadYoutubeWatchTabInfoIntoYoutubeWatchTabsInfosOfCurrentWindow(tab);
        }
    });
}

function handleCreatedTab(tab){
    tabIndexes[tab.id] = tab.index; 
    updateIndexOfAllTabsFromIndex(tab.windowId, tab.index)
}

async function updateTabsInCurrentWindowAreKnownToBeSorted() {
    //#region Inner Functions
        function categorizeTabs(tabsInWindow) {
            const youtubeShortsTabs = [];
            const youtubeWatchTabs = [];
            const otherYoutubeTabs = [];
            const otherTabs = [];

            const tabsInWindowHaveAtLeastOneShortsOrWatchTab = tabsInWindow.some(tab => tab.url.startsWith("https://www.youtube.com/shorts") || tab.url.startsWith("https://www.youtube.com/watch"));
        
            tabsInWindow.forEach(tab => {
                if (tab.url.startsWith("https://www.youtube.com/shorts")) {
                    youtubeShortsTabs.push(tab);
                } else if (tab.url.startsWith("https://www.youtube.com/watch")) {
                    youtubeWatchTabs.push(tab);
                } else if ((tab.url.startsWith("https://www.youtube.com")) && tabsInWindowHaveAtLeastOneShortsOrWatchTab) {
                    otherYoutubeTabs.push(tab);
                } else {
                    otherTabs.push(tab);
                }
            });
        
            return [youtubeShortsTabs, youtubeWatchTabs, otherYoutubeTabs, otherTabs];
        }
        
        function areTabsInPlace(tabs, startIndex, tabsInWindow, tabsCategory) {
            const tabsAreInPlace = tabs.every((tab, i) => tab === tabsInWindow[startIndex + i]);
        
            if (!tabsAreInPlace) {
                tabsInCurrentWindowAreKnownToBeSorted = false;
            }
        
            return tabsAreInPlace;
        }
        
        function areYoutubeWatchTabsSorted(youtubeWatchTabs) {
            let youtubeWatchTabIds = youtubeWatchTabs.map(tab => tab.id);
            for (let i = 0; i < youtubeWatchTabIds.length - 1; i++) {
                let currentRemainingTime = youtubeWatchTabsInfosOfCurrentWindow[youtubeWatchTabIds[i]].videoDetails?.remainingTime;
                let nextRemainingTime = youtubeWatchTabsInfosOfCurrentWindow[youtubeWatchTabIds[i + 1]].videoDetails?.remainingTime;
                if ((currentRemainingTime == undefined || nextRemainingTime == undefined) || currentRemainingTime > nextRemainingTime) {
                    tabsInCurrentWindowAreKnownToBeSorted = false;
                    return false;
                }
            }
            return true;
        }
        
        function areOtherTabsGroupedByDomain(otherTabs, startIndex, tabsInWindow) {
            let groups = {};
            otherTabs.forEach((tab) => {
                let url = new URL(tab.url);
                if (!groups[url.hostname]) groups[url.hostname] = [];
                groups[url.hostname].push(tab);
            });
        
            let lastHostname = null;
            let highestOtherTabIndex = (otherTabs.length > 0) ?
                Math.max(...otherTabs.map(tab => tabsInWindow.indexOf(tab))) :
                startIndex - 1;
            for (let tab of tabsInWindow.slice(startIndex, highestOtherTabIndex + 1)) {
                let currentHostname = new URL(tab.url).hostname;
                if (lastHostname !== null &&
                    lastHostname !== currentHostname &&
                    groups[lastHostname].length > 0) {
                    tabsInCurrentWindowAreKnownToBeSorted = false;
                    return false;
                }
                let index = groups[currentHostname].findIndex(t => t.id === tab.id);
                if (index !== -1) groups[currentHostname].splice(index, 1);
                else {
                    tabsInCurrentWindowAreKnownToBeSorted = false;
                    return false;
                }
                lastHostname = currentHostname;
            }
            return true;
        }
    //#endregion
    
    const tabsInWindow = await getTabsInWindow({ currentWindow: true });
    const pinnedTabs = await chrome.tabs.query({ currentWindow: true, pinned: true });
    let startIndex = pinnedTabs.length;

    const [youtubeShortsTabs, youtubeWatchTabs, otherYoutubeTabs, nonYoutubeTabs] = categorizeTabs(tabsInWindow);

    if (!areTabsInPlace(youtubeShortsTabs, startIndex, tabsInWindow, "Youtube shorts")) 
        return tabsInCurrentWindowAreKnownToBeSorted = false;

    startIndex += youtubeShortsTabs.length;

    if (!areTabsInPlace(youtubeWatchTabs, startIndex, tabsInWindow, "Youtube watch"))
        return tabsInCurrentWindowAreKnownToBeSorted = false;
    
    if (!areYoutubeWatchTabsSorted(youtubeWatchTabs))
        return tabsInCurrentWindowAreKnownToBeSorted = false;

    startIndex += youtubeWatchTabs.length;

    if (youtubeWatchTabs.length != 0 || youtubeShortsTabs.length != 0)
        if (!areTabsInPlace(otherYoutubeTabs, startIndex, tabsInWindow, "Other Youtube"))
            return tabsInCurrentWindowAreKnownToBeSorted = false;
    

    startIndex += otherYoutubeTabs.length;

    if (!areOtherTabsGroupedByDomain(nonYoutubeTabs, startIndex, tabsInWindow))
        return tabsInCurrentWindowAreKnownToBeSorted = false;

    return tabsInCurrentWindowAreKnownToBeSorted = true;
}

async function sortTabs() {
    try {
        let tabs = await chrome.tabs.query({currentWindow: true});

        let youtubeShortsTabs = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com/shorts"));
        let youtubeWatchTabsWithRemainingTimes = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com/watch") && youtubeWatchTabsInfosOfCurrentWindow[tab.id]?.videoDetails?.remainingTime != undefined);

        let youtubeWatchTabsWithRemainingTimesIds = new Set(youtubeWatchTabsWithRemainingTimes.map(tab => tab.id));

        let otherYoutubeTabs = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com") && !youtubeWatchTabsWithRemainingTimesIds.has(tab.id) && !tab.url.startsWith("https://www.youtube.com/shorts"));
        let nonYoutubeTabs = tabs.filter(tab => !tab.url.startsWith("https://www.youtube.com"));

        let pinnedTabs = await chrome.tabs.query({currentWindow: true, pinned: true});

        let startIndex = pinnedTabs.length;

        await moveTabs(youtubeShortsTabs, null, startIndex);

        startIndex += youtubeShortsTabs.length;

        const remainingTimes = getRemainingTimesFromYoutubeWatchTabsInfos();
        await moveTabs(youtubeWatchTabsWithRemainingTimes, remainingTimes, startIndex);

        startIndex += youtubeWatchTabsWithRemainingTimes.length;

        await moveTabs(otherYoutubeTabs, null, startIndex);

        startIndex += otherYoutubeTabs.length;

        let domainGroups = createDomainGroupsFromTabs(nonYoutubeTabs);

        for (let group of domainGroups) {
            await moveTabs(group, null, startIndex);
            startIndex += group.length;
        }

        tabsInCurrentWindowAreKnownToBeSorted = true
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
                        if (youtubeWatchTabsInfosOfCurrentWindow[tabs[i].id]) youtubeWatchTabsInfosOfCurrentWindow[tabs[i].id].index = startIndex + i;
                        resolve(result);
                    }
                });
            });
        } catch (error) {
            console.error(`Could not move tab with url ${tabs[i].url}: ${error}`);
        }
    }
}

function createDomainGroupsFromTabs(tabs) {
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