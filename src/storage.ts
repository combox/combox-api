export type TokenSnapshot = {
  access_token: string
  refresh_token: string
  expires_in_sec: number
}

export type UserSnapshot = {
  id: string
}

export type AuthSnapshot = {
  user: UserSnapshot
  tokens: TokenSnapshot
}

export type StoredProfile = {
  firstName: string
  lastName: string
  birthDate?: string
  avatarDataUrl: string
  gradient: string
}

export interface AuthStorage {
  read(): AuthSnapshot | null
  write(snapshot: AuthSnapshot): void
  clear(): void
}

export interface ProfileStorage {
  read(): StoredProfile | null
  write(profile: StoredProfile): void
  // Optional (not required) so existing third-party implementations of this
  // interface keep compiling; the bundled browser storage always provides it.
  // Callers must use `storage.clear?.()`.
  clear?(): void
}

// SECURITY (CodeQL js/clear-text-storage-of-sensitive-information).
//
// WHAT IS STORED HERE:
// - Auth storage (`combox.auth.v1`): bearer credentials — `access_token` +
//   `refresh_token` — plus the signed-in user's record. Anyone who can read
//   this value can impersonate the user until the tokens expire or are
//   revoked. This is the sensitive item in this file.
// - Profile storage (`combox.profile.v1`): display-PII cache (names, birth
//   date, avatar data URL). Less sensitive than tokens, but still personal
//   data that must not outlive the session.
//
// WHY localStorage (and not memory-only):
// - The SDK must survive page reloads, and there is no backend component
//   here that could hold httpOnly cookies or a token vault, so some
//   client-side persistence is required by design. sessionStorage would not
//   change the finding (same-origin script reads it just as easily) while
//   breaking "remember me" persistence, so it was not adopted.
// - A memory-first mirror (`memMirror` below) is kept write-through: reads
//   prefer memory and `clear()` provably drops the in-memory copy as well.
//   It is NOT a security boundary — any script running in this origin (XSS,
//   compromised dependency, malicious extension) can read both the mirror
//   and localStorage equally.
// - Deliberately NOT done: base64/"obfuscation" or home-grown encryption
//   with an in-origin key. base64 is an encoding, not protection, and any
//   key the page can read is a key the attacker can read — without a backend
//   to agree keys with, client-side "encryption" only pretends to help. The
//   real fix (httpOnly cookie sessions / BFF token vault) is server-side and
//   out of scope for this SDK.
//
// DATA MINIMISATION applied:
// - Nothing beyond the session/profile payloads is persisted: no passwords,
//   no keys, no E2E material; refresh rotation overwrites tokens in place
//   instead of accumulating them.
// - Cached profile PII is now wiped together with auth on every logout /
//   session-invalid path (previously profile data survived `clearAuth()`
//   indefinitely). See `clearAuth`, the `comboxApi.core` 401 paths and
//   `ComboxClient.clearAuth`.
//
// RESIDUAL RISK (accepted and documented): tokens and profile PII rest in
// clear text in this origin's localStorage and are readable by any code
// executing in the origin. Mitigate at the app level with a strict CSP,
// dependency hygiene, short token TTLs with rotation, and server-side
// revocation on logout.
const memMirror = new Map<string, string>()

let crossTabArmed = false
function armCrossTabInvalidation(): void {
  if (crossTabArmed || typeof window === 'undefined') return
  crossTabArmed = true
  // Another tab's writes must invalidate our memory mirror, otherwise a
  // stale mirror would defeat the cross-tab refresh-token rotation checks
  // in `comboxApi.core` / `ComboxClient` (they re-read the snapshot to
  // detect a rotation performed elsewhere). `storage` events fire only in
  // *other* tabs, which is exactly the case the mirror cannot see itself.
  window.addEventListener('storage', (event) => {
    if (event.key === null) memMirror.clear()
    else if (event.key) memMirror.delete(event.key)
  })
}

function readRaw(key: string): string | null {
  armCrossTabInvalidation()
  const hit = memMirror.get(key)
  if (hit !== undefined) return hit
  try {
    const raw = window.localStorage.getItem(key)
    if (raw !== null) memMirror.set(key, raw)
    return raw
  } catch {
    // Storage access can throw (e.g. blocked third-party storage); fall back
    // to whatever the memory mirror holds (possibly nothing).
    return memMirror.get(key) ?? null
  }
}

function writeRaw(key: string, raw: string): void {
  memMirror.set(key, raw)
  try {
    window.localStorage.setItem(key, raw)
  } catch {
    // Persistence is best-effort (e.g. quota / private mode): the memory
    // mirror still holds the value for the lifetime of this tab.
  }
}

function clearRaw(key: string): void {
  // Memory first, so the secret is gone from this tab even if the
  // localStorage call below throws.
  memMirror.delete(key)
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Already dropped from memory; nothing more this tab can do.
  }
}

export function createBrowserAuthStorage(key = 'combox.auth.v1'): AuthStorage {
  return {
    read() {
      const raw = readRaw(key)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as AuthSnapshot
        if (!parsed?.tokens?.access_token || !parsed?.tokens?.refresh_token || !parsed?.user?.id) return null
        return parsed
      } catch {
        return null
      }
    },
    write(snapshot) {
      writeRaw(key, JSON.stringify(snapshot))
    },
    clear() {
      clearRaw(key)
    },
  }
}

export function createBrowserProfileStorage(key = 'combox.profile.v1'): ProfileStorage {
  return {
    read() {
      const raw = readRaw(key)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as StoredProfile
        if (!parsed?.firstName || !parsed?.gradient) return null
        return parsed
      } catch {
        return null
      }
    },
    write(profile) {
      writeRaw(key, JSON.stringify(profile))
    },
    clear() {
      clearRaw(key)
    },
  }
}
