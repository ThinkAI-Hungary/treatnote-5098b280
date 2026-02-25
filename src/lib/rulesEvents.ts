// Custom event for treatment rules changes
const RULES_DATA_CHANGED = 'RULES_DATA_CHANGED';

/**
 * Dispatch this event when treatment rules are created / deleted / regenerated.
 * Sidebar and other consumers re-fetch hasRules on this event.
 */
export function notifyRulesDataChanged() {
    window.dispatchEvent(new CustomEvent(RULES_DATA_CHANGED));
}

/**
 * Subscribe to rules changes
 */
export function subscribeToRulesChanges(callback: () => void) {
    window.addEventListener(RULES_DATA_CHANGED, callback);
    return () => window.removeEventListener(RULES_DATA_CHANGED, callback);
}
