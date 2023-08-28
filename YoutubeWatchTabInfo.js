export default class YoutubeWatchTabInfo {
    constructor(tab = {}) {
      this.url = tab.url || null;
      this.index = tab.index || null;
      this.id = tab.id || null;
      this.status = tab.status || null;
      this.videoDetails = null;
      this.metadataLoaded = false;
      this.contentScriptReady = false;
      this.unsuspendedTimeStamp = null;
    }
}