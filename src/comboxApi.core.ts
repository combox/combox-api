import type { AuthTokens } from './comboxApi.types'
import { clearStoredAuth, readAuthSnapshot, writeAuthSnapshot } from './comboxApi.session'

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
  const accessToken = getAccessToken()
  if (!forceRefresh && accessToken && !isTokenExpiredOrNearExpiry(accessToken)) return accessToken
  if (!refreshPromise) {
    refreshPromise = refreshAuthTokens().finally(() => {
      refreshPromise = null
    })
  }
  const refreshed = await refreshPromise
  return refreshed.kind === 'ok' ? refreshed.tokens.access_token : null
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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
    const nextTokens = await refreshAuthTokens()
    if (nextTokens.kind !== 'ok') {
      if (nextTokens.kind === 'unavailable') {
        throw new ApiError('session_refresh_unavailable', 'Session refresh unavailable')
      }
      clearStoredAuth()
      redirectToAuthIfNeeded()
      throw new ApiError('unauthorized', 'Unauthorized')
    }
    const retry = await fetch(authUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
        Authorization: `Bearer ${nextTokens.tokens.access_token}`,
      },
      cache: isGet ? 'no-store' : 'default',
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
    if (!retry.ok) {
      if (retry.status === 401) {
        clearStoredAuth()
        redirectToAuthIfNeeded()
      }
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
