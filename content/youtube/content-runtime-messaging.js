import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { collectPageVideoDetails } from './video-details.js';

export function createContentRuntimeMessaging({ config, environment, getChrome, getLocation }) {
  function logContentError(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[TabSort] ${context}: ${message}`);
  }

  function hasExtensionRuntime() {
    return Boolean(getChrome()?.runtime?.id);
  }

  function sendExtensionMessage(payload, context) {
    if (!hasExtensionRuntime()) return false;
    try {
      getChrome().runtime.sendMessage(payload);
      return true;
    } catch (error) {
      if (context) logContentError(`Sending ${context}`, error);
      return false;
    }
  }

  function getCurrentPageUrl() {
    return getLocation()?.href || '';
  }

  function collectPageDetails() {
    return collectPageVideoDetails({
      environment,
      inferIsLiveNow: config.inferIsLiveNow,
      logContentError,
    });
  }

  function publishPageVideoDetails() {
    try {
      const details = collectPageDetails();
      if (details.title || details.lengthSeconds != null || details.isLive) {
        sendExtensionMessage(
          createRuntimeMessage(RUNTIME_MESSAGE_TYPES.PAGE_VIDEO_DETAILS, { details }),
          'page video details',
        );
      }
    } catch (error) {
      logContentError('Sending page video details', error);
    }
  }

  return {
    collectPageDetails,
    getCurrentPageUrl,
    hasExtensionRuntime,
    logContentError,
    publishPageVideoDetails,
    sendExtensionMessage,
  };
}
