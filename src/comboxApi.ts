export type {
  AuthUser,
  AuthTokens,
  ProfileUpdateInput,
  ChatItem,
  ChatMember,
  ChatMemberProfile,
  MessageReaction,
  SearchUserResult,
  SearchChatResult,
  SearchResults,
  GIFItem,
  MessageItem,
  E2EEnvelope,
  E2EPayload,
  MessageStatus,
  E2EDevice,
  E2EDeviceSummary,
  E2EPreKeyBundle,
  E2EUserKeyBackup,
  BotToken,
  BotWebhook,
  PresenceItem,
  ProfileSettings,
  ChatNotifications,
  PresenceEvent,
  NotificationEvent,
  MediaAttachment,
  MediaSession,
} from './comboxApi.types'

import type {
  AuthUser,
  AuthTokens,
  ProfileUpdateInput,
  ChatItem,
  ChatMember,
  MessageReaction,
  SearchResults,
  GIFItem,
  MessageItem,
  E2EEnvelope,
  MessageStatus,
  MediaAttachment,
  MediaSession,
  ProfileSettings,
  ChatNotifications,
} from './comboxApi.types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type AuthSnapshot = {
  user: AuthUser
  tokens: AuthTokens
}

const AUTH_STORAGE_KEY = 'combox.auth.v1'
const PROFILE_STORAGE_KEY = 'combox.profile.v1'

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

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? inferDefaultAPIBase()
const WS_BASE = (import.meta.env.VITE_WS_BASE_URL as string | undefined) ?? inferDefaultWSBase()

let refreshPromise: Promise<AuthTokens | null> | null = null

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

function authUrl(path: string): string {
  return `${API_BASE}${path}`
}

function redirectToAuthIfNeeded(): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/auth')) return
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.replace(`/auth?next=${encodeURIComponent(next)}`)
}

function readAuthSnapshot(): AuthSnapshot | null {
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

function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot))
}

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

export function getAccessToken(): string | null {
  return readAuthSnapshot()?.tokens.access_token ?? null
}

export async function forceRefreshSession(): Promise<boolean> {
  const tokens = await getOrRefreshToken(true)
  return Boolean(tokens)
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken())
}

export function clearAuth(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export type LocalProfile = {
  firstName: string
  lastName: string
  birthDate?: string
  avatarDataUrl: string
  gradient: string
}

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

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function login(loginValue: string, password: string, loginKey: string): Promise<{ user: AuthUser }> {
  const response = await fetch(authUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ login: loginValue, password, login_key: loginKey }),
  })

  const payload = await parseJson<{
    message?: string
    user?: AuthUser
    tokens?: AuthTokens
    code?: string
    details?: Record<string, string>
  }>(response)
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

export async function register(
  email: string,
  username: string,
  password: string,
  profile: RegisterProfileInput,
): Promise<{ user: AuthUser }> {
  const response = await fetch(authUrl('/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, username, password, ...profile }),
  })

  const payload = await parseJson<{
    message?: string
    user?: AuthUser
    tokens?: AuthTokens
    code?: string
    details?: Record<string, string>
  }>(response)
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
  if (!payload.user) {
    throw new ApiError('request_failed', 'Profile fetch failed')
  }
  updateStoredUser(payload.user)
  return payload.user
}

export async function getUserByID(userID: string): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>(`/users/${encodeURIComponent(userID)}`)
  if (!payload.user) {
    throw new ApiError('request_failed', 'User fetch failed')
  }
  return payload.user
}

export async function updateProfile(input: ProfileUpdateInput): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile', {
    method: 'PATCH',
    body: input,
  })
  if (!payload.user) {
    throw new ApiError('request_failed', 'Profile update failed')
  }
  updateStoredUser(payload.user)
  return payload.user
}

