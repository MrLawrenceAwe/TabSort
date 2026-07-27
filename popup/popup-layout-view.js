import { getPopupElement } from './popup-elements.js';
import { popupState } from './popup-store.js';

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
  const partialReadySetExists =
    sortSummary.readyCount >= 2 && sortSummary.readyCount < sortSummary.sortableCount;
  return (
    sortSummary.readyCount >= 2 &&
    !isTargetOrderApplied &&
    (
      sortSummary.readyTabsOutOfOrder ||
      !sortSummary.readyTabsAtFront ||
      (partialReadySetExists && !sortSummary.readyTabsContiguous)
    )
  );
}

function updateOrganiseButton(organiseButton, shouldShow) {
  if (!organiseButton) return;
  organiseButton.classList.toggle('hide', !shouldShow);
  if (shouldShow) {
    const { readyCount, sortableCount } = popupState.sortSummary;
    organiseButton.classList.toggle('all-tabs-ready', readyCount === sortableCount);
    organiseButton.disabled = popupState.isOrganising;
    organiseButton.setAttribute?.('aria-busy', String(popupState.isOrganising));
    organiseButton.textContent = popupState.isOrganising
      ? 'Organising…'
      : getOrganiseButtonText(readyCount, sortableCount);
    return;
  }
  organiseButton.disabled = false;
  organiseButton.removeAttribute?.('aria-busy');
  organiseButton.classList.remove('all-tabs-ready');
}

function clearReadyRows(table) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.remove('ready-row');
  }
}

export function setMetadataColumnsVisible(visible) {
  const nextStep = getPopupElement('nextStepColumn');
  const loadState = getPopupElement('loadStateColumn');
  nextStep?.classList.toggle('hide', !visible);
  loadState?.classList.toggle('hide', !visible);
}

function setOptionToggleVisibility(visible) {
  const toggle = getPopupElement('groupOtherTabsToggle')?.closest?.('.option-toggle');
  toggle?.classList?.toggle('hide', !visible);
}

export function syncPopupLayout() {
  const status = getPopupElement('status');
  const organiseButton = getPopupElement('organiseButton');
  const organisedBadge = getPopupElement('organisedBadge');
  const table = getPopupElement('table');
  const shouldShowOrganise = shouldShowOrganiseButton(
    popupState.sortSummary,
    popupState.isTargetOrderApplied,
  );

  setOptionToggleVisibility(shouldShowOrganise);

  updateStatus(status);
  updateOrganisedBadge(organisedBadge);
  updateOrganiseButton(organiseButton, shouldShowOrganise);

  if (popupState.isTargetOrderApplied && table) {
    clearReadyRows(table);
  }
}

export function addClassToTabRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
