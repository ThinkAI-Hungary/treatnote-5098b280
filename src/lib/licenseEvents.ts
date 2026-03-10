// Custom event for license state changes (buy, cancel, expiry)
const LICENSE_DATA_CHANGED = 'LICENSE_DATA_CHANGED';

/**
 * Dispatch this event when a license is bought, cancelled or expires.
 * AppSidebar re-evaluates hasActiveLicense immediately on this event
 * (before the Stripe webhook arrives to update the DB).
 */
export function notifyLicenseDataChanged() {
    window.dispatchEvent(new CustomEvent(LICENSE_DATA_CHANGED));
}

/**
 * Subscribe to license state changes.
 * Returns an unsubscribe function.
 */
export function subscribeToLicenseChanges(callback: () => void) {
    window.addEventListener(LICENSE_DATA_CHANGED, callback);
    return () => window.removeEventListener(LICENSE_DATA_CHANGED, callback);
}
