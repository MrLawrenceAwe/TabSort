const ELEMENT_SELECTORS = Object.freeze({
  popupError: '#popupError',
  popupNotice: '#popupNotice',
  popupStateMessage: '#popupStateMessage',
  backlogSummary: '#backlogSummary',
  organiseStatus: '#organiseStatus',
  organiseButton: '#organiseButton',
  autoPrepareButton: '#autoPrepareButton',
  stopAutoPreparationButton: '#stopAutoPreparationButton',
  autoPreparationStatus: '#autoPreparationStatus',
  organisedBadge: '#organisedBadge',
  groupOtherTabsToggle: '#groupOtherTabsToggle',
  openTikTokPipToggle: '#openTikTokPipToggle',
  tabsTable: '#tabsTable',
  nextStepColumn: '.next-step',
});

let popupElements = null;
let popupDocument = null;

function resolveDocument(nextDocument) {
  return nextDocument ?? popupDocument ?? globalThis.document;
}

export function resetPopupDom() {
  popupElements = null;
  popupDocument = null;
}

export function initializePopupDom(rootDocument = globalThis.document) {
  if (popupElements) return;
  const document = resolveDocument(rootDocument);
  if (!document) return;
  popupDocument = document;
  popupElements = Object.fromEntries(Object.entries(ELEMENT_SELECTORS).map(([key, selector]) => [
    key,
    selector.startsWith('#')
      ? document.getElementById(selector.slice(1))
      : document.querySelector(selector),
  ]));
}

export function getPopupDocument() {
  return resolveDocument();
}

export function getPopupElement(key) {
  if (!popupElements) initializePopupDom();
  return popupElements?.[key];
}

function setMessage(elementKey, message) {
  const element = getPopupElement(elementKey);
  if (!element) return;
  const text = typeof message === 'string' ? message.trim() : '';
  element.textContent = text;
  element.classList.toggle('hide', !text);
}

export const setErrorMessage = (message = '') => setMessage('popupError', message);
export const setNoticeMessage = (message = '') => setMessage('popupNotice', message);
export const setStateMessage = (message = '') => setMessage('popupStateMessage', message);
export const setBacklogSummary = (message = '') => setMessage('backlogSummary', message);
