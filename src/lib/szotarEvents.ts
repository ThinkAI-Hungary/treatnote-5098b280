// Custom event for szótár changes (szotar / szotar_kezelesek)
const SZOTAR_DATA_CHANGED = 'SZOTAR_DATA_CHANGED';

/**
 * Dispatch this event when szótár data is updated.
 * Components listening to this event will refresh their data.
 */
export function notifySzotarDataChanged() {
  window.dispatchEvent(new CustomEvent(SZOTAR_DATA_CHANGED));
}

/**
 * Subscribe to szótár changes
 */
export function subscribeToSzotarChanges(callback: () => void) {
  window.addEventListener(SZOTAR_DATA_CHANGED, callback);
  return () => window.removeEventListener(SZOTAR_DATA_CHANGED, callback);
}
