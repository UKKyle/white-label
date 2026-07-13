import type { APIContext } from 'astro';
import type { PlatformRole, PlatformSession } from '../../types/platform';
import { clearSession, createSession, getSession, getUserById, requireStoreAccess } from './store';

const COOKIE = 'wl_platform_session';
const MAX_AGE = 60 * 60 * 8;

function readCookie(request: Request) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
export function sessionCookie(token: string) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE}`; }
export function clearSessionCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }
export async function startSession(input: Omit<PlatformSession, 'expiresAt'>, context: APIContext) { const token = await createSession({ ...input, expiresAt: Date.now() + MAX_AGE * 1000 }, context); return sessionCookie(token); }
export async function currentSession(context: APIContext) { const session = await getSession(readCookie(context.request), context); return session && session.expiresAt > Date.now() ? session : null; }
export async function endSession(context: APIContext) { await clearSession(readCookie(context.request), context); return clearSessionCookie(); }
export async function requireAuthenticatedUser(context: APIContext) {
  const session = await currentSession(context);
  if (session?.role === 'platform_owner') {
    return { session, user: { id: session.userId, email: session.userId, passwordHash: '', firstName: 'Platform', lastName: 'Owner', phone: '', platformRole: 'platform_owner' as const, status: 'active' as const, createdAt: '', updatedAt: '' } };
  }
  const user = session ? await getUserById(session.userId, context) : null;
  return session && user && user.status === 'active' ? { session, user } : null;
}
export async function requirePlatformOwner(context: APIContext) {
  const value = await requireAuthenticatedUser(context); return value?.session.role === 'platform_owner' ? value : null;
}
export async function requireStoreMembership(context: APIContext, storeId?: string) {
  const value = await requireAuthenticatedUser(context); if (!value || value.session.role === 'platform_owner') return null;
  const activeStoreId = storeId ?? value.session.storeId; if (!activeStoreId) return null;
  const access = await requireStoreAccess(value.user.id, activeStoreId, context); return access ? { ...value, ...access } : null;
}
export function hasStoreRole(role: PlatformRole, allowed: PlatformRole[]) { return allowed.includes(role); }