export async function updateSessionIdleTTL(seconds: number | null): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile', {
    method: 'PATCH',
    body: {
      session_idle_ttl_seconds: typeof seconds === 'number' ? seconds : null,
    },
  })
  if (!payload.user) {
    throw new ApiError('request_failed', 'Session ttl update failed')
  }
  updateStoredUser(payload.user)
  return payload.user
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/profile/password', {
    method: 'POST',
    body: {
      current_password: currentPassword,
      new_password: newPassword,
    },
  })
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
    body: {
      chat_mute: {
        chat_id: chatID,
        muted,
      },
    },
  })
  return payload.chat_notifications ?? { muted_chat_ids: [], unread_by_chat: {} }
}

export async function startEmailChange(): Promise<void> {
  await apiRequest('/profile/email/change/start', { method: 'POST' })
}

export async function verifyOldEmailCode(code: string): Promise<boolean> {
  const payload = await apiRequest<{ verified?: boolean }>('/profile/email/change/verify-old', {
    method: 'POST',
    body: { code },
  })
  return Boolean(payload.verified)
}

export async function sendNewEmailCode(email: string): Promise<void> {
  await apiRequest('/profile/email/change/send-new', {
    method: 'POST',
    body: { email },
  })
}

export async function confirmEmailChange(code: string): Promise<AuthUser> {
  const payload = await apiRequest<{ user?: AuthUser }>('/profile/email/change/confirm', {
    method: 'POST',
    body: { code },
  })
  if (!payload.user) {
    throw new ApiError('request_failed', 'Email change failed')
  }
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
  if (!response.ok) {
    throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
  }
  return Boolean(payload?.exists)
}

export async function sendEmailCode(email: string): Promise<void> {
  const response = await fetch(authUrl('/auth/email-code/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const payload = await parseJson<{ code?: string; message?: string; details?: Record<string, string> }>(response)
  if (!response.ok) {
    throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
  }
}

export async function verifyEmailCode(email: string, code: string, purpose: 'login' | 'signup' = 'signup'): Promise<{ verified: boolean; login_key?: string }> {
  const response = await fetch(authUrl('/auth/email-code/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, code, purpose }),
  })
  const payload = await parseJson<{ verified?: boolean; login_key?: string; code?: string; message?: string; details?: Record<string, string> }>(response)
  if (!response.ok) {
    throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
  }
  return { verified: Boolean(payload?.verified), login_key: payload?.login_key }
}

async function refreshAuthTokens(): Promise<AuthTokens | null> {
  const snapshot = readAuthSnapshot()
  if (!snapshot?.tokens?.refresh_token) return null

  try {
    const response = await fetch(authUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: snapshot.tokens.refresh_token }),
    })
    const payload = await parseJson<{ tokens?: AuthTokens; message?: string; code?: string }>(response)
    if (!response.ok || !payload?.tokens) {
      if (response.status === 401 || response.status === 403) clearAuth()
      return null
    }

    const next: AuthSnapshot = { user: snapshot.user, tokens: payload.tokens }
    writeAuthSnapshot(next)
    return payload.tokens
  } catch {
    return null
  }
}

async function getOrRefreshToken(forceRefresh = false): Promise<string | null> {
  const accessToken = getAccessToken()
  if (!forceRefresh && accessToken && !isTokenExpiredOrNearExpiry(accessToken)) return accessToken
  if (!refreshPromise) {
    refreshPromise = refreshAuthTokens().finally(() => {
      refreshPromise = null
    })
  }
  const refreshed = await refreshPromise
  return refreshed?.access_token ?? null
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  noAuth?: boolean
  headers?: Record<string, string>
}

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024 * 1024
const ATTACHMENT_CACHE_TTL_MS = 10 * 60 * 1000

type AttachmentLookupPayload = {
  attachment: MediaAttachment
  url: string
  preview_url?: string
}

const attachmentCacheByID = new Map<string, { expiresAt: number; value: AttachmentLookupPayload }>()
const attachmentInFlightByID = new Map<string, Promise<AttachmentLookupPayload>>()

