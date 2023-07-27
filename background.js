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
initialiseTabUrls();

let lastFocusedChromeWindowId;
initialiseLastFocusedChromeWindowId();

let windowsOfYoutubeWatchTabsInfos = new WindowsOfYoutubeWatchTabsInfos();
let nonChromeWindowInFocus = false;

initialiseWindowsListeners();

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
    chrome.tabs.onMoved.addListener(handleMovedTab);
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

async function initialiseLastFocusedChromeWindowId(){
    lastFocusedChromeWindowId = await getCurrentWindowId();
}

function initialiseWindowsListeners(){
    chrome.windows.onFocusChanged.addListener((newWindowId) => {
        if (lastFocusedChromeWindowId !== undefined) {
            windowsOfYoutubeWatchTabsInfos[lastFocusedChromeWindowId] = JSON.parse(JSON.stringify(youtubeWatchTabsInfosOfCurrentWindow));
        }
        if (newWindowId !== chrome.windows.WINDOW_ID_NONE) {
            nonChromeWindowInFocus = false;
            console.log("Chrome Window In Focus");
            if (!windowsOfYoutubeWatchTabsInfos[newWindowId]) {
                windowsOfYoutubeWatchTabsInfos[newWindowId] = new YoutubeWatchTabsInfos();
            }
            youtubeWatchTabsInfosOfCurrentWindow = windowsOfYoutubeWatchTabsInfos[newWindowId];
            lastFocusedChromeWindowId = newWindowId;
        }
        else {
            console.log("Non Chrome Window In Focus");
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
            loadYoutubeWatchTab(sender.tab);
            youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].contentScriptReady = true;
            sendMessageToTab(sender.tab.id, "sendMetadataLoaded");

        
            sendResponse({message: "contentScriptAck"});
        }

        async function handleMetadataLoaded() {
            if (youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id]) {
                youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].metadataLoaded = true;
                loadYoutubeWatchTabState(sender.tab.id)
        
                let videoDetails;
                if (!youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].videoDetails?.title){
                    videoDetails = await getYoutubeWatchTabVideoDetailsFromTab(sender.tab);
                    if (videoDetails.remainingTime == 172800.5){ //Live stream number
                        youtubeWatchTabsInfosOfCurrentWindow[sender.tab.id].isLiveStream = true;
                    }  

                    loadYoutubeWatchTabVideoDetails(sender.tab, videoDetails);
                }
            } else {
                throw new Error(`Received metadataLoaded message from tab with url ${sender.tab.url}, but no tab info was found`);
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
            } else {
                console.log(`Message from popup script ${message.info}`)
            }
        },
        sendTabsInfos: () => {
            for (let id in youtubeWatchTabsInfosOfCurrentWindow) {
                if (youtubeWatchTabsInfosOfCurrentWindow[id].metadataLoaded && !youtubeWatchTabsInfosOfCurrentWindow[id].isLiveStream){
                    loadYoutubeWatchTabState(parseInt(id));
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
    //#region Inner Function
    function setTabState(tab, status) {
        if (!youtubeWatchTabsInfosOfCurrentWindow[tab.id]) {
            youtubeWatchTabsInfosOfCurrentWindow[tab.id] = new YoutubeWatchTabInfo();
        }
        youtubeWatchTabsInfosOfCurrentWindow[tab.id].status = status;
    }
    //#endregion 

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

async function getYoutubeWatchTabVideoDetailsFromTab(tab, retryCount = 0) {
    const MAX_RETRIES = 20; 

    async function handleResponse(response){
        async function checkForErrorWithResponse() {
            if (response.remainingTime !== undefined && response.title !== undefined) {
                return;
            } 
            else if (response.error) {
                console.error(`An error occurred in the content script for tab with url ${tab.url} : ${response.error}`);
                throw new Error(response.error);
            }
        }

        if (response) {
            console.log("Video details received from content script for tab with url " + tab.url + " : " + JSON.stringify(response));
            try {
                await checkForErrorWithResponse();
            } catch (error) {
                console.error(error)
            }
            return response;
        }
        else {
            console.error("no response received from content script for tab with url " + tab.url);
            if (retryCount <= MAX_RETRIES) {
                console.log(`Retry count: ${retryCount}`)
                return await getYoutubeWatchTabVideoDetailsFromTab(tab, retryCount+1);
            } else {
                throw new Error(`Max getYoutubeWatchTabVideoDetailsFromTab retry attempts reached for tab with url ${tab.url}`);
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

async function loadYoutubeWatchTabVideoDetails(tab,videoDetails) {
    if (!youtubeWatchTabsInfosOfCurrentWindow[tab.id]) {
        youtubeWatchTabsInfosOfCurrentWindow[tabId] = new YoutubeWatchTabInfo();
    }
    
    youtubeWatchTabsInfosOfCurrentWindow[tab.id].videoDetails = {
        ...youtubeWatchTabsInfosOfCurrentWindow[tab.id].videoDetails,
        ...videoDetails
    };
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
                    console.log(`Tab with url ${tab.url}  not in youtubeWatchTabs, found in current window. Attempting to load`);
                    loadYoutubeWatchTab(tab);
                }
            }

            function removeObsoleteTabsInfos(id) {
                if (!currentWindowTabIds.has(parseInt(id))) {
                    console.log(`Tab with id ${id} found in youtubeWatchTabs but not in current window. Removing from youtubeWatchTabs`);
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
            return !a[1].videoDetails && !b[1].videoDetails ? 0 : !a[1].videoDetails ? 1 : -1;
        }

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

    const updatedTabIsYoutubeWatchTab = changeInfo.url?.startsWith('https://www.youtube.com/watch');
    const updatedTabWasYoutubeWatchTab = youtubeWatchTabsInfosOfCurrentWindow[tabId]
    
    if (updatedTabIsYoutubeWatchTab) {
        handleTabUpdateToYoutubeWatchTab(tabId, tab, changeInfo.url);
    } else if (updatedTabWasYoutubeWatchTab) {
        if (changeInfo.url) handleTabUpdateToNonYoutubeWatchTab(tabId, tab);
    }
}

function handleTabUpdateToYoutubeWatchTab(tabId, tab) {
    console.log(`%cA tab has been updated to youtube watch tab with id ${tab.id}. tabId: ${tab.id}`, "color: orange");
    if (!youtubeWatchTabsInfosOfCurrentWindow[tabId]){
        youtubeWatchTabsInfosOfCurrentWindow[tabId] = new YoutubeWatchTabInfo(tab);
    } 
    if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].contentScriptReady){
        sendMessageToTab(tabId, "sendContentScriptReady");
        loadYoutubeWatchTabState(tabId);
    }
    else if (!youtubeWatchTabsInfosOfCurrentWindow[tabId].metadataLoaded){
        sendMessageToTab(tabId, "sendMetadataLoaded");
        loadYoutubeWatchTabState(tabId)
    }
    else loadYoutubeWatchTabState(tabId);
}

function handleTabUpdateToNonYoutubeWatchTab(tabId, tab) {
    console.log(`Youtube tab changed to non youtube tab with id ${tab.id}`);
    delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
}

function handleRemovedTab(tabId, removeInfo) {
    console.log(`Tab with url ${removeInfo.url} was removed`);
    delete tabUrls[tabId]
    deleteFromYoutubeWatchTabInfosIfInYoutubeWatchTabsInfos(tabId);
}

function handleMovedTab(tabId,moveInfo){
    console.log(`Tab with id: ${tabId} is moved. New index: ${moveInfo.toIndex}`)

    youtubeWatchTabsInfosOfCurrentWindow[tabId].index = moveInfo.toIndex;
}

async function deleteFromYoutubeWatchTabInfosIfInYoutubeWatchTabsInfos(tabId){
    if (youtubeWatchTabsInfosOfCurrentWindow[tabId]) {
        delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
    }
}

function handleDetachedTab(tabId, removeInfo) {
    console.log(`Tab with url ${removeInfo.url} was detached`);
    delete tabUrls[tabId]
    deleteFromYoutubeWatchTabInfosIfInYoutubeWatchTabsInfos(tabId);
}

function handleReplacedTab(addedTabId, removedTabId) {
    // Get the details of the new tab
    chrome.tabs.get(addedTabId, (tab) => {
        console.log(`Tab with id ${removedTabId} was replaced with tab with id ${addedTabId}, URL: ${tab.url}`);
        if (youtubeWatchTabsInfosOfCurrentWindow[removedTabId]){
            delete youtubeWatchTabsInfosOfCurrentWindow[removedTabId];
            loadYoutubeWatchTab(tab);
        }
    });
}

async function updateTabsInCurrentWindowAreKnownToBeSorted() {
    //#region Inner Functions
        function categorizeTabs(tabsInWindow) {
            const youtubeShortsTabs = [];
            const youtubeWatchTabs = [];
            const otherYoutubeTabs = [];
            const nonYoutubeTabs = [];
        
            tabsInWindow.forEach(tab => {
                if (tab.url.startsWith("https://www.youtube.com/shorts")) {
                    youtubeShortsTabs.push(tab);
                } else if (tab.url.startsWith("https://www.youtube.com/watch")) {
                    youtubeWatchTabs.push(tab);
                } else if (tab.url.startsWith("https://www.youtube.com")) {
                    otherYoutubeTabs.push(tab);
                } else {
                    nonYoutubeTabs.push(tab);
                }
            });
        
            return [youtubeShortsTabs, youtubeWatchTabs, otherYoutubeTabs, nonYoutubeTabs];
        }
        
        function areTabsInPlace(tabs, startIndex, tabsInWindow, tabsCategory) {
            const tabsAreInPlace = tabs.every((tab, i) => tab === tabsInWindow[startIndex + i]);
        
            if (!tabsAreInPlace) {
                console.log(`${tabsCategory} tabs are not in the correct position.`);
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
                    console.log("Youtube watch tabs are not known to be sorted by remaining time.");
                    tabsInCurrentWindowAreKnownToBeSorted = false;
                    return false;
                }
            }
            return true;
        }
        
        function areNonYoutubeTabsGroupedByDomain(nonYoutubeTabs, startIndex, tabsInWindow) {
            let groups = {};
            nonYoutubeTabs.forEach((tab) => {
                let url = new URL(tab.url);
                if (!groups[url.hostname]) groups[url.hostname] = [];
                groups[url.hostname].push(tab);
            });
        
            let lastHostname = null;
            let highestNonYoutubeTabIndex = (nonYoutubeTabs.length > 0) ?
                Math.max(...nonYoutubeTabs.map(tab => tabsInWindow.indexOf(tab))) :
                startIndex - 1;
            for (let tab of tabsInWindow.slice(startIndex, highestNonYoutubeTabIndex + 1)) {
                let currentHostname = new URL(tab.url).hostname;
                if (lastHostname !== null &&
                    lastHostname !== currentHostname &&
                    groups[lastHostname].length > 0) {
                    console.log("Non-Youtube tabs are not grouped by domain.");
                    tabsInCurrentWindowAreKnownToBeSorted = false;
                    return false;
                }
                let index = groups[currentHostname].findIndex(t => t.id === tab.id);
                if (index !== -1) groups[currentHostname].splice(index, 1);
                else {
                    console.log("Non-Youtube tabs are not grouped by domain.");
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

    if (!areTabsInPlace(otherYoutubeTabs, startIndex, tabsInWindow, "Other Youtube")) 
        return tabsInCurrentWindowAreKnownToBeSorted = false;
    
    startIndex += otherYoutubeTabs.length;

    if (!areNonYoutubeTabsGroupedByDomain(nonYoutubeTabs, startIndex, tabsInWindow))
        return tabsInCurrentWindowAreKnownToBeSorted = false;

    return tabsInCurrentWindowAreKnownToBeSorted = true;
}

async function sortTabs() {
    try {
        // Separate tabs into Youtube watch, other Youtube, and non-Youtube tabs
        let tabs = await chrome.tabs.query({currentWindow: true});

        let youtubeShortsTabs = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com/shorts"));
        let youtubeWatchTabsWithRemainingTimes = tabs.filter(tab => tab.url.startsWith("https://www.youtube.com/watch") && youtubeWatchTabsInfosOfCurrentWindow[tab.id]?.videoDetails?.remainingTime);

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