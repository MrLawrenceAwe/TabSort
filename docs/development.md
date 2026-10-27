# Developing TabSort

## Checks and packaging

- `npm run build` bundles and minifies the isolated YouTube content runtime into
  `dist/content-runtime.js`.
- `npm test` runs the unit and integration-style Node tests.
- `npm run lint` checks source lint rules; `node scripts/check-static.mjs` checks
  JavaScript syntax and local imports, including the bundle.
- `npm run validate:release` checks version consistency and required release resources.
- `npm run test:e2e` launches Chromium with the unpacked extension. Install its
  browser once with `npx playwright install chromium`.
- `npm run check` builds and runs all checks, including browser tests.
- `npm run package` creates `release/tabsort-v<version>.zip`.

CI checks that the committed bundle matches the build, runs the Chromium suite,
then uploads the packaged extension. Failed checks upload `test-results/` with
Playwright traces.

## Code organisation

- `background/windows/` owns the single tracked-window store and window lifecycle.
- `background/tabs/` owns Chrome tab operations, records, reconciliation, and listeners.
- `background/playback/` collects metrics and derives and applies playback updates.
- `background/sorting/` builds tab orders and derives sorting state.
- `background/messaging/` routes extension messages and handles tab commands and page events.
- `background/auto-preparation/` owns queue execution, the preparation workspace,
  placeholder projection, run state, and the session cache.
- `content/youtube/` collects page metadata and playback evidence. `page/entry.js`
  bootstraps the controller; `metadata/` and `media/` own their observers.
- `popup/` contains the controller, state store, runtime clients, DOM elements, and views.
- `preparation/` contains the progress page and the moved video's placeholder page.
- `shared/` contains message contracts, preferences, URL helpers, sorting summaries,
  tab readiness and guidance policies, and preparation progress formatting.
- `tests/background/`, `tests/youtube/`, `tests/popup/`, and `tests/shared/` cover
  their corresponding runtime boundaries.
- Preparation runner tests cover queue timing and restoration; service tests cover
  cancellation, playback failures, and cache recovery. The performance suite checks
  large queues and progress payload sizes.
- `tests/e2e/` separates extension smoke, auto-preparation, sorting, responsiveness,
  and discarded-workspace scenarios. `fixtures/extension.js` provides the shared
  persistent browser context, service worker, and extension ID for feature suites.

## Tab records and playback contracts

Store reads and writes take defensive copies; mutation uses explicit write functions
and the explicitly named `getMutableTabRecord()` and `getOrCreateMutableTabRecord()`
accessors. Tab event bursts reconcile once per window and batch
playback collection by unique tab ID.

Tab records use `loaded`, `loading`, and `discarded` load states. `loadedAt` records
an observed completion after loading or discarding. `transitionStartedAt` starts a
grace period for video transitions on both watch and Shorts pages. Video identity
ignores extra URL parameters.

`videoDetails.remainingSeconds` estimates wall-clock playback time remaining,
adjusted for playback speed; `remainingSecondsStale` marks unreliable readings.
`browserTitle` retains Chrome's title separately from page metadata so sleeping
tabs remain identifiable after worker suspension or window changes.

Playback messages distinguish `metadataDurationSeconds`, `mediaDurationSeconds`,
and `positionSeconds`. Records store `videoDetails.durationSeconds`; the metadata
collector translates YouTube's external `lengthSeconds` field at the page boundary.

Each content observer owns its state. Navigation resets retain previous media
evidence until new media arrives; a full controller reset clears it. Numeric
configuration is separate from injected dependencies.

## Sorting

`readyTabsLeadInOrder` means ready videos occupy the front of the unpinned tab
strip in remaining-time order. Popup snapshots contain display state; the target
video order stays in the background store.

`isYouTubeLayoutOrganised` requires at least two sortable videos, all ready, and a
layout matching the complete tab-order plan. Existing Chrome groups constrain the
plan to contiguous blocks. This state does not describe grouping of other sites.
Sorting and organised-state detection share the same order builder.

Sort results report `orderChanged` only after the complete move operation succeeds.
A failed operation may have moved some tabs; those moves are not rolled back.

## Refresh and popup behaviour

Normal playback collection has a two-second deadline per tab, shared by the metric
request, missing-receiver reinjection, and retries. Expiry marks the reading
unavailable. Late responses cannot update records or start more retries, and a
failed read for a previous video cannot invalidate its successor's reading.

Popup snapshot requests wait at most 250 ms for playback collection. Slower reads
continue in one shared batch per window and broadcast their results; organising
waits for fresh playback data. Controls and listeners register before the initial
request, and failed initial loads retry while the popup is open.

Table refreshes preserve keyboard focus on the same tab and action when rows move.
Focus outside the table stays in place. Disappearing actions or a change from View
to Reload do not transfer focus to a different operation.

## Preparation and recovery

Preparation candidates exclude ready, pinned, live, selected, and currently
preparing videos. The popup counts and queue filter share this predicate. The
TikTok option requires more than seven candidates.

Loading, reading, and settling share a 15-second deadline after the video moves
to the preparation window. Once data appears, the runner samples it for a
three-second settling period so YouTube can restore saved viewing progress.
A sudden position jump or a failed read restarts settling. Videos without a
settled reading are skipped at the deadline.

The workspace moves videos with `moveTabToPreparationWindow()` and returns the
outstanding video when `finishSession()` clears the recovery journal. Successful
completion removes the progress tab; stopping retains it. Placeholder projection
keeps the moved video visible in browsing-window snapshots.

Successfully prepared sleeping tabs return to sleep. `hasAutoPreparedTime` allows
their saved readings to remain sortable. Session-cache entries use `videoId`; the
cache reader migrates previous stored field names before restoring readings.

## Preferences

Preferences use local storage. Missing keys import existing sync settings once,
keeping local values and retrying imports after read failures. Subsequent saves
do not use sync.

## Browser test policy

Responsiveness fixtures contain no media. Tests that start playback mute their
specific player before playback and verify that it remains muted. Preparation and
Stop run as separate scenarios. The preparation scenario allows 60 seconds for
setup and two sequential reads; runtime deadlines remain unchanged.

## Preview and artwork

Serve the repository locally and open `docs/preview.html` to preview the popup.
`docs/preview.js` loads the production popup markup, installs the synthetic browser
fixture from `preview-fixture.js`, and starts the production controller. The fixture
derives sort state using the extension's helper. Preview buttons do not operate
real tabs. Refresh `docs/images/popup.png`, the README screenshot, when the visible
popup changes.

`assets/icon.svg` is the source artwork for the packaged PNG icons in `assets/icons/`.
Temporary screenshots belong in ignored `output/`.
