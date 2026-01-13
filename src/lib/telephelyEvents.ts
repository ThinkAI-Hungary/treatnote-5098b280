// Custom event for telephely data changes (domain, probapaciens, etc.)
const TELEPHELY_DATA_CHANGED = 'TELEPHELY_DATA_CHANGED';

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
