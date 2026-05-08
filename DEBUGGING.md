# Live Debugging Runbook

Use this runbook when tests pass but the installed extension behaves differently in a real Chrome session. The goal is to prove which runtime boundary is failing before patching code.

## Debugging Order

1. Reproduce the issue in the real Chrome profile with the unpacked extension loaded.
2. Record the visible symptom, expected behavior, active tab URL, and UI state.
3. Reload the unpacked extension from `chrome://extensions`.
4. Reload or focus the affected browser tab so fresh content scripts are injected.
5. Inspect live browser state and extension logs.
6. Patch the smallest failing boundary and add regression tests at that boundary.
7. Rerun focused tests first, then `npm test`.

## Chrome Extension State

Check this before assuming page logic is wrong:

- The unpacked extension points at this repo directory.
- Developer mode is enabled in `chrome://extensions`.
- The extension service worker has no current errors.
- The affected tab has been reloaded after the extension was reloaded.
- The popup is closed when using browser automation; extension popups can block page inspection.

## Live Browser Diagnostics

Prefer the Codex Chrome Extension for bugs that depend on the user’s real Chrome profile, authenticated state, installed extensions, or existing tabs.

For the affected tab, inspect:

- Current URL and tab title.
- Whether the page has the expected DOM nodes.
- Whether the page’s visible UI disagrees with page metadata.
- Console logs filtered for the extension’s log prefix.
- Whether `chrome.tabs.sendMessage` appears to reach the content script.
- Whether another extension popup, sidebar, or overlay is blocking automation.

If Chrome reports that automation is blocked by another extension UI, close or disable that UI first.

## Runtime Boundaries

Debug from the browser inward:

- Popup request: does the popup request a fresh snapshot?
- Background routing: does the service worker receive the popup message?
- Tab messaging: does `chrome.tabs.sendMessage` reach the content script?
- Content runtime: did the content script bootstrap and register its listener?
- Page extraction: does the content script read the same state visible in the page UI?
- Background merge: does the background accept or reject the metric payload?
- Rendering policy: does the popup action label match the record state?

## State Mismatch Checks

Do not trust one source of truth blindly. Compare visible UI, DOM state, page metadata, browser API state, and extension state.
