import type { AuthSession, AuthTokens, AuthUser, ChatNotifications, ProfileSettings, ProfileUpdateInput, SavedTrack } from './comboxApi.types'
import { getLocalProfile, saveLocalProfile, clearLocalProfile, type LocalProfile } from './comboxApi.localProfile'
import { ApiError, apiRequest, authUrl, getAccessToken, getOrRefreshToken, parseJson } from './comboxApi.core'
import { clearStoredAuth, readAuthSnapshot, writeAuthSnapshot } from './comboxApi.session'

export type { LocalProfile }
export { getLocalProfile, saveLocalProfile, clearLocalProfile }

function updateStoredUser(user: AuthUser): void {
  const snapshot = readAuthSnapshot()
  if (!snapshot?.tokens) return
  writeAuthSnapshot({ user, tokens: snapshot.tokens })
  if (user.first_name && user.avatar_gradient) {
    saveLocalProfile({
      firstName: user.first_name,
      lastName: user.last_name || '',
      birthDate: user.birth_date,
      avatarDataUrl: user.avatar_data_url || '',
      gradient: user.avatar_gradient,
    })
  }
}

export function getCurrentUser(): AuthUser | null {
  return readAuthSnapshot()?.user ?? null
}

export async function forceRefreshSession(): Promise<boolean> {
  const tokens = await getOrRefreshToken(true)
  return Boolean(tokens)
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken())
}

export function clearAuth(): void {
  // Local logout: drop bearer credentials AND the cached profile PII
  // together. The profile cache previously survived logout indefinitely.
  clearStoredAuth()
  clearLocalProfile()
}

export async function login(loginValue: string, password: string, loginKey: string): Promise<{ user: AuthUser }> {
  const response = await fetch(authUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ login: loginValue, password, login_key: loginKey }),
  })
  const payload = await parseJson<{ message?: string; user?: AuthUser; tokens?: AuthTokens; code?: string; details?: Record<string, string> }>(response)
  if (!response.ok || !payload?.user || !payload?.tokens) {
    throw new ApiError(payload?.code || 'login_failed', payload?.message || 'Login failed', payload?.details)
  }
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
  return { user: payload.user }
}

export type RegisterProfileInput = {
  first_name: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
}

export async function register(email: string, username: string, password: string, profile: RegisterProfileInput): Promise<{ user: AuthUser }> {
  const response = await fetch(authUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, username, password, ...profile }),
  })
  const payload = await parseJson<{ message?: string; user?: AuthUser; tokens?: AuthTokens; code?: string; details?: Record<string, string> }>(response)
  if (!response.ok || !payload?.user || !payload?.tokens) {
    throw new ApiError(payload?.code || 'register_failed', payload?.message || 'Register failed', payload?.details)
  }
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
  return { user: payload.user }
}

export async function getProfile(): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile')
  if (!payload.user) throw new ApiError('request_failed', 'Profile fetch failed')
  updateStoredUser(payload.user)
  return payload.user
}

export async function getUserByID(userID: string): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>(`/users/${encodeURIComponent(userID)}`)
  if (!payload.user) throw new ApiError('request_failed', 'User fetch failed')
  return payload.user
}

export async function updateProfile(input: ProfileUpdateInput): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile', { method: 'PATCH', body: input })
  if (!payload.user) throw new ApiError('request_failed', 'Profile update failed')
  updateStoredUser(payload.user)
  return payload.user
}

export async function updateSavedTracks(tracks: SavedTrack[]): Promise<AuthUser> {
  return updateProfile({ saved_tracks: tracks })
}

export async function updateSessionIdleTTL(seconds: number | null): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile', {
    method: 'PATCH',
    body: { session_idle_ttl_seconds: typeof seconds === 'number' ? seconds : null },
  })
  if (!payload.user) throw new ApiError('request_failed', 'Session ttl update failed')
  updateStoredUser(payload.user)
  return payload.user
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/profile/password', { method: 'POST', body: { current_password: currentPassword, new_password: newPassword } })
}

export async function getProfileSettings(): Promise<{ settings: ProfileSettings; chat_notifications: ChatNotifications }> {
  const payload = await apiRequest<{ settings?: ProfileSettings; chat_notifications?: ChatNotifications }>('/profile/settings')
  return {
    settings: payload.settings ?? { show_last_seen: true },
    chat_notifications: payload.chat_notifications ?? { muted_chat_ids: [], unread_by_chat: {} },
  }
}

