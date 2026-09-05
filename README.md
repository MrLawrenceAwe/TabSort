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
  explicit write functions and `getMutableTabRecord()`.
- `content/youtube/` collects page metadata and playback evidence. Each observer owns
  its state. Navigation resets preserve previous media evidence until new media arrives;
  a full controller reset clears it. Numeric configuration is separate from injected dependencies.
- `popup/` separates the controller, state store, DOM elements, layout, and tab views.
  CSS follows the system colour scheme and highlights ready, sortable video rows.
- `shared/tabs/` contains load states, readiness grace periods, guidance, and refresh policy.
  `shared/sort-options.js` persists the grouping preference.
- `tests/background/`, `tests/youtube/`, and `tests/popup/` mirror the runtime boundaries.

Tab records use `loaded`, `loading`, and `discarded` load states. `loadedAt` records an
observed completion after loading or discarding, not the start of a reload. Video changes
refer to YouTube video identity, so extra URL parameters do not invalidate playback data.
`videoDetails.remainingSeconds` is the estimated wall-clock playback time remaining,
adjusted for playback speed; `remainingSecondsStale` indicates whether it can be trusted.
The sorting summary's `readyPrefixMatchesPlan` means ready videos occupy the front of
the unpinned tab strip in remaining-time order. Popup snapshots contain display state;
the target video order stays in the background store. Tab activation uses `activateTab`.

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
