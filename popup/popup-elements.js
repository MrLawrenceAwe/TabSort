function createPopupElements() {
  return {
    error: null,
    notice: null,
    stateMessage: null,
    status: null,
    sortButton: null,
    sortedBadge: null,
    table: null,
    nextStepColumn: null,
    loadStateColumn: null,
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
  popupElements.status = runtimeDocument.getElementById('sortStatus');
  popupElements.sortButton = runtimeDocument.getElementById('sortButton');
  popupElements.sortedBadge = runtimeDocument.getElementById('sortedBadge');
  popupElements.table = runtimeDocument.getElementById('tabsTable');
  popupElements.nextStepColumn = runtimeDocument.querySelector('.next-step');
  popupElements.loadStateColumn = runtimeDocument.querySelector('.load-state');
  popupElements.initialized = true;
}

export function getPopupDocument() {
  return resolveDocument();
}

export function getPopupElement(key) {
  if (!popupElements.initialized) initializePopupDom();
  return popupElements[key];
}

export function setErrorMessage(message = '') {
  const error = getPopupElement('error');
  if (!error) return;
  const nextMessage = typeof message === 'string' ? message.trim() : '';
  error.textContent = nextMessage;
  error.classList.toggle('hide', !nextMessage);
}

export function setNoticeMessage(message = '') {
  const notice = getPopupElement('notice');
  if (!notice) return;
  const nextMessage = typeof message === 'string' ? message.trim() : '';
  notice.textContent = nextMessage;
  notice.classList.toggle('hide', !nextMessage);
}

export function setStateMessage(message = '') {
  const stateMessage = getPopupElement('stateMessage');
  if (!stateMessage) return;
  const nextMessage = typeof message === 'string' ? message.trim() : '';
  stateMessage.textContent = nextMessage;
  stateMessage.classList.toggle('hide', !nextMessage);
}
