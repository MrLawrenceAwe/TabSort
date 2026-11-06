# Developing TabSort

## Checks and packaging

- `npm run build` bundles and minifies the isolated YouTube content runtime into
  `dist/content-runtime.js`.
- `npm test` runs the unit and integration-style Node tests.
- `npm run lint` checks source lint rules; `node scripts/check-static.mjs` checks
  JavaScript syntax and local imports, including the bundle.
  Both share directory exclusions in `scripts/check-scope.mjs` for dependencies,
  tooling, and local artifacts. Only lint excludes `dist/`.
- `npm run validate:release` checks version consistency, required worker and popup
  declarations, and release resources, including local scripts and stylesheets
  referenced by extension HTML.
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
- `background/playback/` owns the bounded content-script metric-request transport
  used by normal collection, plus playback update derivation and application shared
  with preparation.
- `background/sorting/` builds tab orders and derives sorting state.
- `background/messaging/` routes extension messages and handles tab commands and page events.
- `background/auto-preparation/` owns queue execution, the preparation workspace,
  placeholder projection, run state, and the session cache. `silent-playback.js`
  uses separately bounded main-world script calls: `preparePlayback()` initializes
  muted playback and returns readiness; `readMetrics()` reads paused media and
  returns metrics or null.
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
  The discard scenario copies `fixtures/discard-runner.js` into its temporary
  extension, preserving relative imports, and supplies its result endpoint through
  a separate JSON file. The runner receives the same lint and syntax checks as source.

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
Preparation first initializes the player through a main-world script using
YouTube's player API: mute, play, pause 250 ms after `playing`, then restore the
original mute state. Failed starts retry after one second within the same attempt;
media arriving after a failed start can still proceed to collection.
Preparation polls awake tabs even while Chrome reports page loading. A verified
media reading can finish before unrelated requests do; its prepared snapshot
remains usable during that loading state. A new loading event invalidates it.
The muted media element is also started when the player leaves it paused.
Initialization calls `HTMLMediaElement.prototype.play` directly so an autoplay
extension's video-method override cannot reject this explicitly requested action.
Source replacement AbortErrors retry on metadata/canplay events. Timed-out script calls
receive fresh session tokens so late cleanup cannot block subsequent attempts.
Preparation reads metrics directly from the paused media in the same main-world
script, independent of content-script messaging. It verifies page and player video
identity, rejects adverts, seeking and missing metadata, then samples for stability.
Actual media metadata (HAVE_METADATA) is sufficient: a video with duration and a
restored position can be paused and read even when buffering prevents `playing`.
Stop, navigation, page exit, rejection, and a
ten-second watchdog pause the player and restore muting. Script calls are bounded
and late starts receive cleanup. Each reload creates a new playback session.
After five seconds without a usable reading, preparation may focus its window
once per attempt for up to three seconds. Success, Stop, and retry release focus
early; restoration checks that the user has not switched to another window.

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

Loading, reading, and settling share `playbackWaitTimeoutMs` (60 seconds by default)
after the video moves to the preparation window. Transfer, return, and cleanup are
outside this deadline. Once data appears, the runner samples it for a
three-second settling period so YouTube can restore saved viewing progress.
A sudden position jump or a failed read restarts settling. Videos without a
settled reading are reloaded in the preparation window and retried, for up to
three attempts. Only timeouts retry; closed, navigated, pinned, and live videos
are not reloaded. Each retry checks the tab identity, selection, and workspace
ownership again. Individual metric reads are capped at two seconds so a stalled
message cannot consume the whole attempt. Stop cancels reads and prevents retries.

The workspace moves videos with `moveTabToPreparationWindow()` and returns the
outstanding video when `finishSession()` clears the recovery journal. Successful
completion removes the progress tab; stopping retains it. Placeholder projection
keeps the moved video visible in browsing-window snapshots.

The return journal uses local storage: Chrome clears session storage when an
extension reloads or updates. It records the source window, position, and group
so recovery also works if the placeholder was removed during reload. A removed
single-tab group is recreated with its original name, colour, and collapsed state.

The service attempts to discard previously sleeping tabs after preparation unless
they have been selected or navigated. A failed discard leaves the tab awake; sleeping
cache entries are saved only after Chrome confirms discard. `hasAutoPreparedTime`
allows sleeping tabs' saved readings to remain sortable. Session-cache entries use
`videoId`; the cache reader migrates previous stored field names before restoring
readings.

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