async function apiRequest<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const token = options?.noAuth ? null : await getOrRefreshToken()
  if (!options?.noAuth && !token) {
    clearAuth()
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
    if (!nextTokens) {
      clearAuth()
      redirectToAuthIfNeeded()
      throw new ApiError('unauthorized', 'Unauthorized')
    }
    const retry = await fetch(authUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
        Authorization: `Bearer ${nextTokens.access_token}`,
      },
      cache: isGet ? 'no-store' : 'default',
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
    if (!retry.ok) {
      if (retry.status === 401) {
        clearAuth()
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

export async function listChats(): Promise<ChatItem[]> {
  const payload = await apiRequest<{ items?: ChatItem[] }>('/chats')
  return Array.isArray(payload.items) ? payload.items : []
}

export async function createChat(input: { title: string; member_ids: string[]; type?: string }): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats`, {
    method: 'POST',
    body: { title: input.title, member_ids: input.member_ids, type: input.type ?? 'standard' },
  })
  if (!payload.chat) throw new ApiError('create_chat_failed', 'Create chat failed')
  return { chat: payload.chat }
}

export async function updateChat(
  chatID: string,
  input: { title?: string; avatar_data_url?: string | null; avatar_gradient?: string | null },
): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${chatID}`, {
    method: 'PATCH',
    body: input,
  })
  if (!payload.chat) throw new ApiError('update_chat_failed', 'Update chat failed')
  return { chat: payload.chat }
}

export async function listChannels(groupChatID: string): Promise<ChatItem[]> {
  const payload = await apiRequest<{ items?: ChatItem[] }>(`/chats/${groupChatID}/channels`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function listChatMembers(chatID: string): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function addChatMembers(chatID: string, memberIDs: string[]): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members`, {
    method: 'POST',
    body: { member_ids: memberIDs },
  })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function acceptChatInvite(token: string): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/invites/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  })
  if (!payload.chat) throw new ApiError('accept_invite_failed', 'Accept invite failed')
  return { chat: payload.chat }
}

export async function leaveChat(chatID: string): Promise<void> {
  await apiRequest(`/chats/${encodeURIComponent(chatID)}/leave`, {
    method: 'POST',
  })
}

export async function updateChatMemberRole(chatID: string, userID: string, role: 'member' | 'moderator' | 'admin'): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members/${userID}`, {
    method: 'PATCH',
    body: { role },
  })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function removeChatMember(chatID: string, userID: string): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members/${userID}`, {
    method: 'DELETE',
  })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function createChannel(groupChatID: string, input: { title: string; channel_type?: 'text' | 'voice' }): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${groupChatID}/channels`, {
    method: 'POST',
    body: {
      title: input.title,
      channel_type: input.channel_type ?? 'text',
    },
  })
  if (!payload.chat) throw new ApiError('create_channel_failed', 'Create channel failed')
  return { chat: payload.chat }
}

export async function deleteChannel(groupChatID: string, channelChatID: string): Promise<void> {
  await apiRequest(`/chats/${groupChatID}/channels/${channelChatID}`, {
    method: 'DELETE',
  })
}

export async function sendDirectMessage(input: {
  recipient_user_id: string
  content: string
  reply_to_message_id?: string
  attachment_ids?: string[]
}): Promise<{ item: MessageItem; chat: ChatItem }> {
  const payload = await apiRequest<{ item?: MessageItem; chat?: ChatItem }>(`/chats/direct/messages`, {
    method: 'POST',
    body: {
      recipient_user_id: input.recipient_user_id,
      content: input.content,
      reply_to_message_id: input.reply_to_message_id,
      attachment_ids: input.attachment_ids ?? [],
    },
  })
  if (!payload.item || !payload.chat) {
    throw new ApiError('send_failed', 'Send failed')
  }
  return { item: payload.item, chat: payload.chat }
}

