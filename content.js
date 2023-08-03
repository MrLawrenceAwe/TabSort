chrome.runtime.onMessage.addListener(handleMessage);

window.addEventListener('load', () => initialise());

//#region Functions
async function initialise() {
    addMetadataLoadedListener();
    sendContentScriptReady();
}

async function handleMessage(request, sender, sendResponse) {
    //#region Inner Functions
    async function handleSendDetailsRequest(sendResponse) {
        const details = await getVideoDetails();
        sendResponse({
            remainingTime: details.remainingTime,
            title: details.title
        });
    }
    
    async function handleSendRemainingTimeRequest(sendResponse) {
        const remainingTime = await getRemainingTimeOfVideo();
        sendResponse({remainingTime: remainingTime});
    }
    
    function handleSendContentScriptReadyRequest() {
        sendContentScriptReady();
    }
    
    function handleSendMetadataLoadedRequest() {
        addMetadataLoadedListener();
    }
    //#endregion 

    const handlerMap = {
        'sendDetails': { handler: handleSendDetailsRequest, async: true },
        'sendRemainingTime': { handler: handleSendRemainingTimeRequest, async: true },
        'sendContentScriptReady': { handler: handleSendContentScriptReadyRequest, async: false },
        'sendMetadataLoaded': { handler: handleSendMetadataLoadedRequest, async: false },
    };

    try {
        if (handlerMap.hasOwnProperty(request.action)) {
            const handlerData = handlerMap[request.action];

            if (handlerData.async) {
                await handlerData.handler(sendResponse);
            } else {
                handlerData.handler(sendResponse);
            }
        } else {
            throw new Error(`Unknown request action: ${request.action}`);
        }
    } catch (error) {
        logAndSend('error', `An error occurred while handling the ${request.action} request: ${error.message}`);
        sendResponse({
            error: `An error occurred while handling the ${request.action} request: ${error.message}`
        });
    }

    // Indicates that the response will be sent asynchronously
    return true;
}

function logAndSend(type, message) {
    if (message !== undefined) {
        const formattedMessage = typeof message === 'string' ? message : (message.message || JSON.stringify(message));
        
        if (typeof console[type] === 'function') {
            console[type](formattedMessage);
        } else {
            console.log(formattedMessage);
        }

        chrome.runtime.sendMessage({action: "logMessage", type, info: formattedMessage});
    } else {
        logAndSend('error', "Message is undefined");
    }
}

async function getVideoDetails(maxAttempts = 100) {
    try {
        const video = await getVideoWithLoadedMetadata(0, maxAttempts);
        const titleElement = document.querySelector('title');

        const remainingTime = calculateRemainingTime(video);
        const title = titleElement.innerHTML;

        if (isNaN(remainingTime)) {
            throw new Error("Invalid remaining time.");
        } 

        return {remainingTime, title};
    } catch (error) {
        throw new Error("Error getting video details: " + error.message);
    }
}

async function getVideoWithLoadedMetadata(attempts = 0, maxAttempts = 100, waitTime = 100) {
    const video = document.querySelector("video");

    if (video && video.readyState >= 2) {
        return video;
    } else if (attempts >= maxAttempts) {
        throw new Error("Maximum attempts reached. Needed video element or metadata not available");
    }

    await new Promise(resolve => setTimeout(resolve, waitTime));
    return getVideoWithLoadedMetadata(attempts + 1, maxAttempts, waitTime);
}

async function sleep(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

async function getRemainingTimeOfVideo(maxAttempts = 100) {
    try {
        const video = await getVideoWithLoadedMetadata(0, maxAttempts);
        const remainingTime = calculateRemainingTime(video);

        if (isNaN(remainingTime)) {
            throw new Error("Invalid remaining time.");
        } 

        return remainingTime;
    } catch (error) {
        throw new Error("Error getting remaining time: " + error.message);
    }
}

function calculateRemainingTime(video) {
    //#region Inner Function
    function isLiveStream() {
        const hasLiveBadge = document.querySelector('.ytp-live');
        return hasLiveBadge;
    }
    //#endregion

    return (!isLiveStream()) ? (video.duration - video.currentTime) : 172800.5;
}

async function sendContentScriptReady() {
    try {
        chrome.runtime.sendMessage({message: "contentScriptReady"});
    } catch (error) {
        logAndSend('error', 'An error occurred sending contentScriptReady message: ' + error.message);
    }
}

async function addMetadataLoadedListener() {
    //#region Inner Functions
    function metadataLoadedListener(video) {
        chrome.runtime.sendMessage({message: 'metadataLoaded'});
        video.removeEventListener('loadedmetadata', () => metadataLoadedListener(video));
    }
    //#endregion  

    try {
        const video = document.querySelector('video');
        if (!video) {
            throw new Error('Could not find video element on the page.');
        }

        if (video.readyState >= 2){
            chrome.runtime.sendMessage({message: 'metadataLoaded'});
            return;
        }


        video.addEventListener('loadedmetadata', () => metadataLoadedListener(video));
    } catch (error) {
        console.error('Error in content script:', error);
    }
}
//#endregion