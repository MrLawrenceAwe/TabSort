# Developing TabSort

## Checks and packaging

- `npm run build` bundles the isolated YouTube content runtime into
  `dist/content-runtime.js`.
- `npm test` runs the unit and integration-style Node tests.
- `npm run test:e2e` launches Chromium with the unpacked extension and runs the popup/runtime
  smoke test. Install its browser once with `npx playwright install chromium`.
- `npm run check` builds and runs tests, linting, static import checks, and release validation.
- `npm run package` creates `release/tabsort-v<version>.zip`.

### Code organisation

- `background/` owns the tracked window, tab reconciliation, playback updates, sorting,
  and extension message handlers. Store reads and writes take defensive copies; mutation uses
  explicit write functions and `getMutableTabRecord()`. Tab event bursts reconcile once
  per window and batch playback collection by unique tab ID.
- `content/youtube/` collects page metadata and playback evidence. Each observer owns
  its state. Navigation resets preserve previous media evidence until new media arrives;
  a full controller reset clears it. Numeric configuration is separate from injected dependencies.
  The page entry point creates and bootstraps the controller.
- `popup/` separates the controller, state store, DOM elements, controls, and tab views.
  The controller applies snapshots and renders controls; tab views render records.
  CSS follows the system colour scheme and highlights ready, sortable video rows.
- `preparation/` owns the preparation progress and placeholder pages.
- `background/windows/tracked-window-store.js` owns the single tracked-window state.
- `background/auto-preparation/runner.js` runs the preparation queue; `workspace.js`
  moves tabs with `moveTabToPreparationWindow()` and restores them with `finishSession()`.
  Finishing clears the session journal and leaves the progress window open.
- `background/auto-preparation/session-cache.js` persists prepared tab snapshots.
- `shared/tabs/` contains load states, readiness grace periods, guidance, and refresh policy.
  `shared/preferences.js` persists grouping and TikTok auto-preparation preferences.
  `shared/urls.js` provides generic site grouping, and `shared/preparation-progress.js` formats progress counts.
- `tests/background/`, `tests/youtube/`, and `tests/popup/` mirror the runtime boundaries.

Tab records use `loaded`, `loading`, and `discarded` load states. `loadedAt` records an
observed completion after loading or discarding, not the start of a reload. Video changes
refer to YouTube video identity, so extra URL parameters do not invalidate playback data.
`videoDetails.remainingSeconds` is the estimated wall-clock playback time remaining,
adjusted for playback speed; `remainingSecondsStale` indicates whether it can be trusted.
The sorting summary's `readyTabsLeadInOrder` means ready videos occupy the front of
the unpinned tab strip in remaining-time order. Popup snapshots contain display state;
the target video order stays in the background store. `isYouTubeLayoutOrganised` additionally
requires at least two sortable videos, all ready, with YouTube tabs grouped at the front;
it does not describe grouping of other sites. Existing Chrome groups constrain the sort
plan to contiguous blocks; the organised state compares against that achievable plan.
`hasAutoPreparedTime` permits a saved
remaining-time reading to be used while its tab sleeps. Tab activation uses `activateTab`.

Playback messages use `metadataDurationSeconds`, `mediaDurationSeconds`, and
`positionSeconds` to distinguish their sources and units. Stored `videoDetails.lengthSeconds`
and session-cache `identity` retain their existing storage schema so saved results remain usable.
Preference storage keys are also unchanged.

The package and manifest versions must match. CI verifies the committed bundle, runs the
Chromium smoke test, and uploads the packaged extension as a workflow artifact.

