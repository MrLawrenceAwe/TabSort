function createPopupElements() {
  return {
    error: null,
    notice: null,
    stateMessage: null,
    backlogSummary: null,
    status: null,
    organiseButton: null,
    organisedBadge: null,
    groupOtherTabsToggle: null,
    table: null,
    nextStepColumn: null,
    initialized: false,
  };
}

const popupElements = createPopupElements();

let popupDocument = null;

function resolveDocument(nextDocument) {
  return nextDocument ?? popupDocument ?? globalThis.document;
}

export function resetPopupDom() {
  Object.assign(popupElements, createPopupElements());
  popupDocument = null;
}

export function initializePopupDom(rootDocument = globalThis.document) {
  if (popupElements.initialized) return;
  const runtimeDocument = resolveDocument(rootDocument);
  if (!runtimeDocument) return;

  popupDocument = runtimeDocument;
  popupElements.error = runtimeDocument.getElementById('popupError');
  popupElements.notice = runtimeDocument.getElementById('popupNotice');
  popupElements.stateMessage = runtimeDocument.getElementById('popupStateMessage');
  popupElements.backlogSummary = runtimeDocument.getElementById('backlogSummary');
  popupElements.status = runtimeDocument.getElementById('organiseStatus');
  popupElements.organiseButton = runtimeDocument.getElementById('organiseButton');
  popupElements.organisedBadge = runtimeDocument.getElementById('organisedBadge');
  popupElements.groupOtherTabsToggle = runtimeDocument.getElementById('groupOtherTabsToggle');
  popupElements.table = runtimeDocument.getElementById('tabsTable');
  popupElements.nextStepColumn = runtimeDocument.querySelector('.next-step');
  popupElements.initialized = true;
}

export function getPopupDocument() {
  return resolveDocument();
}

export function getPopupElement(key) {
  if (!popupElements.initialized) initializePopupDom();
  return popupElements[key];
}

function setMessage(elementKey, message) {
  const element = getPopupElement(elementKey);
  if (!element) return;
  const text = typeof message === 'string' ? message.trim() : '';
  element.textContent = text;
  element.classList.toggle('hide', !text);
}

export const setErrorMessage = (message = '') => setMessage('error', message);
export const setNoticeMessage = (message = '') => setMessage('notice', message);
export const setStateMessage = (message = '') => setMessage('stateMessage', message);
export const setBacklogSummary = (message = '') => setMessage('backlogSummary', message);
