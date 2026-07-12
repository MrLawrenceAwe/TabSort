export function createTitleObserver({
  state,
  getDocument,
  getMutationObserver,
  publishPageVideoDetails,
}) {
  function observeTitleElement(titleElement) {
    if (!titleElement || titleElement === state.observedTitleElement) return;
    const shouldSendUpdate = state.observedTitleElement !== null;
    state.observedTitleElement = titleElement;
    state.lastKnownTitleText = titleElement.textContent;

    if (state.titleTextObserver) state.titleTextObserver.disconnect();
    const MutationObserverCtor = getMutationObserver();
    if (!MutationObserverCtor) return;
    state.titleTextObserver = new MutationObserverCtor(() => {
      const nextTitle = titleElement.textContent;
      if (nextTitle === state.lastKnownTitleText) return;
      state.lastKnownTitleText = nextTitle;
      publishPageVideoDetails();
    });
    state.titleTextObserver.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    if (shouldSendUpdate) {
      publishPageVideoDetails();
    }
  }

  function watchTitleChanges() {
    const runtimeDocument = getDocument();
    observeTitleElement(runtimeDocument?.querySelector?.('title'));
    if (state.titleElementObserver) return;

    const target = runtimeDocument?.head || runtimeDocument?.documentElement;
    const MutationObserverCtor = getMutationObserver();
    if (!target || !MutationObserverCtor) return;

    state.titleElementObserver = new MutationObserverCtor(() => {
      observeTitleElement(runtimeDocument.querySelector('title'));
    });
    state.titleElementObserver.observe(target, { childList: true, subtree: true });
  }

  function disposeTitleObservers() {
    if (state.titleElementObserver) {
      state.titleElementObserver.disconnect();
      state.titleElementObserver = null;
    }
    if (state.titleTextObserver) {
      state.titleTextObserver.disconnect();
      state.titleTextObserver = null;
    }
    state.observedTitleElement = null;
    state.lastKnownTitleText = null;
  }

  return {
    disposeTitleObservers,
    watchTitleChanges,
  };
}
