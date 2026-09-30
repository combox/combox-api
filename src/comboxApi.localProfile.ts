import { createBrowserProfileStorage } from './storage'

export type LocalProfile = {
  firstName: string
  lastName: string
  birthDate?: string
  avatarDataUrl: string
  gradient: string
}

const PROFILE_STORAGE_KEY = 'combox.profile.v1'

// Single shared store for the functional helpers in this module, so the
// memory-first mirror in `./storage` stays coherent no matter which API
// surface the app uses. See the SECURITY note in `./storage` for what is
// stored here (display PII, no tokens), why localStorage persistence is
// required, and the accepted residual risk. Deliberately no base64-style
// "obfuscation": it would not protect anything.
const store = createBrowserProfileStorage(PROFILE_STORAGE_KEY)

export function saveLocalProfile(profile: LocalProfile): void {
  store.write(profile)
}

export function getLocalProfile(): LocalProfile | null {
  return store.read()
}

export function clearLocalProfile(): void {
  // Wipes both the memory mirror and localStorage. Must be called on every
  // logout / session-invalid path — previously the cached profile survived
  // `clearAuth()` indefinitely. See `clearAuth` in `./comboxApi.auth` and the
  // 401 paths in `./comboxApi.core`.
  store.clear?.()
}