export async function updateProfileSettings(showLastSeen: boolean): Promise<{ settings: ProfileSettings; chat_notifications: ChatNotifications }> {
  const payload = await apiRequest<{ settings?: ProfileSettings; chat_notifications?: ChatNotifications }>('/profile/settings', {
    method: 'PATCH',
    body: { show_last_seen: showLastSeen },
  })
  return {
    settings: payload.settings ?? { show_last_seen: showLastSeen },
    chat_notifications: payload.chat_notifications ?? { muted_chat_ids: [], unread_by_chat: {} },
  }
}

export async function setChatMuted(chatID: string, muted: boolean): Promise<ChatNotifications> {
  const payload = await apiRequest<{ chat_notifications?: ChatNotifications }>('/profile/settings', {
    method: 'PATCH',
    body: { chat_mute: { chat_id: chatID, muted } },
  })
  return payload.chat_notifications ?? { muted_chat_ids: [], unread_by_chat: {} }
}

export async function startEmailChange(): Promise<void> {
  await apiRequest('/profile/email/change/start', { method: 'POST' })
}

export async function verifyOldEmailCode(code: string): Promise<boolean> {
  const payload = await apiRequest<{ verified?: boolean }>('/profile/email/change/verify-old', { method: 'POST', body: { code } })
  return Boolean(payload.verified)
}

export async function sendNewEmailCode(email: string): Promise<void> {
  await apiRequest('/profile/email/change/send-new', { method: 'POST', body: { email } })
}