export async function searchDirectory(input: { q: string; scope?: 'all' | 'users' | 'chats'; limit?: number }): Promise<SearchResults> {
  const params = new URLSearchParams()
  params.set('q', input.q)
  if (input.scope) params.set('scope', input.scope)
  if (typeof input.limit === 'number') params.set('limit', String(input.limit))
  const payload = await apiRequest<{ items?: SearchResults }>(`/search?${params.toString()}`)
  return {
    users: Array.isArray(payload.items?.users) ? payload.items!.users : [],
    chats: Array.isArray(payload.items?.chats) ? payload.items!.chats : [],
  }
}

export async function searchGifs(input: { q?: string; pos?: string; limit?: number }): Promise<{ items: GIFItem[]; nextPos: string }> {
  const params = new URLSearchParams()
  if (input.q) params.set('q', input.q)
  if (input.pos) params.set('pos', input.pos)
  if (typeof input.limit === 'number') params.set('limit', String(input.limit))
  const payload = await apiRequest<{ items?: GIFItem[]; next_pos?: string }>(`/gifs/search?${params.toString()}`)
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    nextPos: payload.next_pos ?? '',
  }
}

export async function listRecentGifs(limit = 30): Promise<GIFItem[]> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  const payload = await apiRequest<{ items?: GIFItem[] }>(`/gifs/recent?${params.toString()}`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function addRecentGif(item: GIFItem): Promise<void> {
  await apiRequest('/gifs/recent', {
    method: 'POST',
    body: {
      id: item.id,
      title: item.title,
      preview_url: item.preview_url,
      url: item.url,
      width: item.width ?? 0,
      height: item.height ?? 0,
    },
  })
}

export async function listMessages(chatID: string, cursor = '', limit = 50): Promise<{ items: MessageItem[]; nextCursor: string }> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  const payload = await apiRequest<{ items?: MessageItem[]; next_cursor?: string }>(`/chats/${chatID}/messages?${params.toString()}`)
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    nextCursor: payload.next_cursor ?? '',
  }
}

export async function sendMessage(chatID: string, content: string, attachmentIDs: string[] = [], replyToMessageID = ''): Promise<MessageItem> {
  const payload = await apiRequest<{ item?: MessageItem; code?: string }>(`/chats/${chatID}/messages`, {
    method: 'POST',
    body: { content, attachment_ids: attachmentIDs, reply_to_message_id: replyToMessageID || undefined },
  })
  if (!payload.item) {
    throw new Error(payload.code || 'send_failed')
  }
  return payload.item
}

export async function deleteMessage(messageID: string): Promise<void> {
  await apiRequest(`/messages/${messageID}`, { method: 'DELETE' })
}

export async function upsertMessageStatus(chatID: string, messageID: string, status: 'delivered' | 'read'): Promise<MessageStatus> {
  const payload = await apiRequest<{ status?: MessageStatus }>(`/chats/${chatID}/messages/${messageID}/status`, {
    method: 'POST',
    body: { status },
  })
  if (!payload.status) throw new ApiError('request_failed', 'Status update failed')
  return payload.status
}

export async function markMessageRead(messageID: string): Promise<MessageStatus> {
  const payload = await apiRequest<{ status?: MessageStatus }>(`/messages/${messageID}/read`, { method: 'POST' })
  if (!payload.status) throw new ApiError('request_failed', 'Status update failed')
  return payload.status
}

export async function toggleMessageReaction(messageID: string, emoji: string): Promise<{ action: string; reactions: MessageReaction[] }> {
  const payload = await apiRequest<{ action?: string; reactions?: MessageReaction[] }>(`/messages/${messageID}/reactions`, {
    method: 'POST',
    body: { emoji },
  })
  return {
    action: payload.action || 'set',
    reactions: Array.isArray(payload.reactions) ? payload.reactions : [],
  }
}

const SUPPORTED_STREAM_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/x-flac',
  'audio/midi',
  'audio/mid',
  'audio/x-midi',
  'audio/x-mid',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'application/ogg',
])

