let contentScriptReadyAckReceived = false;

chrome.runtime.onMessage.addListener(handleMessage);

window.addEventListener('load', () => {
    addMetadataLoadedListener();
    sendContentScriptReady();
});

//#region Functions
async function handleSendDetailsRequest(sendResponse) {
    logAndSend('info', "sendDetails request received");
    const details = await getVideoDetails();
    sendResponse({
        remainingTime: details.remainingTime,
        title: details.title
    });
    logAndSend('info', "Details (remaining time and title) sent");
}

async function handleSendRemainingTimeRequest(sendResponse) {
    logAndSend('info', "sendRemainingTime request received");
    const remainingTime = await getRemainingTimeOfVideo();
    sendResponse({remainingTime: remainingTime});
    logAndSend('info', "Remaining time sent");
}

function handleSendContentScriptReadyRequest() {
    logAndSend('info', "sendContentScriptReady request received")
    sendContentScriptReady();
}

function handleSendMetadataLoadedRequest() {
    logAndSend('info', "sendMetadataLoaded request received")
    addMetadataLoadedListener();
}

async function handleMessage(request, sender, sendResponse) {
    try {
        switch (request.action) {
            case "sendDetails":
                await handleSendDetailsRequest(sendResponse);
                break;
            case "sendRemainingTime":
                await handleSendRemainingTimeRequest(sendResponse);
                break;
            case "sendContentScriptReady":
                handleSendContentScriptReadyRequest();
                break;
            case "sendMetadataLoaded":
                handleSendMetadataLoadedRequest();
                break;
            default:
                throw new Error(`Unknown request action: ${request.action}`);
        }
    } catch (error) {
        logAndSend('error', `An error occurred while handling the ${request.action} request: ${error.message}`);
        sendResponse({
            error: `An error occurred while handling the ${request.action} request: ${error.message}`
        });
    }

    // Indicate that the response will be sent asynchronously
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

        chrome.runtime.sendMessage({action: "logMessage", type, message: formattedMessage});
    } else {
        logAndSend('error', "Message is undefined");
    }
}

async function getVideoDetails(attempts = 0, maxAttempts = 100) {
    try {
        const video = await getVideo(attempts, maxAttempts); 
        const titleElement = document.querySelector('title');

        //  if (video && titleElement){
        //     logAndSend('info', "Video (Video duration " + video.duration + ", Video current Time " + video.currentTime +") and title element found");
        //  } 

        const remainingTime = video.duration - video.currentTime;
        const title = titleElement.innerHTML;

        if (isNaN(remainingTime)) {
            logAndSend('info', "Remaining time is NaN");
            throw new Error("Invalid remaining time.");
        } 

        //logAndSend('info', "Remaining time calculated: " + remainingTime );
        //logAndSend('info', "Returning remaining time and title");

        return {remainingTime, title};
    } catch (error) {
        if (attempts < maxAttempts) {
            logAndSend('info', "Video not ready yet, will check again. attempts: " + attempts + "error: " + error);
            await new Promise(resolve => setTimeout(resolve, 100));
            return getVideoDetails(attempts + 1);
        } 
        else {
            throw new Error("Maximum attempts reached.");
        }
    }
}

async function getVideo(attempts = 0, maxAttempts = 100, waitTime = 100) {
    const video = document.querySelector("video");

    if (video && video.readyState >= 2) {
        logAndSend('info', "Video element found and metadata loaded");
        return video;
    }

    if (attempts >= maxAttempts) {
        throw new Error("Maximum attempts reached. Needed elements ");
    }

    if (!video) {
        logAndSend('error', "Video element not found");
    } 
    else {
        logAndSend('error', "Video Meta data not loaded")
    }

    await sleep(waitTime);
    return getVideo(attempts + 1, maxAttempts, waitTime);
}

async function sleep(duration) {
    return new Promise(resolve => setTimeout(resolve, duration));
}

async function getRemainingTimeOfVideo(attempts = 0, maxAttempts = 100){
    try {
        const video = await getVideo(attempts, maxAttempts); 

         if (video){
           // logAndSend('info', "Video (Video duration " + video.duration + ", Video current Time " + video.currentTime +") found");
         }

        const remainingTime = video.duration - video.currentTime;

        if (isNaN(remainingTime)) {
           // logAndSend('info', "Remaining time is NaN");
            throw new Error("Invalid remaining time.");
        } 

       // logAndSend('info', "Remaining time calculated: " + remainingTime );
       // logAndSend('info', "Returning remaining time");

        return remainingTime;
    } catch (error) {
        if (attempts < maxAttempts) {
            logAndSend('info', "Video not ready, will check again. attempts: " + attempts + "error: " + error);
            await new Promise(resolve => setTimeout(resolve, 100));
            return getVideoDetails(attempts + 1);
        } 
        else {
            throw new Error("Maximum attempts reached.");
        }
    }
}

async function sendContentScriptReady() {
    try {
        chrome.runtime.sendMessage({message: "contentScriptReady"}, response =>        {
            logAndSend('info', "contentScriptReady message sent");
            if (!response || response.message !== "contentScriptAck") {
                logAndSend('info', "contentScriptAck message not received, sending another contentScriptReady message");
            }
            else {
                logAndSend('info', `contentScriptAck message received. ${(!contentScriptReadyAckReceived) ? "Sending of contentScriptReady message ceased" : ""}`);
                contentScriptReadyAckReceived = true;
            }
        });
    } catch (error) {
        logAndSend('error', 'An error occurred sending contentScriptReady message: ' + error.message);
    }
}

async function addMetadataLoadedListener() {
    try {
        const video = document.querySelector('video');
        if (!video) {
            throw new Error('Could not find video element on the page.');
        }

        if (video.readyState >= 2){
            logAndSend('info', "Metadata already loaded");
            chrome.runtime.sendMessage({message: 'metadataLoaded'});
            return;
        }

        logAndSend('info', "Metadata not loaded yet, adding event listener");

        video.addEventListener('loadedmetadata', () => metadataLoadedListener(video));
    } catch (error) {
        console.error('Error in content script:', error);
    }
}

function metadataLoadedListener(video) {
    logAndSend('info from listener', "Metadata loaded");
    chrome.runtime.sendMessage({message: 'metadataLoaded'});
    video.removeEventListener('loadedmetadata', () => metadataLoadedListener(video));
}
//#endregion