export async function confirmEmailChange(code: string): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile/email/change/confirm', { method: 'POST', body: { code } })
  if (!payload.user) throw new ApiError('request_failed', 'Email change failed')
  updateStoredUser(payload.user)
  return payload.user
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const response = await fetch(authUrl('/auth/email-exists'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const payload = await parseJson<{ exists?: boolean; code?: string; message?: string; details?: Record<string, string> }>(response)
  if (!response.ok) throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
  return Boolean(payload?.exists)
}

export async function sendEmailCode(email: string): Promise<void> {
  const response = await fetch(authUrl('/auth/email-code/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const payload = await parseJson<{ code?: string; message?: string; details?: Record<string, string> }>(response)
  if (!response.ok) throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
}

export async function verifyEmailCode(email: string, code: string, purpose: 'login' | 'signup' = 'signup'): Promise<{ verified: boolean; login_key?: string }> {
  const response = await fetch(authUrl('/auth/email-code/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, code, purpose }),
  })
  const payload = await parseJson<{ verified?: boolean; login_key?: string; code?: string; message?: string; details?: Record<string, string> }>(response)
  if (!response.ok) throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
  return { verified: Boolean(payload?.verified), login_key: payload?.login_key }
}

// ---------------------------------------------------------------------------
// Active sessions
// ---------------------------------------------------------------------------

/** Every still-valid session of the signed-in user, newest first. */
export async function listAuthSessions(): Promise<AuthSession[]> {
  const payload = await apiRequest<{ items?: AuthSession[] }>('/auth/sessions')
  return Array.isArray(payload.items) ? payload.items : []
}

/**
 * Revokes one session. The current session may be revoked too; revoking a
 * session of somebody else (or an unknown id) fails with
 * ApiError('not_found'). The refresh token of a revoked session stops working
 * immediately.
 */
export async function revokeAuthSession(sessionID: string): Promise<void> {
  await apiRequest(`/auth/sessions/${encodeURIComponent(sessionID)}`, { method: 'DELETE' })
}

/**
 * Revokes every session except `keepSessionID`. Passing nothing keeps the
 * session the current access token belongs to; passing an explicit id wins
 * over that, and passing an empty string alongside a token without a session
 * claim revokes them all.
 *
 * @returns how many sessions were revoked.
 */
export async function revokeOtherAuthSessions(keepSessionID?: string): Promise<number> {
  const payload = await apiRequest<{ revoked?: number }>('/auth/sessions/revoke-others', {
    method: 'POST',
    body: keepSessionID ? { keep_session_id: keepSessionID } : {},
  })
  return typeof payload.revoked === 'number' ? payload.revoked : 0
}

// ---------------------------------------------------------------------------
// Global user settings ("Notifications and Sounds" / "Data and Storage")
// ---------------------------------------------------------------------------

/**
 * Every whitelisted toggle as the strings 'true' / 'false'. Keys the user
 * never touched come back filled with their documented default:
 * notifications_enabled=true, notification_previews=true, sounds_enabled=true,
 * badge_enabled=true, voice_autoplay=false, media_autoplay=true,
 * data_saver=false, auto_download_photos=true, auto_download_videos=false,
 * auto_download_files=false, notifications_private/groups/channels/reactions=true,
 * notification_preview_name/text=true, events_contact_joined/pinned=true,
 * calls_accept=true, badge_include_muted/folders_count/count_messages=false,
 * delete_account_ttl='6_months' (the only non-boolean key).
 */
export type UserSettingKey =
  | 'notifications_enabled'
  | 'notification_previews'
  | 'sounds_enabled'
  | 'badge_enabled'
  | 'voice_autoplay'
  | 'media_autoplay'
  | 'data_saver'
  | 'auto_download_photos'
  | 'auto_download_videos'
  | 'auto_download_files'
  | 'notifications_private'
  | 'notifications_groups'
  | 'notifications_channels'
  | 'notifications_reactions'
  | 'notification_preview_name'
  | 'notification_preview_text'
  | 'events_contact_joined'
  | 'events_pinned'
  | 'calls_accept'
  | 'badge_include_muted'
  | 'badge_folders_count'
  | 'badge_count_messages'
  | 'delete_account_ttl'

export const USER_SETTING_KEYS: readonly UserSettingKey[] = [
  'notifications_enabled',
  'notification_previews',
  'sounds_enabled',
  'badge_enabled',
  'voice_autoplay',
  'media_autoplay',
  'data_saver',
  'auto_download_photos',
  'auto_download_videos',
  'auto_download_files',
  'notifications_private',
  'notifications_groups',
  'notifications_channels',
  'notifications_reactions',
  'notification_preview_name',
  'notification_preview_text',
  'events_contact_joined',
  'events_pinned',
  'calls_accept',
  'badge_include_muted',
  'badge_folders_count',
  'badge_count_messages',
  'delete_account_ttl',
]

/** Delete-account inactivity TTL. Storage only: nothing deletes automatically. */
export type DeleteAccountTTL = '1_month' | '3_months' | '6_months' | '12_months'

export const DELETE_ACCOUNT_TTL_VALUES: readonly DeleteAccountTTL[] = ['1_month', '3_months', '6_months', '12_months']

export const USER_SETTING_DEFAULTS: Record<UserSettingKey, string> = {
  notifications_enabled: 'true',
  notification_previews: 'true',
  sounds_enabled: 'true',
  badge_enabled: 'true',
  voice_autoplay: 'false',
  media_autoplay: 'true',
  data_saver: 'false',
  auto_download_photos: 'true',
  auto_download_videos: 'false',
  auto_download_files: 'false',
  notifications_private: 'true',
  notifications_groups: 'true',
  notifications_channels: 'true',
  notifications_reactions: 'true',
  notification_preview_name: 'true',
  notification_preview_text: 'true',
  events_contact_joined: 'true',
  events_pinned: 'true',
  calls_accept: 'true',
  badge_include_muted: 'false',
  badge_folders_count: 'false',
  badge_count_messages: 'false',
  delete_account_ttl: '6_months',
}

/** Partial patch: booleans for toggle keys, a DeleteAccountTTL for the TTL key. */
export type UserSettingsPatch = Partial<Record<UserSettingKey, boolean | DeleteAccountTTL>>

export function isUserSettingKey(key: string): key is UserSettingKey {
  return (USER_SETTING_KEYS as readonly string[]).includes(key)
}

export async function getUserSettings(): Promise<Record<string, string>> {
  const payload = await apiRequest<{ settings?: Record<string, string> }>('/profile/user-settings')
  return payload.settings ?? {}
}

/**
 * Applies a partial patch and returns every whitelisted key afterwards.
 * Booleans are serialised as 'true' / 'false', the TTL string is passed
 * through; keys outside the whitelist are rejected by the API with
 * ApiError('invalid_argument').
 */
export async function updateUserSettings(patch: UserSettingsPatch): Promise<Record<string, string>> {
  const settings: Record<string, string> = {}
  for (const key of Object.keys(patch)) {
    const value = (patch as Record<string, unknown>)[key]
    if (typeof value === 'boolean') settings[key] = value ? 'true' : 'false'
    else if (typeof value === 'string' && value.trim().length > 0) settings[key] = value.trim()
  }
  const payload = await apiRequest<{ settings?: Record<string, string> }>('/profile/user-settings', {
    method: 'PUT',
    body: { settings },
  })
  return payload.settings ?? {}
}