function detectAttachmentKind(file: File): 'image' | 'video' | 'audio' | 'file' {
  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (file.type.startsWith('image/')) return 'image'
  if ((mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/ogg') && SUPPORTED_STREAM_MIMES.has(mime)) {
    if (mime.startsWith('video/')) return 'video'
    return 'audio'
  }
  if (!mime && /\.(mp4|m4v|mov|webm|ogg)$/i.test(name)) return 'video'
  if (!mime && /\.(mp3|aac|m4a|ogg|opus|flac|wav|webm)$/i.test(name)) return 'audio'
  return 'file'
}

function parseETag(headerValue: string | null): string {
  const value = (headerValue || '').trim()
  return value.replace(/^W\//, '').replace(/^"/, '').replace(/"$/, '')
}

const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024
const DEFAULT_MULTIPART_PART_SIZE = 8 * 1024 * 1024
const MAX_MULTIPART_PARTS = 10000

function planMultipartUpload(totalBytes: number): { partSize: number; partsCount: number } {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return { partSize: MIN_MULTIPART_PART_SIZE, partsCount: 1 }
  }

  let partSize = DEFAULT_MULTIPART_PART_SIZE
  if (Math.ceil(totalBytes / partSize) > MAX_MULTIPART_PARTS) {
    partSize = Math.ceil(totalBytes / MAX_MULTIPART_PARTS)
  }
  if (partSize < MIN_MULTIPART_PART_SIZE) {
    partSize = MIN_MULTIPART_PART_SIZE
  }

  const partsCount = Math.max(1, Math.ceil(totalBytes / partSize))
  return { partSize, partsCount }
}

export async function uploadAttachment(file: File): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  return uploadAttachmentWithProgress(file)
}

function uploadPartWithProgress(
  url: string,
  chunk: Blob,
  contentType: string,
  onProgress: (loadedBytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(event.loaded)
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError('upload_failed', `Upload failed with ${xhr.status}`))
        return
      }
      const etag = parseETag(xhr.getResponseHeader('ETag'))
      if (!etag) {
        reject(new ApiError('upload_failed', 'Upload ETag is missing'))
        return
      }
      resolve(etag)
    }

    xhr.onerror = () => reject(new ApiError('upload_failed', 'Network error during upload'))
    xhr.onabort = () => reject(new ApiError('upload_failed', 'Upload aborted'))
    xhr.send(chunk)
  })
}

export async function uploadAttachmentWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  const kind = detectAttachmentKind(file)
  const sizeBytes = file.size
  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ApiError('file_too_large', 'File is too large (max 5 GB)')
  }
  const { partSize, partsCount } = planMultipartUpload(sizeBytes)

  const createPayload = await apiRequest<{
    result?: {
      attachment: MediaAttachment
      upload: { upload_id: string; parts_count: number }
    }
  }>('/media/attachments', {
    method: 'POST',
    body: {
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      kind,
      variant: 'original',
      is_client_compressed: false,
      size_bytes: sizeBytes,
      multipart: { parts_count: partsCount },
    },
  })

  const attachment = createPayload.result?.attachment
  const uploadID = createPayload.result?.upload?.upload_id
  if (!attachment?.id || !uploadID) {
    throw new ApiError('upload_failed', 'Attachment init failed')
  }

  const uploadedParts: Array<{ part_number: number; etag: string }> = []
  let uploadedBytes = 0
  for (let partNumber = 1; partNumber <= partsCount; partNumber += 1) {
    const start = (partNumber - 1) * partSize
    const end = Math.min(sizeBytes, start + partSize)
    const chunk = file.slice(start, end)

    const partPayload = await apiRequest<{ url?: string }>(`/media/attachments/${attachment.id}/multipart/part-url`, {
      method: 'POST',
      body: { upload_id: uploadID, part_number: partNumber, content_type: file.type || 'application/octet-stream' },
    })

    if (!partPayload.url) {
      throw new ApiError('upload_failed', `Failed to get upload URL for part ${partNumber}`)
    }

    let partReported = 0
    const etag = await uploadPartWithProgress(
      partPayload.url,
      chunk,
      file.type || 'application/octet-stream',
      (loaded) => {
        if (loaded < partReported) return
        partReported = loaded
        const overall = Math.min(sizeBytes, uploadedBytes + partReported)
        onProgress?.(Math.min(99, Math.round((overall / Math.max(1, sizeBytes)) * 100)))
      },
    )
    uploadedBytes += chunk.size

    uploadedParts.push({ part_number: partNumber, etag })
  }

  await apiRequest(`/media/attachments/${attachment.id}/multipart/complete`, {
    method: 'POST',
    body: {
      upload_id: uploadID,
      parts: uploadedParts,
    },
  })

  const details = await getAttachment(attachment.id)
  onProgress?.(100)
  return details
}

