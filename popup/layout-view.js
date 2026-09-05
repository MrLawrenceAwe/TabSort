import { getPopupElement } from './elements.js';
import { popupState } from './store.js';

function updateStatus(status) {
  if (!status) return;
  const { readyCount, sortableCount } = popupState.sortSummary;
  if (!popupState.isTargetOrderApplied) {
    status.classList.toggle('hide', sortableCount <= 1);
    status.textContent = `${readyCount} of ${sortableCount} sortable tabs ready.`;
    return;
  }
  status.classList.add('hide');
}

function updateOrganisedBadge(organisedBadge) {
  if (!organisedBadge) return;
  organisedBadge.classList.toggle('hide', !popupState.isTargetOrderApplied);
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
    organiseButton.disabled = popupState.isOrganising;
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

  setOptionToggleVisibility(shouldShowOrganise);

  updateStatus(status);
  updateOrganisedBadge(organisedBadge);
  updateOrganiseButton(organiseButton, shouldShowOrganise);
}

