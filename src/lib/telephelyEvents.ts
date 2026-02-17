// Custom event for telephely data changes (domain, probapaciens, etc.)
const TELEPHELY_DATA_CHANGED = 'TELEPHELY_DATA_CHANGED';
const TELEPHELY_MEMBERSHIP_CHANGED = 'TELEPHELY_MEMBERSHIP_CHANGED';

/**
 * Dispatch this event when telephely data is updated (domain, probapaciens_neve, etc.)
 * Components listening to this event will refresh their data.
 */
export function notifyTelephelyDataChanged() {
  window.dispatchEvent(new CustomEvent(TELEPHELY_DATA_CHANGED));
}

/**
 * Subscribe to telephely data changes
 */
export function subscribeToTelephelyChanges(callback: () => void) {
  window.addEventListener(TELEPHELY_DATA_CHANGED, callback);
  return () => window.removeEventListener(TELEPHELY_DATA_CHANGED, callback);
}

/**
 * Dispatch when a telephely membership is accepted (invitation flow).
 * AppSidebar listens to start polling for the new membership.
 */
export function notifyMembershipChanged() {
  window.dispatchEvent(new CustomEvent(TELEPHELY_MEMBERSHIP_CHANGED));
}

/**
 * Subscribe to membership changes (invitation accepted)
 */
export function subscribeToMembershipChanges(callback: () => void) {
  window.addEventListener(TELEPHELY_MEMBERSHIP_CHANGED, callback);
  return () => window.removeEventListener(TELEPHELY_MEMBERSHIP_CHANGED, callback);
}
