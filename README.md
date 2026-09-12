# TabSort for YouTube

Chrome extension that keeps YouTube video tabs organised by the time you still have left in each video. It tracks watch and shorts tabs in the current window, gathers the remaining playback times and lets you organise the ready tabs with one click.

## Install (unpacked)

1. Clone or download this repository.
2. Run `npm install` and `npm run build`.
3. Visit `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
4. Select the project directory.

Alternatively, install the ZIP produced by `npm run package` using your normal extension
distribution workflow.

## Using the popup

- Open some YouTube watch or shorts pages in the same Chrome window, then click the TabSort extension.
- The popup lists each tracked video tab, shows whether its remaining time is known, and highlights tabs that are ready.
- Click **Auto-prepare tabs** to visit unready videos one at a time, including sleeping tabs. After playback data appears, TabSort briefly samples it again so YouTube has time to restore saved viewing progress; a sudden position jump restarts that settling period. Tabs still unavailable after 15 seconds are skipped. A successfully auto-prepared sleeping tab is returned to sleep, keeps its recorded remaining time for sorting, and is labelled **Auto-prepared · sleeping**. Use **Organise Tabs** when you are ready. Ready, pinned, and live tabs are excluded.
- Enable **Open TikTok PiP while auto-preparing** to ask the locally installed TikTok Picture-in-Picture extension to reuse or create a TikTok tab, start automatic PiP, and then begin auto-preparation. Auto-preparation still starts if TikTok or playable media is unavailable.
- Auto-prepared results are saved for the browser session, so changing windows or Chrome suspending the extension worker does not erase sleeping tabs' recorded times. Waking, navigating, or closing a tab invalidates its saved result; restarting Chrome clears the session.
- Auto-preparation continues when the toolbar popup closes. A separate progress window shows counts and a **Stop** button; closing it also stops the run. Switching tabs manually or changing the tracked browser window stops auto-preparation. TabSort does not click Play; a video that still needs interaction may be skipped.
- The Remaining column explains blockers: **Sleeping**, **Loading tab**, **Loading video**, **Needs viewing**, or **Couldn’t read time**.
- Follow the suggested action buttons (Reload tab/View tab) if a tab is missing metadata.
- When at least two tabs have known remaining time and the ready subset is not already grouped at the front, the **Organise** button appears; click it to move the ready tabs to the front in remaining-time order.
- When you organise, all YouTube tabs (watch, home, shorts, etc.) move to the front with tracked video pages first; tick the popup option if you also want other tabs grouped by site.
- If the popup warns that a background tab needs viewing, view that tab once so Chrome exposes the accurate remaining time.

## Development

- `npm run build` bundles the isolated YouTube content runtime into
  `dist/content-runtime.js`.
- `npm test` runs the unit and integration-style Node tests.
- `npm run test:e2e` launches Chromium with the unpacked extension and runs the popup/runtime
  smoke test. Install its browser once with `npx playwright install chromium`.
- `npm run check` builds and runs tests, linting, static import checks, and release validation.
- `npm run package` creates `release/tabsort-v<version>.zip`.

### Code organisation

- `background/` owns the tracked window, tab reconciliation, playback updates, sorting,
  and extension message handlers. Store reads return defensive copies; mutation uses
  explicit write functions and `getMutableTabRecord()`. Tab event bursts reconcile once
  per window and batch playback collection by unique tab ID.
- `content/youtube/` collects page metadata and playback evidence. Each observer owns
  its state. Navigation resets preserve previous media evidence until new media arrives;
  a full controller reset clears it. Numeric configuration is separate from injected dependencies.
  The page entry point creates and bootstraps the controller.
- `popup/` separates the controller, state store, DOM elements, layout, and tab views.
  The controller applies snapshots and coordinates layout; tab views render records.
  CSS follows the system colour scheme and highlights ready, sortable video rows.
- `preparation-progress/` owns the separate auto-preparation progress window.
- `background/auto-preparation/session-cache.js` persists prepared sleeping-tab results.
- `shared/tabs/` contains load states, readiness grace periods, guidance, and refresh policy.
  `shared/preferences.js` persists grouping and TikTok auto-preparation preferences.
  `shared/urls.js` provides generic site grouping, and `shared/auto-preparation.js` formats progress counts.
- `tests/background/`, `tests/youtube/`, and `tests/popup/` mirror the runtime boundaries.

Tab records use `loaded`, `loading`, and `discarded` load states. `loadedAt` records an
observed completion after loading or discarding, not the start of a reload. Video changes
refer to YouTube video identity, so extra URL parameters do not invalidate playback data.
`videoDetails.remainingSeconds` is the estimated wall-clock playback time remaining,
adjusted for playback speed; `remainingSecondsStale` indicates whether it can be trusted.
The sorting summary's `readyTabsLeadInOrder` means ready videos occupy the front of
the unpinned tab strip in remaining-time order. Popup snapshots contain display state;
the target video order stays in the background store. `allVideosReadyAndOrdered` additionally
requires at least two sortable videos, all ready, with YouTube tabs grouped at the front;
it does not describe grouping of other sites. `hasAutoPreparedTime` permits a saved
remaining-time reading to be used while its tab sleeps. Tab activation uses `activateTab`.

Playback messages use `metadataDurationSeconds`, `mediaDurationSeconds`, and
`positionSeconds` to distinguish their sources and units. Stored `videoDetails.lengthSeconds`
and session-cache `identity` retain their existing storage schema so saved results remain usable.
Preference storage keys are also unchanged.

The package and manifest versions must match. CI verifies the committed bundle, runs the
Chromium smoke test, and uploads the packaged extension as a workflow artifact.

## Permissions and privacy

TabSort performs all processing locally and does not send browsing data to a server.

- `tabs` reads tab URLs and positions, activates or reloads a requested tab, and reorders tabs.
  URLs outside YouTube are only used locally when the optional “Group other tabs by site”
  setting is enabled.
- `alarms` refreshes eligible playback information periodically while the extension service
  worker is available.
- `scripting` reinjects the bundled YouTube runtime if Chrome reports that a tab has no content
  script receiver.
- `webNavigation` detects YouTube single-page navigation reliably.
- `storage` saves the grouping preference using Chrome sync storage when available, falling back
  to local storage.
- The YouTube host permission limits page inspection and content-script execution to
  `youtube.com`.

No analytics, advertising SDKs, remote code, or external network services are included.
