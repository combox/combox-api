import type { AuthTokens, AuthUser, ChatNotifications, ProfileSettings, ProfileUpdateInput } from './comboxApi.types'
import { getLocalProfile, saveLocalProfile, type LocalProfile } from './comboxApi.localProfile'
import { ApiError, apiRequest, authUrl, getAccessToken, getOrRefreshToken, parseJson } from './comboxApi.core'
import { clearStoredAuth, readAuthSnapshot, writeAuthSnapshot } from './comboxApi.session'

export type { LocalProfile }
export { getLocalProfile, saveLocalProfile }

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
  clearStoredAuth()
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
