import type { AuthTokens, AuthUser } from './comboxApi.types'
import { ApiError, apiRequest } from './comboxApi.core'
import { writeAuthSnapshot } from './comboxApi.session'
import { saveLocalProfile } from './comboxApi.localProfile'

/**
 * BoxChat legacy email binding (migration 000044).
 *
 * Flow: after a password login that answers `migration_required: true`
 * (or any API call that fails with code EMAIL_BINDING_REQUIRED), the client
 * calls requestLegacyBindEmail() to get an OTP mailed to the new address,
 * then verifyLegacyBindEmail() to store the address and upgrade the
 * migr-limited session to a full one.
 *
 * Both calls require the migr-limited access token; apiRequest attaches it
 * automatically from the stored auth snapshot.
 */

/** Machine-readable code of the 403 the API returns for migr-limited tokens outside the allowlist. */
export const EMAIL_BINDING_REQUIRED = 'EMAIL_BINDING_REQUIRED'

export type LegacyBindRequestResult = {
  ok: boolean
  resend_after: number
}

/**
 * Same shape as the login() result: the user plus the migration flag.
 * The fresh full-session tokens are persisted to the auth snapshot inside
 * verifyLegacyBindEmail(), exactly like login() does (they are not returned
 * to avoid duplicating the stored-token contract).
 */
export type LegacyLoginResult = {
  user: AuthUser
  migration_required?: boolean
}

/** True when err is the API's "bind an email first" rejection. */
export function isEmailBindingRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === EMAIL_BINDING_REQUIRED
}

/**
 * Issues a 6-digit OTP to `email` (10 minute TTL, 60s resend cooldown).
 * Rejects with ApiError('conflict') when the address is taken and
 * ApiError('invalid_argument') for a malformed address.
 */
export async function requestLegacyBindEmail(email: string): Promise<LegacyBindRequestResult> {
  const payload = await apiRequest<{ ok?: boolean; resend_after?: number }>('/auth/legacy/bind-email/request', {
    method: 'POST',
    body: { email },
  })
  return { ok: Boolean(payload.ok), resend_after: typeof payload.resend_after === 'number' ? payload.resend_after : 0 }
}

/**
 * Verifies the OTP, binds the address (clearing the legacy flag server-side)
 * and upgrades the session: the returned user owns a full token afterwards.
 */
export async function verifyLegacyBindEmail(email: string, code: string): Promise<LegacyLoginResult> {
  const payload = await apiRequest<{ user?: AuthUser; tokens?: AuthTokens; migration_required?: boolean }>('/auth/legacy/bind-email/verify', {
    method: 'POST',
    body: { email, code },
  })
  if (!payload.user || !payload.tokens) throw new ApiError('request_failed', 'Email binding failed')
  writeAuthSnapshot({ user: payload.user, tokens: payload.tokens })
  if (payload.user.first_name && payload.user.avatar_gradient) {
    saveLocalProfile({
      firstName: payload.user.first_name,
      lastName: payload.user.last_name || '',
      birthDate: payload.user.birth_date,
      avatarDataUrl: payload.user.avatar_data_url || '',
      gradient: payload.user.avatar_gradient,
    })
  }
  return { user: payload.user, migration_required: payload.migration_required }
}
