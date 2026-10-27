import { formatPreparationStatus } from '../shared/preparation-progress.js';
import { getPopupElement } from './elements.js';
import { popupState } from './store.js';

export function isOrganisedBadgeEligible(sortSummary, isYouTubeLayoutOrganised) {
  return isYouTubeLayoutOrganised || (
    sortSummary.readyCount >= 2 && sortSummary.readyTabsLeadInOrder
  );
}

export function getOrganisedBadgeText(isYouTubeLayoutOrganised) {
  return isYouTubeLayoutOrganised ? 'YouTube tabs organised' : 'Ready tabs already in order';
}

function updateSortStatus(status) {
  if (!status) return;
  const { readyCount, sortableCount } = popupState.sortSummary;
  if (!popupState.isYouTubeLayoutOrganised) {
    const readyTabsInOrder = readyCount >= 2 && popupState.sortSummary.readyTabsLeadInOrder;
    status.classList.toggle('hide', sortableCount === 0);
    status.textContent = readyTabsInOrder
      ? `${readyCount} of ${sortableCount} sortable tabs ready · Ready tabs in order.`
      : `${readyCount} of ${sortableCount} sortable tabs ready.`;
    return;
  }
  status.classList.add('hide');
}

function updateOrganisedBadge(organisedBadge, visible) {
  if (!organisedBadge) return;
  organisedBadge.classList.toggle('hide', !visible);
  const badgeText = getPopupElement('organisedBadgeText');
  if (badgeText) {
    badgeText.textContent = visible
      ? getOrganisedBadgeText(popupState.isYouTubeLayoutOrganised)
      : '';
  }
}

export function shouldShowOrganiseButton(sortSummary, isYouTubeLayoutOrganised) {
  return sortSummary.readyCount >= 2 && !isYouTubeLayoutOrganised;
}

export function shouldShowTikTokPipOption(preparationCandidateCount) {
  return preparationCandidateCount > 7;
}

function updateOrganiseButton(organiseButton, shouldShow, disabled) {
  if (!organiseButton) return;
  organiseButton.classList.toggle('hide', !shouldShow);
  if (shouldShow) {
    organiseButton.disabled = disabled;
    organiseButton.setAttribute?.('aria-busy', String(popupState.isOrganising));
    organiseButton.textContent = popupState.isOrganising
      ? 'Organising…'
      : 'Organise tabs';
    return;
  }
  organiseButton.disabled = false;
  organiseButton.removeAttribute?.('aria-busy');
}

export function setNextStepHeaderVisible(visible) {
  const nextStep = getPopupElement('nextStepColumn');
  nextStep?.classList.toggle('hide', !visible);
}

function setSiteGroupingOptionVisible(visible) {
  const toggle = getPopupElement('groupOtherTabsToggle')?.closest?.('.option-toggle');
  toggle?.classList?.toggle('hide', !visible);
}

export function renderPopupControls() {
  const status = getPopupElement('organiseStatus');
  const organiseButton = getPopupElement('organiseButton');
  const organisedBadge = getPopupElement('organisedBadge');
  const shouldShowOrganise = shouldShowOrganiseButton(
    popupState.sortSummary,
    popupState.isYouTubeLayoutOrganised,
  );

  const badgeEligible = isOrganisedBadgeEligible(
    popupState.sortSummary,
    popupState.isYouTubeLayoutOrganised,
  );
  const autoPreparation = popupState.autoPreparation;
  const running = autoPreparation.status === 'running';
  const preparationBusy = popupState.isStartingAutoPreparation || running;
  const actionsDisabled = popupState.isOrganising || preparationBusy;
  const preparationStatusText = formatPreparationStatus(autoPreparation);
  const shouldShowAutoPrepare = !running && popupState.preparationCandidateCount > 0;
  const autoPrepareButton = getPopupElement('autoPrepareButton');
  if (autoPrepareButton) {
    autoPrepareButton.classList.toggle('hide', !shouldShowAutoPrepare);
    autoPrepareButton.disabled = popupState.isStartingAutoPreparation || popupState.isOrganising;
    autoPrepareButton.textContent = popupState.isStartingAutoPreparation ? 'Starting auto-prepare…' : 'Auto-prepare tabs';
  }
  const openTikTokPipOption = getPopupElement('openTikTokPipToggle')?.closest?.('.option-toggle');
  openTikTokPipOption?.classList?.toggle('hide',
    !shouldShowAutoPrepare || !shouldShowTikTokPipOption(popupState.preparationCandidateCount));
  getPopupElement('stopAutoPreparationButton')?.classList.toggle('hide', !running);
  const autoPreparationStatus = getPopupElement('autoPreparationStatus');
  if (autoPreparationStatus) {
    autoPreparationStatus.classList.toggle('hide', autoPreparation.status === 'idle');
    autoPreparationStatus.textContent = preparationStatusText;
  }

  setSiteGroupingOptionVisible(shouldShowOrganise);

  updateSortStatus(status);
  updateOrganisedBadge(organisedBadge, badgeEligible && !preparationBusy);
  updateOrganiseButton(organiseButton, shouldShowOrganise, actionsDisabled);
}
