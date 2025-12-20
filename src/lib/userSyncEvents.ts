// Cross-page/event-bus helpers for keeping user lists in sync.

export const USERS_DATA_CHANGED = 'users-data-changed';

export function notifyUsersDataChanged(detail?: {
  userId?: string;
  source?: string;
}) {
  window.dispatchEvent(new CustomEvent(USERS_DATA_CHANGED, { detail }));
}
