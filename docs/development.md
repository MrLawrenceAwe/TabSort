# Developing TabSort

## Checks and packaging

- `npm run build` bundles and minifies the isolated YouTube content runtime into
  `dist/content-runtime.js`.
- `npm test` runs the unit and integration-style Node tests.
- `npm run test:e2e` launches Chromium with the unpacked extension and runs the popup/runtime
  smoke and responsiveness tests. Install its browser once with `npx playwright install chromium`.
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
- `preparation/progress.html` and `progress.js` display preparation progress.
  `placeholder.html` and `placeholder.js` preserve a moved video’s place and offer Stop/recovery.
- `background/windows/tracked-window-store.js` owns the single tracked-window state.
- `background/auto-preparation/runner.js` runs the preparation queue; `workspace.js`
  moves tabs with `moveTabToPreparationWindow()` and restores them with `finishSession()`.
  Finishing clears the session journal. The service removes the progress tab after
  successful completion and retains it after stopping. `placeholder.js` projects
  the moved video into its placeholder position for browsing-window snapshots;
  `state.js` holds run state and the preparation-window ID.
- `background/auto-preparation/session-cache.js` persists prepared tab snapshots.
- `shared/tabs/` contains load states, readiness grace periods, guidance, and refresh policy.
  `shared/preferences.js` persists grouping and TikTok auto-preparation preferences.
  `shared/urls.js` provides generic site grouping, and `shared/preparation-progress.js` formats progress counts.
- `tests/background/`, `tests/youtube/`, `tests/popup/`, and `tests/shared/` mirror
  the runtime boundaries. `sort-state.test.js` checks derived sorting state.

Tab records use `loaded`, `loading`, and `discarded` load states. `loadedAt` records an
observed completion after loading or discarding, not the start of a reload. Video changes
refer to YouTube video identity, so extra URL parameters do not invalidate playback data.
`videoDetails.remainingSeconds` is the estimated wall-clock playback time remaining,
adjusted for playback speed; `remainingSecondsStale` indicates whether it can be trusted.
The sorting summary's `readyTabsLeadInOrder` means ready videos occupy the front of
the unpinned tab strip in remaining-time order. Popup snapshots contain display state;
the target video order stays in the background store. `isYouTubeLayoutOrganised` additionally
requires at least two sortable videos, all ready, with YouTube tabs grouped at the front;
it does not describe grouping of other sites. Sorting and organised-state detection share
the complete tab-order builder. Existing Chrome groups constrain the sort plan to contiguous blocks; the organised state compares against that achievable plan.
`hasAutoPreparedTime` permits a saved
remaining-time reading to be used while its tab sleeps. Tab activation uses `activateTab`.

Playback messages use `metadataDurationSeconds`, `mediaDurationSeconds`, and
`positionSeconds` to distinguish their sources and units. Tab records store
`videoDetails.durationSeconds`; the metadata collector translates YouTube’s external
`lengthSeconds` field at the page boundary. Session-cache entries use `videoId`.
The cache reader migrates previous stored field names in place before restoring
readings, preserving prepared times without legacy fallbacks in runtime records.

Normal playback collection has a two-second deadline per tab, shared by the metric
request, missing-receiver reinjection and retries. Expiry marks the reading unavailable;
late responses cannot update records or start more retries. A failed read for a previous
video does not invalidate a successor video's reading.

Popup table refreshes preserve keyboard focus on the same tab and action, even when
rows change order. Focus outside the table is left alone; disappearing actions or a
change from View to Reload do not transfer focus to a different operation. Browser
responsiveness tests use pages without media. Any test that starts playback mutes its
specific player before playback and verifies that it remains muted.

Popup snapshot requests wait at most 250 ms for playback collection. Slower reads
continue in one shared batch per window and broadcast their results; organising
still waits for fresh playback data before sorting. Controls and listeners register
before the initial request, and failed initial loads retry while the popup is open.
Records keep Chrome's `browserTitle` separately from page playback metadata so
sleeping tabs remain identifiable after worker suspension or window changes.

The package and manifest versions must match. CI verifies the committed bundle, runs the
Chromium smoke test, and uploads the packaged extension as a workflow artifact.

## Preparation sampling

Each video has a 15-second preparation deadline. Once data appears, the runner
samples it for a three-second settling period so YouTube can restore saved viewing
progress. A sudden position jump or a failed read restarts settling. Unavailable
videos are skipped at the deadline. Successfully prepared sleeping tabs return to
sleep, and their remaining-time readings stay available for sorting.

## Preview and artwork

Serve the repository locally and open `docs/preview.html` to preview the popup.
`docs/preview.js` loads the production `popup/popup.html` markup, installs the fixed
synthetic browser fixture from `preview-fixture.js`, and starts the production
controller. The fixture derives sort state using the same helper as the extension.
Preview buttons do not operate real tabs. `docs/images/popup.png` is the README
screenshot of this preview; refresh it when the visible popup changes.

`assets/icon.svg` is the source artwork for the packaged PNG icons in
`assets/icons/`. Temporary screenshots belong in ignored `output/`, rather than
committed verification-artifact directories.
