import type { AppRole } from '../components/auth/access-policy';
import { isTransientRequestFailure } from './requestFailures';

export interface ValidatedRoleState { role: AppRole | null; validated: boolean }

/** A network outage is not an authoritative revocation; a successful empty lookup is. */
export function roleAfterRefresh(previous: ValidatedRoleState, role: AppRole | null, error?: unknown): ValidatedRoleState {
  if (!error) return { role, validated: true };
  if (previous.validated && isTransientRequestFailure(error)) return previous;
  return { role: null, validated: false };
}

/** Token refresh and repeated SIGNED_IN events must not remount consumers of identity. */
export function userAfterSessionEvent<T extends { id: string }>(previous: T | null, next: T | null, event?: string): T | null {
  return previous && next?.id === previous.id && event !== 'USER_UPDATED' ? previous : next;
}
