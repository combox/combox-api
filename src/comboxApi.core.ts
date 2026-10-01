import type { AuthTokens } from './comboxApi.types'
import { clearStoredAuth, readAuthSnapshot, writeAuthSnapshot } from './comboxApi.session'
import { clearLocalProfile } from './comboxApi.localProfile'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const API_ENV = (import.meta as ImportMeta & {
  env?: {
    VITE_API_BASE_URL?: string
    VITE_WS_BASE_URL?: string
  }
}).env

function inferDefaultAPIBase(): string {
  if (typeof window === 'undefined') return '/api/private/v1'
  const host = window.location.host.toLowerCase()
  if (host === 'app.combox.local') {
    return `${window.location.protocol}//api.combox.local/api/private/v1`
  }
  return '/api/private/v1'
}

function inferDefaultWSBase(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.host.toLowerCase()
  if (host === 'app.combox.local') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//api.combox.local/api/private/v1/ws`
  }
  return ''
}

export const API_BASE = API_ENV?.VITE_API_BASE_URL ?? inferDefaultAPIBase()
export const WS_BASE = API_ENV?.VITE_WS_BASE_URL ?? inferDefaultWSBase()

function decodeJwtExp(token: string): number | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    if (typeof atob !== 'function') return null
    const json = atob(padded)
    const payload = JSON.parse(json) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function isTokenExpiredOrNearExpiry(token: string, skewSeconds = 20): boolean {
  const exp = decodeJwtExp(token)
  if (!exp) return true
  const now = Math.floor(Date.now() / 1000)
  return exp <= now + skewSeconds
}

export class ApiError extends Error {
  code: string
  details: Record<string, string>

  constructor(code: string, message: string, details?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details ?? {}
  }
}

export function authUrl(path: string): string {
  return `${API_BASE}${path}`
}

export function redirectToAuthIfNeeded(): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/auth')) return
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.replace(`/auth?next=${encodeURIComponent(next)}`)
}

export async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function getAccessToken(): string | null {
  return readAuthSnapshot()?.tokens.access_token ?? null
}

type RefreshResult =
  | { kind: 'ok'; tokens: AuthTokens }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }

let refreshPromise: Promise<RefreshResult> | null = null

async function refreshAuthTokens(): Promise<RefreshResult> {
  const snapshot = readAuthSnapshot()
  if (!snapshot?.tokens?.refresh_token) return { kind: 'missing' }
  const usedRefreshToken = snapshot.tokens.refresh_token

  try {
    const response = await fetch(authUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: usedRefreshToken }),
    })
    const payload = await parseJson<{ tokens?: AuthTokens; message?: string; code?: string }>(response)
    if (!response.ok || !payload?.tokens) {
      if (response.status === 401 || response.status === 403) {
        // Cross-tab safety: another tab may have refreshed (rotating refresh_token)
        // while we were in-flight. In that case, use the latest snapshot and do not logout.
        const current = readAuthSnapshot()
        if (current?.tokens?.refresh_token && current.tokens.refresh_token !== usedRefreshToken && current.tokens.access_token) {
          return { kind: 'ok', tokens: current.tokens }
        }
        clearStoredAuth()
        clearLocalProfile()
        return { kind: 'invalid' }
      }
      return { kind: 'unavailable' }
    }

    const next = { user: snapshot.user, tokens: payload.tokens }
    writeAuthSnapshot(next)
    return { kind: 'ok', tokens: payload.tokens }
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function getOrRefreshToken(forceRefresh = false): Promise<string | null> {
  return (await getOrRefreshTokenDetailed(forceRefresh)).token
}

export type TokenRefreshOutcome = 'ok' | 'missing' | 'invalid' | 'unavailable'

/**
 * Resolves a usable access token together with the reason it may be missing.
 *
 * `unavailable` means the network/server was unreachable (deploy, restart, IP
 * change, offline laptop) — the stored session must be kept, the caller should
 * retry later instead of logging the user out.
 * `missing` / `invalid` mean there is no session left to restore, a logout is safe.
 */
