import { formatPreparationCounts } from '../shared/auto-preparation.js';
import { getPopupElement } from './elements.js';
import { popupState } from './store.js';

export function hasReadyTabsInOrder(sortSummary, allVideosReadyAndOrdered) {
  return allVideosReadyAndOrdered || (
    sortSummary.readyCount >= 2 && sortSummary.readyTabsLeadInOrder
  );
}

export function getOrganisedBadgeText(allVideosReadyAndOrdered) {
  return allVideosReadyAndOrdered ? 'YouTube tabs organised' : 'Ready tabs already in order';
}

function updateStatus(status) {
  if (!status) return;
  const { readyCount, sortableCount } = popupState.sortSummary;
  const readyTabsInOrder = hasReadyTabsInOrder(
    popupState.sortSummary,
    popupState.allVideosReadyAndOrdered,
  );
  if (!popupState.allVideosReadyAndOrdered) {
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
    popupState.allVideosReadyAndOrdered,
  );
  organisedBadge.classList.toggle('hide', !readyTabsInOrder);
  organisedBadge.textContent = readyTabsInOrder
    ? `✓ ${getOrganisedBadgeText(popupState.allVideosReadyAndOrdered)}`
    : '';
}

export function getOrganiseButtonText(readyCount, sortableCount) {
  return readyCount === sortableCount ? 'Organise Tabs' : 'Organise Ready Tabs';
}

export function shouldShowOrganiseButton(sortSummary, allVideosReadyAndOrdered) {
  return sortSummary.readyCount >= 2 &&
    !allVideosReadyAndOrdered && !sortSummary.readyTabsLeadInOrder;
}

function updateOrganiseButton(organiseButton, shouldShow) {
  if (!organiseButton) return;
  organiseButton.classList.toggle('hide', !shouldShow);
  if (shouldShow) {
    const { readyCount, sortableCount } = popupState.sortSummary;
    organiseButton.disabled = popupState.isOrganising || (popupState.isStartingAutoPreparation || popupState.autoPreparation.status === 'running');
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
    popupState.allVideosReadyAndOrdered,
  );

  const autoPreparation = popupState.autoPreparation;
  const running = autoPreparation.status === 'running';
  const shouldShowAutoPrepare = !running &&
    popupState.sortSummary.readyCount < popupState.sortSummary.sortableCount;
  const autoPrepareButton = getPopupElement('autoPrepareButton');
  if (autoPrepareButton) {
    autoPrepareButton.classList.toggle('hide', !shouldShowAutoPrepare);
    autoPrepareButton.disabled = popupState.isStartingAutoPreparation || popupState.isOrganising;
    autoPrepareButton.textContent = popupState.isStartingAutoPreparation ? 'Starting auto-preparation…' : 'Auto-prepare tabs';
  }
  const openTikTokPipOption = getPopupElement('openTikTokPipToggle')?.closest?.('.option-toggle');
  openTikTokPipOption?.classList?.toggle('hide', !shouldShowAutoPrepare);
  getPopupElement('stopAutoPreparationButton')?.classList.toggle('hide', !running);
  const autoPreparationStatus = getPopupElement('autoPreparationStatus');
  if (autoPreparationStatus) {
    autoPreparationStatus.classList.toggle('hide', autoPreparation.status === 'idle');
    autoPreparationStatus.textContent = autoPreparation.status === 'idle' ? '' :
      `${running ? 'Auto-preparing' : autoPreparation.status === 'complete' ? 'Auto-preparation finished' : 'Auto-preparation stopped'}: ${formatPreparationCounts(autoPreparation)}`;
  }

  setOptionToggleVisibility(shouldShowOrganise);

  updateStatus(status);
  updateOrganisedBadge(organisedBadge);
  updateOrganiseButton(organiseButton, shouldShowOrganise);
}
