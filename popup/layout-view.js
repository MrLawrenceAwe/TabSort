import { getPopupElement } from './elements.js';
import { popupState } from './store.js';

export function hasReadyTabsInOrder(sortSummary, isTargetOrderApplied) {
  return isTargetOrderApplied || (
    sortSummary.readyCount >= 2 && sortSummary.readyPrefixMatchesPlan
  );
}

export function getOrganisedBadgeText(sortSummary, isTargetOrderApplied) {
  return isTargetOrderApplied ? 'Tabs organised' : 'Ready tabs already in order';
}

function updateStatus(status) {
  if (!status) return;
  const { readyCount, sortableCount } = popupState.sortSummary;
  const readyTabsInOrder = hasReadyTabsInOrder(
    popupState.sortSummary,
    popupState.isTargetOrderApplied,
  );
  if (!popupState.isTargetOrderApplied) {
    status.classList.toggle('hide', sortableCount === 0);
    status.textContent = readyTabsInOrder
      ? `${readyCount} of ${sortableCount} sortable tabs ready · Ready tabs in order.`
      : `${readyCount} of ${sortableCount} sortable tabs ready.`;
    return;
  }
  status.classList.add('hide');
}

function updateOrganisedBadge(organisedBadge) {
  if (!organisedBadge) return;
  const readyTabsInOrder = hasReadyTabsInOrder(
    popupState.sortSummary,
    popupState.isTargetOrderApplied,
  );
  organisedBadge.classList.toggle('hide', !readyTabsInOrder);
  organisedBadge.textContent = readyTabsInOrder
    ? `✓ ${getOrganisedBadgeText(popupState.sortSummary, popupState.isTargetOrderApplied)}`
    : '';
}

export function getOrganiseButtonText(readyCount, sortableCount) {
  return readyCount === sortableCount ? 'Organise Tabs' : 'Organise Ready Tabs';
}

export function shouldShowOrganiseButton(sortSummary, isTargetOrderApplied) {
  return sortSummary.readyCount >= 2 &&
    !isTargetOrderApplied && !sortSummary.readyPrefixMatchesPlan;
}

function updateOrganiseButton(organiseButton, shouldShow) {
  if (!organiseButton) return;
  organiseButton.classList.toggle('hide', !shouldShow);
  if (shouldShow) {
    const { readyCount, sortableCount } = popupState.sortSummary;
    organiseButton.disabled = popupState.isOrganising || (popupState.isStartingPreparation || popupState.preparation.status === 'running');
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

export function syncPopupLayout() {
  const status = getPopupElement('status');
  const organiseButton = getPopupElement('organiseButton');
  const organisedBadge = getPopupElement('organisedBadge');
  const shouldShowOrganise = shouldShowOrganiseButton(
    popupState.sortSummary,
    popupState.isTargetOrderApplied,
  );

  const preparation = popupState.preparation;
  const running = preparation.status === 'running';
  const prepareButton = getPopupElement('prepareButton');
  if (prepareButton) {
    prepareButton.classList.toggle('hide', running || popupState.sortSummary.readyCount >= popupState.sortSummary.sortableCount);
    prepareButton.disabled = popupState.isStartingPreparation || popupState.isOrganising;
    prepareButton.textContent = popupState.isStartingPreparation ? 'Starting…' : 'Prepare tabs';
  }
  getPopupElement('stopPreparationButton')?.classList.toggle('hide', !running);
  const preparationStatus = getPopupElement('preparationStatus');
  if (preparationStatus) {
    preparationStatus.classList.toggle('hide', preparation.status === 'idle');
    preparationStatus.textContent = preparation.status === 'idle' ? '' :
      `${running ? 'Preparing' : preparation.status === 'complete' ? 'Finished' : 'Stopped'}: ${preparation.completed} of ${preparation.total} checked · ${preparation.ready} ready · ${preparation.skipped} skipped`;
  }

  setOptionToggleVisibility(shouldShowOrganise);

  updateStatus(status);
  updateOrganisedBadge(organisedBadge);
  updateOrganiseButton(organiseButton, shouldShowOrganise);
}