export async function getOrRefreshTokenDetailed(
  forceRefresh = false,
): Promise<{ token: string | null; outcome: TokenRefreshOutcome }> {
  const accessToken = getAccessToken()
  if (!forceRefresh && accessToken && !isTokenExpiredOrNearExpiry(accessToken)) {
    return { token: accessToken, outcome: 'ok' }
  }
  if (!refreshPromise) {
    refreshPromise = refreshAuthTokens().finally(() => {
      refreshPromise = null
    })
  }
  const refreshed = await refreshPromise
  return refreshed.kind === 'ok'
    ? { token: refreshed.tokens.access_token, outcome: 'ok' }
    : { token: null, outcome: refreshed.kind }
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  noAuth?: boolean
  headers?: Record<string, string>
}

export async function apiRequest<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const token = options?.noAuth ? null : await getOrRefreshToken()
  if (!options?.noAuth && !token) {
    if (readAuthSnapshot()?.tokens?.refresh_token) {
      throw new ApiError('session_refresh_unavailable', 'Session refresh unavailable')
    }
    clearStoredAuth()
    clearLocalProfile()
    redirectToAuthIfNeeded()
    throw new ApiError('unauthorized', 'Unauthorized')
  }

  const method = options?.method ?? 'GET'
  const isGet = method === 'GET'

  const response = await fetch(authUrl(path), {
    method,
    headers: {
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: isGet ? 'no-store' : 'default',
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401 && !options?.noAuth) {
    // Single-flight: a navigation burst fires N parallel requests with the
    // same stale access token; all get 401 here. The backend rotates the
    // refresh token on every Refresh (old value is invalidated immediately,
    // no reuse window), so N parallel refreshes => first wins, the rest get
    // 401 invalid_refresh_token => random logout. Join one shared refresh via
    // getOrRefreshTokenDetailed(true) instead of calling refreshAuthTokens()
    // directly. Retry the original request exactly once. Logout ONLY on an
    // explicit 401/403 from /auth/refresh (missing/invalid); network errors
    // (unavailable) and a 401 from the retried resource never log out.
    const failedToken = token
    const currentAccess = getAccessToken()
    let fresh: string | null
    let outcome: TokenRefreshOutcome
    if (currentAccess && currentAccess !== failedToken && !isTokenExpiredOrNearExpiry(currentAccess)) {
      // Another in-flight request already refreshed while we were failing.
      // Reuse it without forcing a second rotation.
      fresh = currentAccess
      outcome = 'ok'
    } else {
      const detailed = await getOrRefreshTokenDetailed(true)
      fresh = detailed.token
      outcome = detailed.outcome
    }
    if (!fresh) {
      if (outcome === 'unavailable') {
        throw new ApiError('session_refresh_unavailable', 'Session refresh unavailable')
      }
      clearStoredAuth()
      clearLocalProfile()
      redirectToAuthIfNeeded()
      throw new ApiError('unauthorized', 'Unauthorized')
    }
    const retry = await fetch(authUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
        Authorization: `Bearer ${fresh}`,
      },
      cache: isGet ? 'no-store' : 'default',
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
    if (!retry.ok) {
      const errPayload = await parseJson<{ code?: string; message?: string; details?: Record<string, string> }>(retry)
      throw new ApiError(errPayload?.code || 'request_failed', errPayload?.message || 'Request failed', errPayload?.details)
    }
    return (await retry.json()) as T
  }

  if (!response.ok) {
    const errPayload = await parseJson<{ code?: string; message?: string; details?: Record<string, string> }>(response)
    throw new ApiError(errPayload?.code || 'request_failed', errPayload?.message || 'Request failed', errPayload?.details)
  }

  if (response.status === 204) {
    return {} as T
  }

  return (await response.json()) as T
}

export { sleep }
