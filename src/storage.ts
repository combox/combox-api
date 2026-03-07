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
}

export function createBrowserAuthStorage(key = 'combox.auth.v1'): AuthStorage {
  return {
    read() {
      const raw = window.localStorage.getItem(key)
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
      window.localStorage.setItem(key, JSON.stringify(snapshot))
    },
    clear() {
      window.localStorage.removeItem(key)
    },
  }
}

export function createBrowserProfileStorage(key = 'combox.profile.v1'): ProfileStorage {
  return {
    read() {
      const raw = window.localStorage.getItem(key)
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
      window.localStorage.setItem(key, JSON.stringify(profile))
    },
  }
}
