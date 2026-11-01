export type AppRole = 'admin' | 'researcher' | 'doctor';
export type RouteAccessDecision = 'loading' | 'login' | 'denied' | 'allowed';

export interface RouteAccessContext {
  userId: string | null;
  loading: boolean;
  roleLoading: boolean;
  role: AppRole | null;
  requiredRole?: AppRole;
}

/** A role is not authorized until the server-side user_roles lookup has completed. */
export function resolveRouteAccess(context: RouteAccessContext): RouteAccessDecision {
  if (context.loading || (context.userId !== null && context.roleLoading)) return 'loading';
  if (!context.userId) return 'login';
  if (context.requiredRole && context.role !== context.requiredRole) return 'denied';
  return 'allowed';
}

/** This checks input format; the real entitlement is enforced by Supabase patients RLS. */
export function preparePatientLookup(userId: string | null, patientIdentifier: string): string | null {
  if (!userId) return null;
  const identifier = patientIdentifier.trim();
  return /^[\p{L}\p{N}_-]{3,80}$/u.test(identifier) ? identifier : null;
}


/** Sign-up metadata is public input, never an authorization or role source. */
export function sanitizeSignupMetadata(metadata: {
  first_name: string;
  last_name: string;
  role?: unknown;
}): { first_name: string; last_name: string } {
  return {
    first_name: metadata.first_name.trim().slice(0, 100),
    last_name: metadata.last_name.trim().slice(0, 100),
  };
}
