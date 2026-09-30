import type { AuthTokens, AuthUser } from './comboxApi.types'

export type AuthSnapshot = {
  user: AuthUser
  tokens: AuthTokens
}

const AUTH_STORAGE_KEY = 'combox.auth.v1'

// SECURITY (CodeQL js/clear-text-storage-of-sensitive-information).
//
// WHAT IS STORED: the full signed-in user record plus bearer credentials
// (`access_token` + `refresh_token`). See the extended SECURITY note in
// `./storage`: localStorage persistence is required by design (no backend
// here for httpOnly cookies / token vault), base64 or home-grown in-origin
// "encryption" is deliberately NOT used (it protects nothing), and the
// residual risk (any same-origin script can read these values) is accepted
// and must be mitigated app-side (CSP, short TTLs, server revocation).
//
// NOTE: this module intentionally keeps direct localStorage semantics with
// NO memory cache of its own — `comboxApi.core` re-reads the snapshot to
// detect refresh-token rotation performed by another tab, and any cache here
// could serve a stale token and cause a false logout. The class-based client
// (`./storage`) keeps its own write-through mirror with `storage`-event
// invalidation instead.

export function readAuthSnapshot(): AuthSnapshot | null {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthSnapshot
    if (!parsed?.tokens?.access_token || !parsed?.tokens?.refresh_token || !parsed?.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

export function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot))
}

export function clearStoredAuth(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}
