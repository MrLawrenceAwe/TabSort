# Live Debugging Runbook

Use this runbook when tests pass but the installed extension behaves differently in a real Chrome session. The goal is to prove which runtime boundary is failing before patching code.

## Debugging Order

1. Reproduce the issue in the real Chrome profile with the unpacked extension loaded.
2. Record the visible symptom, expected behavior, active tab URL, and UI state.
3. Reload the unpacked extension from `chrome://extensions`.
4. Run `npm run build` before reloading if any file under `content/` changed.
5. Reload or open the affected browser tab so the bundled content runtime is injected.
6. Inspect live browser state and extension logs.

## State Mismatch Checks

Do not trust one source of truth blindly. Compare visible UI, DOM state, page metadata, browser API state, and extension state.
