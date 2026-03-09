import type { AuthTokens, AuthUser } from './comboxApi.types'

export type AuthSnapshot = {
  user: AuthUser
  tokens: AuthTokens
}

const AUTH_STORAGE_KEY = 'combox.auth.v1'

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
