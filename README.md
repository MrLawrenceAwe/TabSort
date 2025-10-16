# TabSort for YouTube

Chrome extension that keeps YouTube watch tabs organised by the time you still have left in each video. It tracks every watch tab in the current window, gathers the remaining playback times and lets you sort the ready tabs with one click.


## Install (unpacked)
1. Clone or download this repository.
2. Visit `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the project directory (the folder containing `manifest.json`).

## Using the popup
- Open some YouTube watch pages in the same Chrome window, then click the TabSort extension.
- The popup lists each watch tab, shows whether its remaining time is known, and highlights tabs that are ready.
- Follow the suggested action links (reload/interact) if a tab is missing metadata.
- When at least two tabs have known remaining time and are out of order, the **Sort** button appears; click it to reorder the ready tabs.

## Development notes
- `background.js` tracks watch tabs, pulls metrics from content scripts, and performs the sorting.
- `content.js` runs on YouTube watch pages, extracts video metadata, and reports it back to the background service worker.

