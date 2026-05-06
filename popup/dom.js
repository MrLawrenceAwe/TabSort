function createEmptyPopupElements() {
  return {
    errorElement: null,
    emptyStateElement: null,
    statusElement: null,
    sortButton: null,
    sortedBadgeElement: null,
    table: null,
    actionRequiredColumn: null,
    tabStatusColumn: null,
    initialized: false,
  };
}

const popupElements = createEmptyPopupElements();

let rootPopupDocument = null;

function getRootDocument(nextDocument) {
  return nextDocument ?? rootPopupDocument ?? globalThis.document;
}

export function resetPopupDom() {
  Object.assign(popupElements, createEmptyPopupElements());
  rootPopupDocument = null;
}

export function initializePopupDom(rootDocument = globalThis.document) {
  if (popupElements.initialized) return;
  const runtimeDocument = getRootDocument(rootDocument);
  if (!runtimeDocument) return;

  rootPopupDocument = runtimeDocument;
  popupElements.errorElement = runtimeDocument.getElementById('popupError');
  popupElements.emptyStateElement = runtimeDocument.getElementById('emptyState');
  popupElements.statusElement = runtimeDocument.getElementById('videoTabsReadyStatus');
  popupElements.sortButton = runtimeDocument.getElementById('sortButton');
  popupElements.sortedBadgeElement = runtimeDocument.getElementById('tabsSorted');
  popupElements.table = runtimeDocument.getElementById('infoTable');
  popupElements.actionRequiredColumn = runtimeDocument.querySelector('.action-required');
  popupElements.tabStatusColumn = runtimeDocument.querySelector('.tab-status');
  popupElements.initialized = true;
}

export function getPopupDocument() {
  return getRootDocument();
}

export function getPopupElement(key) {
  if (!popupElements.initialized) initializePopupDom();
  return popupElements[key];
}

export function setErrorMessage(message = '') {
  const errorElement = getPopupElement('errorElement');
  if (!errorElement) return;
  const nextMessage = typeof message === 'string' ? message.trim() : '';
  errorElement.textContent = nextMessage;
  errorElement.classList.toggle('hide', !nextMessage);
}