function extractUploadInit(result: unknown): { attachment: MediaAttachment; uploadID: string } {
  const root = (result || {}) as {
    attachment?: MediaAttachment
    upload?: {
      upload_id?: string
      upload?: { upload_id?: string }
    }
  }

  const uploadID = root.upload?.upload_id || root.upload?.upload?.upload_id || ''
  if (!root.attachment?.id || !uploadID) {
    throw new ApiError('upload_failed', 'Attachment init failed')
  }
  return { attachment: root.attachment, uploadID }
}

export async function uploadMediaSessionWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ session: MediaSession; attachment: MediaAttachment; url: string; preview_url?: string }> {
  const kind = detectAttachmentKind(file)
  const sizeBytes = file.size
  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ApiError('file_too_large', 'File is too large (max 5 GB)')
  }
  const { partSize, partsCount } = planMultipartUpload(sizeBytes)

  const createPayload = await apiRequest<{
    result?: {
      session?: MediaSession
      attachment?: MediaAttachment
      upload?: {
        upload_id?: string
        upload?: { upload_id?: string }
      }
    }
  }>('/media/sessions', {
    method: 'POST',
    body: {
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      kind,
      variant: 'original',
      is_client_compressed: false,
      size_bytes: sizeBytes,
      multipart: { parts_count: partsCount },
    },
  })

  const created = createPayload.result
  const session = created?.session
  if (!session?.id) {
    throw new ApiError('upload_failed', 'Session init failed')
  }
  const { attachment } = extractUploadInit({
    attachment: created?.attachment,
    upload: created?.upload,
  })

  const uploadedParts: Array<{ part_number: number; etag: string }> = []
  let uploadedBytes = 0
  for (let partNumber = 1; partNumber <= partsCount; partNumber += 1) {
    const start = (partNumber - 1) * partSize
    const end = Math.min(sizeBytes, start + partSize)
    const chunk = file.slice(start, end)

    const partPayload = await apiRequest<{ url?: string }>(`/media/sessions/${session.id}/part-url`, {
      method: 'POST',
      body: { part_number: partNumber, content_type: file.type || 'application/octet-stream' },
    })

    if (!partPayload.url) {
      throw new ApiError('upload_failed', `Failed to get upload URL for part ${partNumber}`)
    }

    let partReported = 0
    const etag = await uploadPartWithProgress(
      partPayload.url,
      chunk,
      file.type || 'application/octet-stream',
      (loaded) => {
        if (loaded < partReported) return
        partReported = loaded
        const overall = Math.min(sizeBytes, uploadedBytes + partReported)
        onProgress?.(Math.min(99, Math.round((overall / Math.max(1, sizeBytes)) * 100)))
      },
    )
    uploadedBytes += chunk.size
    uploadedParts.push({ part_number: partNumber, etag })
  }

  await apiRequest<{ session?: MediaSession }>(`/media/sessions/${session.id}/complete`, {
    method: 'POST',
    body: { parts: uploadedParts },
  })

  let resolvedSession = session
  const startedAt = Date.now()
  const timeoutMs = 90_000
  while (Date.now() - startedAt < timeoutMs) {
    const statusPayload = await apiRequest<{ session?: MediaSession }>(`/media/sessions/${session.id}`)
    const current = statusPayload.session
    if (current) resolvedSession = current

    const status = (current?.status || '').toLowerCase()
    if (status === 'ready') break
    if (status === 'failed') {
      throw new ApiError('media_processing_failed', current?.error_message || 'Media processing failed')
    }

    onProgress?.(99)
    await sleep(600)
  }

  if ((resolvedSession.status || '').toLowerCase() !== 'ready') {
    throw new ApiError('media_processing_timeout', 'Media processing timeout')
  }

  const details = await getAttachment(attachment.id)
  onProgress?.(100)
  return { session: resolvedSession, attachment: details.attachment, url: details.url, preview_url: details.preview_url }
}

