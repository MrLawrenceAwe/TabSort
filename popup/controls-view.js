import { formatPreparationCounts, formatPreparationDetail } from '../shared/preparation-progress.js';
import { getPopupElement } from './elements.js';
import { popupState } from './store.js';

export function areReadyTabsLeadingInOrder(sortSummary, isYouTubeLayoutOrganised) {
  return isYouTubeLayoutOrganised || (
    sortSummary.readyCount >= 2 && sortSummary.readyTabsLeadInOrder
  );
}

export function getOrganisedBadgeText(isYouTubeLayoutOrganised) {
  return isYouTubeLayoutOrganised ? 'YouTube tabs organised' : 'Ready tabs already in order';
}

function updateStatus(status, readyTabsInOrder) {
  if (!status) return;
  const { readyCount, sortableCount } = popupState.sortSummary;
  if (!popupState.isYouTubeLayoutOrganised) {
    status.classList.toggle('hide', sortableCount === 0);
    status.textContent = readyTabsInOrder
      ? `${readyCount} of ${sortableCount} sortable tabs ready · Ready tabs in order.`
      : `${readyCount} of ${sortableCount} sortable tabs ready.`;
    return;
  }
  status.classList.add('hide');
}

function updateOrganisedBadge(organisedBadge, readyTabsInOrder) {
  if (!organisedBadge) return;
  organisedBadge.classList.toggle('hide', !readyTabsInOrder);
  organisedBadge.textContent = readyTabsInOrder
    ? `✓ ${getOrganisedBadgeText(popupState.isYouTubeLayoutOrganised)}`
    : '';
}

export function getOrganiseButtonText(readyCount, sortableCount) {
  return readyCount === sortableCount ? 'Organise tabs' : 'Organise ready tabs';
}

export function shouldShowOrganiseButton(sortSummary, isYouTubeLayoutOrganised) {
  return sortSummary.readyCount >= 2 &&
    !isYouTubeLayoutOrganised && !sortSummary.readyTabsLeadInOrder;
}

function updateOrganiseButton(organiseButton, shouldShow, disabled) {
  if (!organiseButton) return;
  organiseButton.classList.toggle('hide', !shouldShow);
  if (shouldShow) {
    const { readyCount, sortableCount } = popupState.sortSummary;
    organiseButton.disabled = disabled;
    organiseButton.setAttribute?.('aria-busy', String(popupState.isOrganising));
    organiseButton.textContent = popupState.isOrganising
      ? 'Organising…'
      : getOrganiseButtonText(readyCount, sortableCount);
    return;
  }
  organiseButton.disabled = false;
  organiseButton.removeAttribute?.('aria-busy');
}

export function setNextStepHeaderVisible(visible) {
  const nextStep = getPopupElement('nextStepColumn');
  nextStep?.classList.toggle('hide', !visible);
}

function setOptionToggleVisibility(visible) {
  const toggle = getPopupElement('groupOtherTabsToggle')?.closest?.('.option-toggle');
  toggle?.classList?.toggle('hide', !visible);
}

function formatPreparationStatus(state) {
  if (state.status === 'idle') return '';
  const labels = {
    running: 'Reading remaining times',
    complete: 'Finished reading times',
    stopped: 'Stopped reading times',
  };
  const detail = formatPreparationDetail(state);
  return `${labels[state.status]}: ${formatPreparationCounts(state)}${detail ? ` · ${detail}` : ''}`;
}

export function renderPopupControls() {
  const status = getPopupElement('organiseStatus');
  const organiseButton = getPopupElement('organiseButton');
  const organisedBadge = getPopupElement('organisedBadge');
  const shouldShowOrganise = shouldShowOrganiseButton(
    popupState.sortSummary,
    popupState.isYouTubeLayoutOrganised,
  );

  const readyTabsInOrder = areReadyTabsLeadingInOrder(
    popupState.sortSummary,
    popupState.isYouTubeLayoutOrganised,
  );
  const autoPreparation = popupState.autoPreparation;
  const running = autoPreparation.status === 'running';
  const preparationBusy = popupState.isStartingAutoPreparation || running;
  const actionsDisabled = popupState.isOrganising || preparationBusy;
  const preparationStatusText = formatPreparationStatus(autoPreparation);
  const shouldShowAutoPrepare = !running &&
    popupState.sortSummary.readyCount < popupState.sortSummary.sortableCount;
  const autoPrepareButton = getPopupElement('autoPrepareButton');
  if (autoPrepareButton) {
    autoPrepareButton.classList.toggle('hide', !shouldShowAutoPrepare);
    autoPrepareButton.disabled = popupState.isStartingAutoPreparation || popupState.isOrganising;
    autoPrepareButton.textContent = popupState.isStartingAutoPreparation ? 'Starting to read times…' : 'Read remaining times';
  }
  const openTikTokPipOption = getPopupElement('openTikTokPipToggle')?.closest?.('.option-toggle');
  openTikTokPipOption?.classList?.toggle('hide', !shouldShowAutoPrepare);
  getPopupElement('stopAutoPreparationButton')?.classList.toggle('hide', !running);
  const autoPreparationStatus = getPopupElement('autoPreparationStatus');
  if (autoPreparationStatus) {
    autoPreparationStatus.classList.toggle('hide', autoPreparation.status === 'idle');
    autoPreparationStatus.textContent = preparationStatusText;
  }

  setOptionToggleVisibility(shouldShowOrganise);

  updateStatus(status, readyTabsInOrder);
  updateOrganisedBadge(organisedBadge, readyTabsInOrder);
  updateOrganiseButton(organiseButton, shouldShowOrganise, actionsDisabled);
}
