export type LocalProfile = {
  firstName: string
  lastName: string
  birthDate?: string
  avatarDataUrl: string
  gradient: string
}

const PROFILE_STORAGE_KEY = 'combox.profile.v1'

export function saveLocalProfile(profile: LocalProfile): void {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

export function getLocalProfile(): LocalProfile | null {
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LocalProfile
    if (!parsed?.firstName || !parsed?.gradient) return null
    return parsed
  } catch {
    return null
  }
}