export async function getAttachment(attachmentID: string): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  const id = attachmentID.trim()
  if (!id) {
    throw new ApiError('attachment_not_found', 'Attachment URL not found')
  }
  const now = Date.now()
  const cached = attachmentCacheByID.get(id)
  if (cached && cached.expiresAt > now) {
    return { attachment: cached.value.attachment, url: cached.value.url, preview_url: cached.value.preview_url }
  }

  const inFlight = attachmentInFlightByID.get(id)
  if (inFlight) {
    const value = await inFlight
    return { attachment: value.attachment, url: value.url, preview_url: value.preview_url }
  }

  const request = apiRequest<{ attachment?: MediaAttachment; url?: string; preview_url?: string }>(`/media/attachments/${id}`)
    .then((payload) => {
      if (!payload.attachment || !payload.url) {
        throw new ApiError('attachment_not_found', 'Attachment URL not found')
      }
      const value: AttachmentLookupPayload = {
        attachment: payload.attachment,
        url: payload.url,
        preview_url: payload.preview_url,
      }
      attachmentCacheByID.set(id, { expiresAt: Date.now() + ATTACHMENT_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => {
      attachmentInFlightByID.delete(id)
    })

  attachmentInFlightByID.set(id, request)
  const value = await request
  return { attachment: value.attachment, url: value.url, preview_url: value.preview_url }
}

export async function importAttachmentFromURL(input: {
  source_url: string
  filename?: string
}): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  const payload = await apiRequest<{ attachment?: MediaAttachment; url?: string; preview_url?: string }>(`/media/attachments/import-url`, {
    method: 'POST',
    body: {
      source_url: input.source_url,
      filename: input.filename || undefined,
    },
  })
  if (!payload.attachment || !payload.url) {
    throw new ApiError('upload_failed', 'Attachment import failed')
  }
  return { attachment: payload.attachment, url: payload.url, preview_url: payload.preview_url }
}

export async function getAttachmentDownloadURL(attachmentID: string): Promise<{ url: string; filename?: string }> {
  const payload = await apiRequest<{ url?: string; filename?: string }>(`/media/attachments/${attachmentID}/download-url`)
  if (!payload.url) {
    throw new ApiError('attachment_not_found', 'Attachment download URL not found')
  }
  return { url: payload.url, filename: payload.filename }
}

export function buildWsUrl(deviceID?: string): string {
  const token = getAccessToken()
  if (!token) return ''
  const url = WS_BASE
    ? new URL(WS_BASE)
    : new URL(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/private/v1/ws`)
  url.searchParams.set('access_token', token)
  if (deviceID) url.searchParams.set('device_id', deviceID)
  return url.toString()
}

export async function buildWsUrlWithFreshToken(deviceID?: string, forceRefresh = false): Promise<string> {
  const token = await getOrRefreshToken(forceRefresh)
  if (!token) {
    clearAuth()
    redirectToAuthIfNeeded()
    return ''
  }

  const url = WS_BASE
    ? new URL(WS_BASE)
    : new URL(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/private/v1/ws`)

  url.searchParams.set('access_token', token)
  if (deviceID) url.searchParams.set('device_id', deviceID)
  return url.toString()
}
