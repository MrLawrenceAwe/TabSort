/**
 * Central handler registry for background script messages.
 * Re-exports all handlers for easy import.
 */

export { activateTab, reloadTab } from './tab-actions.js';
export {
    buildForceOption,
    handleUpdateYoutubeWatchTabRecords,
    handleSendTabRecords,
    handleAreTabsInCurrentWindowKnownToBeSorted,
    handleSortTabs,
} from './records-handler.js';
export {
    canUseSenderWindow,
    handleContentScriptReady,
    handleMetadataLoaded,
    handleLightweightDetails,
} from './content-script.js';
