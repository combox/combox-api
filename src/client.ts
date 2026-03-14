import * as api from './comboxApi'
import { ApiError } from './comboxApi.core'
import type {
  AuthTokens,
  AuthUser,
  ChatItem,
  ChatInviteLink,
  ChatMember,
  MediaAttachment,
  MediaSession,
  MessageItem,
  MessageReaction,
  MessageStatus,
  SearchResults,
  BotToken,
  BotWebhook,
  GIFItem,
  E2EDevice,
  E2EDeviceSummary,
  E2EEnvelope,
  E2EPreKeyBundle,
  E2EUserKeyBackup,
  ProfileUpdateInput,
  PresenceItem,
  ProfileSettings,
  ChatNotifications,
} from './comboxApi.types'
import type { LocalProfile } from './comboxApi.localProfile'
import type { RegisterProfileInput } from './comboxApi.auth'
import {
  createBrowserAuthStorage,
  createBrowserProfileStorage,
  type AuthStorage,
  type ProfileStorage,
} from './storage'
import {
  normalizeChatItem,
  normalizeMediaAttachment,
  normalizeMessageItem,
  type NormalizedChatItem,
  type NormalizedMediaAttachment,
  type NormalizedMessageItem,
} from './normalized'

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  body?: unknown
  noAuth?: boolean
  headers?: Record<string, string>
}

export type ComboxClientConfig = {
  baseUrl?: string
  wsBase?: string
  authStorage?: AuthStorage
  profileStorage?: ProfileStorage
  fetchImpl?: typeof fetch
  redirectToAuth?: (nextUrl: string) => void
}

type AuthSnapshot = {
  user: AuthUser
  tokens: AuthTokens
}

type RefreshResult =
  | { kind: 'ok'; tokens: AuthTokens }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }

const CLIENT_ENV = (import.meta as ImportMeta & {
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

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export class ComboxClient {
  private readonly baseUrl: string
  private readonly wsBase: string
  private readonly authStorage: AuthStorage
  private readonly profileStorage: ProfileStorage
  private readonly fetchImpl: typeof fetch
  private readonly redirectToAuth: (nextUrl: string) => void
  private refreshPromise: Promise<RefreshResult> | null = null

  constructor(config: ComboxClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? CLIENT_ENV?.VITE_API_BASE_URL ?? inferDefaultAPIBase()
    this.wsBase = config.wsBase ?? CLIENT_ENV?.VITE_WS_BASE_URL ?? inferDefaultWSBase()
    this.authStorage = config.authStorage ?? createBrowserAuthStorage()
    this.profileStorage = config.profileStorage ?? createBrowserProfileStorage()
    this.fetchImpl = config.fetchImpl ?? fetch
    this.redirectToAuth = config.redirectToAuth ?? ((next) => {
      if (typeof window === 'undefined') return
      if (window.location.pathname.startsWith('/auth')) return
      window.location.replace(`/auth?next=${encodeURIComponent(next)}`)
    })
  }

  private authUrl(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private getNextUrl(): string {
    if (typeof window === 'undefined') return '/'
    return `${window.location.pathname}${window.location.search}${window.location.hash}`
  }

  private readAuthSnapshot(): AuthSnapshot | null {
    const raw = this.authStorage.read()
    if (!raw?.tokens?.access_token || !raw?.tokens?.refresh_token || !raw?.user?.id) return null
    return raw as AuthSnapshot
  }

  private writeAuthSnapshot(snapshot: AuthSnapshot): void {
    this.authStorage.write(snapshot)
  }

  private updateStoredUser(user: AuthUser): void {
    const snapshot = this.readAuthSnapshot()
    if (!snapshot?.tokens) return
    this.writeAuthSnapshot({ user, tokens: snapshot.tokens })
    if (user.first_name && user.avatar_gradient) {
      this.saveLocalProfile({
        firstName: user.first_name,
        lastName: user.last_name || '',
        birthDate: user.birth_date,
        avatarDataUrl: user.avatar_data_url || '',
        gradient: user.avatar_gradient,
      })
    }
  }

  getCurrentUser(): AuthUser | null {
    return this.readAuthSnapshot()?.user ?? null
  }

  getAccessToken(): string | null {
    return this.readAuthSnapshot()?.tokens.access_token ?? null
  }

  isAuthenticated(): boolean {
    return Boolean(this.getAccessToken())
  }

  clearAuth(): void {
    this.authStorage.clear()
  }

  saveLocalProfile(profile: LocalProfile): void {
    this.profileStorage.write(profile)
  }

  getLocalProfile(): LocalProfile | null {
    return this.profileStorage.read()
  }

  private async refreshAuthTokens(): Promise<RefreshResult> {
    const snapshot = this.readAuthSnapshot()
    if (!snapshot?.tokens?.refresh_token) return { kind: 'missing' }
    const usedRefreshToken = snapshot.tokens.refresh_token

    try {
      const response = await this.fetchImpl(this.authUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: usedRefreshToken }),
      })
      const payload = await parseJson<{ tokens?: AuthTokens; message?: string; code?: string }>(response)
      if (!response.ok || !payload?.tokens) {
        if (response.status === 401 || response.status === 403) {
          // Cross-tab safety: another tab may have refreshed (rotating refresh_token)
          // while we were in-flight. In that case, use the latest snapshot and do not logout.
          const current = this.readAuthSnapshot()
          if (current?.tokens?.refresh_token && current.tokens.refresh_token !== usedRefreshToken && current.tokens.access_token) {
            return { kind: 'ok', tokens: current.tokens }
          }
          this.clearAuth()
          return { kind: 'invalid' }
        }
        return { kind: 'unavailable' }
      }

      const next: AuthSnapshot = { user: snapshot.user, tokens: payload.tokens }
      this.writeAuthSnapshot(next)
      return { kind: 'ok', tokens: payload.tokens }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  private async getOrRefreshToken(forceRefresh = false): Promise<string | null> {
    const accessToken = this.getAccessToken()
    if (!forceRefresh && accessToken && !isTokenExpiredOrNearExpiry(accessToken)) return accessToken
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAuthTokens().finally(() => {
        this.refreshPromise = null
      })
    }
    const refreshed = await this.refreshPromise
    return refreshed.kind === 'ok' ? refreshed.tokens.access_token : null
  }

  private async apiRequest<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    const token = options?.noAuth ? null : await this.getOrRefreshToken()
    if (!options?.noAuth && !token) {
      if (this.readAuthSnapshot()?.tokens?.refresh_token) {
        throw new ApiError('session_refresh_unavailable', 'Session refresh unavailable')
      }
      this.clearAuth()
      this.redirectToAuth(this.getNextUrl())
      throw new ApiError('unauthorized', 'Unauthorized')
    }

    const method = options?.method ?? 'GET'
    const isGet = method === 'GET'
    const response = await this.fetchImpl(this.authUrl(path), {
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
      const nextTokens = await this.refreshAuthTokens()
      if (nextTokens.kind !== 'ok') {
        if (nextTokens.kind === 'unavailable') {
          throw new ApiError('session_refresh_unavailable', 'Session refresh unavailable')
        }
        this.clearAuth()
        this.redirectToAuth(this.getNextUrl())
        throw new ApiError('unauthorized', 'Unauthorized')
      }
      const retry = await this.fetchImpl(this.authUrl(path), {
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
          this.clearAuth()
          this.redirectToAuth(this.getNextUrl())
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

  async login(loginValue: string, password: string, loginKey: string): Promise<{ user: AuthUser }> {
    const response = await this.fetchImpl(this.authUrl('/auth/login'), {
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

    this.writeAuthSnapshot({ user: payload.user, tokens: payload.tokens })
    if (payload.user.first_name && payload.user.avatar_gradient) {
      this.saveLocalProfile({
        firstName: payload.user.first_name,
        lastName: payload.user.last_name || '',
        birthDate: payload.user.birth_date,
        avatarDataUrl: payload.user.avatar_data_url || '',
        gradient: payload.user.avatar_gradient,
      })
    }
    return { user: payload.user }
  }

  async register(
    email: string,
    username: string,
    password: string,
    profile: RegisterProfileInput,
  ): Promise<{ user: AuthUser }> {
    const response = await this.fetchImpl(this.authUrl('/auth/register'), {
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

    this.writeAuthSnapshot({ user: payload.user, tokens: payload.tokens })
    if (payload.user.first_name && payload.user.avatar_gradient) {
      this.saveLocalProfile({
        firstName: payload.user.first_name,
        lastName: payload.user.last_name || '',
        birthDate: payload.user.birth_date,
        avatarDataUrl: payload.user.avatar_data_url || '',
        gradient: payload.user.avatar_gradient,
      })
    }
    return { user: payload.user }
  }

  async getProfile(): Promise<AuthUser> {
    const payload = await this.apiRequest<{ user?: AuthUser }>(`/profile`)
    if (!payload.user) throw new ApiError('request_failed', 'Profile fetch failed')
    this.updateStoredUser(payload.user)
    return payload.user
  }

  async updateProfile(input: ProfileUpdateInput): Promise<AuthUser> {
    const payload = await this.apiRequest<{ user?: AuthUser }>(`/profile`, {
      method: 'PATCH',
      body: input,
    })
    if (!payload.user) throw new ApiError('request_failed', 'Profile update failed')
    this.updateStoredUser(payload.user)
    return payload.user
  }

  async startEmailChange(): Promise<void> {
    await this.apiRequest(`/profile/email/change/start`, { method: 'POST' })
  }

  async verifyOldEmailCode(code: string): Promise<boolean> {
    const payload = await this.apiRequest<{ verified?: boolean }>(`/profile/email/change/verify-old`, {
      method: 'POST',
      body: { code },
    })
    return Boolean(payload.verified)
  }

  async sendNewEmailCode(email: string): Promise<void> {
    await this.apiRequest(`/profile/email/change/send-new`, { method: 'POST', body: { email } })
  }

  async confirmEmailChange(code: string): Promise<AuthUser> {
    const payload = await this.apiRequest<{ user?: AuthUser }>(`/profile/email/change/confirm`, {
      method: 'POST',
      body: { code },
    })
    if (!payload.user) throw new ApiError('request_failed', 'Email change failed')
    this.updateStoredUser(payload.user)
    return payload.user
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const response = await this.fetchImpl(this.authUrl('/auth/email-exists'), {
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

  async sendEmailCode(email: string): Promise<void> {
    const response = await this.fetchImpl(this.authUrl('/auth/email-code/send'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email }),
    })
    const payload = await parseJson<{ code?: string; message?: string; details?: Record<string, string> }>(response)
    if (!response.ok) {
      throw new ApiError(payload?.code || 'request_failed', payload?.message || 'Request failed', payload?.details)
    }
  }

  async verifyEmailCode(email: string, code: string, purpose: 'login' | 'signup' = 'signup'): Promise<{ verified: boolean; login_key?: string }> {
    const response = await this.fetchImpl(this.authUrl('/auth/email-code/verify'), {
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

  async listChats(): Promise<ChatItem[]> { return api.listChats() }

  async getChat(chatID: string): Promise<ChatItem> { return api.getChat(chatID) }

  async listChatsNormalized(): Promise<NormalizedChatItem[]> {
    const items = await this.listChats()
    return items.map(normalizeChatItem)
  }

  async createChat(input: { title: string; member_ids: string[]; type?: string }): Promise<{ chat: ChatItem }> { return api.createChat(input) }

  async updateChat(chatID: string, input: Parameters<typeof api.updateChat>[1]): Promise<{ chat: ChatItem }> { return api.updateChat(chatID, input) }

  async listChannels(groupChatID: string): Promise<ChatItem[]> { return api.listChannels(groupChatID) }

  async listChatMembers(chatID: string, options?: { include_banned?: boolean }): Promise<ChatMember[]> { return api.listChatMembers(chatID, options) }

  async addChatMembers(chatID: string, memberIDs: string[]): Promise<ChatMember[]> { return api.addChatMembers(chatID, memberIDs) }

  async updateChatMemberRole(chatID: string, userID: string, role: 'member' | 'moderator' | 'admin' | 'subscriber' | 'banned'): Promise<ChatMember[]> { return api.updateChatMemberRole(chatID, userID, role) }

  async removeChatMember(chatID: string, userID: string): Promise<ChatMember[]> { return api.removeChatMember(chatID, userID) }

  async listChatInviteLinks(chatID: string): Promise<ChatInviteLink[]> { return api.listChatInviteLinks(chatID) }

  async createChatInviteLink(chatID: string, input?: { title?: string }): Promise<ChatInviteLink> { return api.createChatInviteLink(chatID, input) }

  async acceptChannelInviteLink(token: string): Promise<{ chat: ChatItem }> { return api.acceptChannelInviteLink(token) }

  async createChannel(groupChatID: string, input: { title: string; channel_type?: 'text' | 'voice' }): Promise<{ chat: ChatItem }> { return api.createChannel(groupChatID, input) }

  async createStandaloneChannel(input: { title: string; public_slug?: string; is_public?: boolean }): Promise<{ chat: ChatItem }> { return api.createStandaloneChannel(input) }

  async getStandaloneChannel(chatID: string): Promise<ChatItem> { return api.getStandaloneChannel(chatID) }

  async updateStandaloneChannel(chatID: string, input: Parameters<typeof api.updateStandaloneChannel>[1]): Promise<{ chat: ChatItem }> { return api.updateStandaloneChannel(chatID, input) }

  async subscribeChannel(chatID: string): Promise<{ chat: ChatItem }> { return api.subscribeChannel(chatID) }

  async unsubscribeChannel(chatID: string): Promise<void> { return api.unsubscribeChannel(chatID) }

  async listChannelMembers(chatID: string, options?: { include_banned?: boolean }): Promise<ChatMember[]> { return api.listChannelMembers(chatID, options) }

  async updateChannelMemberRole(chatID: string, userID: string, role: 'subscriber' | 'admin' | 'banned'): Promise<ChatMember[]> { return api.updateChannelMemberRole(chatID, userID, role) }

  async removeChannelMember(chatID: string, userID: string): Promise<ChatMember[]> { return api.removeChannelMember(chatID, userID) }

  async createPublicChannel(input: { title: string; public_slug?: string; is_public?: boolean }): Promise<{ chat: ChatItem }> {
    return this.createStandaloneChannel(input)
  }

  async getPublicChannel(chatID: string): Promise<ChatItem> {
    return this.getStandaloneChannel(chatID)
  }

  async updatePublicChannel(
    chatID: string,
    input: {
      title?: string
      avatar_data_url?: string | null
      avatar_gradient?: string | null
      comments_enabled?: boolean
      reactions_enabled?: boolean
      is_public?: boolean
      public_slug?: string | null
    },
  ): Promise<{ chat: ChatItem }> {
    return this.updateStandaloneChannel(chatID, input)
  }

  async subscribePublicChannel(chatID: string): Promise<{ chat: ChatItem }> {
    return this.subscribeChannel(chatID)
  }

  async unsubscribePublicChannel(chatID: string): Promise<void> {
    return this.unsubscribeChannel(chatID)
  }

  async listPublicChannelMembers(chatID: string, options?: { include_banned?: boolean }): Promise<ChatMember[]> {
    return this.listChannelMembers(chatID, options)
  }

  async updatePublicChannelMemberRole(chatID: string, userID: string, role: 'subscriber' | 'admin' | 'banned'): Promise<ChatMember[]> {
    return this.updateChannelMemberRole(chatID, userID, role)
  }

  async removePublicChannelMember(chatID: string, userID: string): Promise<ChatMember[]> {
    return this.removeChannelMember(chatID, userID)
  }

  async sendDirectMessage(input: {
    recipient_user_id: string
    content: string
    reply_to_message_id?: string
    attachment_ids?: string[]
  }): Promise<{ item: MessageItem; chat: ChatItem }> {
    const payload = await this.apiRequest<{ item?: MessageItem; chat?: ChatItem }>(`/chats/direct/messages`, {
      method: 'POST',
      body: {
        recipient_user_id: input.recipient_user_id,
        content: input.content,
        reply_to_message_id: input.reply_to_message_id,
        attachment_ids: input.attachment_ids ?? [],
      },
    })
    if (!payload.item || !payload.chat) throw new ApiError('send_failed', 'Send failed')
    return { item: payload.item, chat: payload.chat }
  }

  async openDirectChat(input: { recipient_user_id: string }): Promise<{ chat: ChatItem }> {
    const payload = await this.apiRequest<{ chat?: ChatItem }>(`/chats/direct`, {
      method: 'POST',
      body: { recipient_user_id: input.recipient_user_id },
    })
    if (!payload.chat) throw new ApiError('open_direct_chat_failed', 'Open direct chat failed')
    return { chat: payload.chat }
  }

  async searchDirectory(input: { q: string; scope?: 'all' | 'users' | 'chats'; limit?: number }): Promise<SearchResults> {
    const params = new URLSearchParams()
    params.set('q', input.q)
    if (input.scope) params.set('scope', input.scope)
    if (typeof input.limit === 'number') params.set('limit', String(input.limit))
    const payload = await this.apiRequest<{ items?: SearchResults }>(`/search?${params.toString()}`)
    return {
      users: Array.isArray(payload.items?.users) ? payload.items!.users : [],
      chats: Array.isArray(payload.items?.chats) ? payload.items!.chats : [],
    }
  }

  async searchGifs(input: { q?: string; pos?: string; limit?: number }): Promise<{ items: GIFItem[]; nextPos: string }> {
    const params = new URLSearchParams()
    if (input.q) params.set('q', input.q)
    if (input.pos) params.set('pos', input.pos)
    if (typeof input.limit === 'number') params.set('limit', String(input.limit))
    const payload = await this.apiRequest<{ items?: GIFItem[]; next_pos?: string }>(`/gifs/search?${params.toString()}`)
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      nextPos: payload.next_pos ?? '',
    }
  }

  async listRecentGifs(limit = 30): Promise<GIFItem[]> {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    const payload = await this.apiRequest<{ items?: GIFItem[] }>(`/gifs/recent?${params.toString()}`)
    return Array.isArray(payload.items) ? payload.items : []
  }

  async addRecentGif(item: GIFItem): Promise<void> {
    await this.apiRequest(`/gifs/recent`, {
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

  async listMessages(chatID: string, cursor = '', limit = 50, deviceID = ''): Promise<{ items: MessageItem[]; statuses: MessageStatus[]; nextCursor: string }> {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)
    const payload = await this.apiRequest<{ items?: MessageItem[]; statuses?: MessageStatus[]; next_cursor?: string }>(`/chats/${chatID}/messages?${params.toString()}`, {
      headers: deviceID ? { 'X-Device-ID': deviceID } : undefined,
    })
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      statuses: api.normalizeMessageStatuses(payload.statuses, chatID),
      nextCursor: payload.next_cursor ?? '',
    }
  }

  async listMessagesNormalized(chatID: string, cursor = '', limit = 50, deviceID = ''): Promise<{ items: NormalizedMessageItem[]; statuses: MessageStatus[]; nextCursor: string }> {
    const payload = await this.listMessages(chatID, cursor, limit, deviceID)
    return {
      nextCursor: payload.nextCursor,
      items: payload.items.map(normalizeMessageItem),
      statuses: payload.statuses,
    }
  }

  async sendMessage(chatID: string, content: string, attachmentIDs: string[] = [], replyToMessageID = ''): Promise<MessageItem> { return api.sendMessage(chatID, content, attachmentIDs, replyToMessageID) }

  async sendMessageE2E(input: {
    chatID: string
    content: string
    attachmentIDs?: string[]
    senderDeviceID: string
    envelopes: E2EEnvelope[]
  }): Promise<MessageItem> {
    const payload = await this.apiRequest<{ item?: MessageItem; code?: string }>(`/chats/${input.chatID}/messages`, {
      method: 'POST',
      body: {
        content: input.content,
        attachment_ids: input.attachmentIDs ?? [],
        e2e: {
          sender_device_id: input.senderDeviceID,
          envelopes: input.envelopes,
        },
      },
    })
    if (!payload.item) {
      throw new Error(payload.code || 'send_failed')
    }
    return payload.item
  }

  async deleteMessage(messageID: string): Promise<void> { return api.deleteMessage(messageID) }

  async editMessageByID(messageID: string, content: string, attachmentIDs: string[] = []): Promise<MessageItem> { return api.editMessageByID(messageID, content, attachmentIDs) }

  async editMessage(chatID: string, messageID: string, content: string, attachmentIDs: string[] = []): Promise<MessageItem> { return api.editMessage(chatID, messageID, content, attachmentIDs) }

  async forwardMessage(chatID: string, sourceMessageID: string): Promise<MessageItem> { return api.forwardMessage(chatID, sourceMessageID) }

  async upsertMessageStatus(chatID: string, messageID: string, status: 'delivered' | 'read'): Promise<MessageStatus> { return api.upsertMessageStatus(chatID, messageID, status) }

  async markMessageRead(chatID: string, messageID: string): Promise<MessageStatus> { return api.markMessageRead(chatID, messageID) }

  async toggleMessageReaction(messageID: string, emoji: string): Promise<{ action: string; reactions: MessageReaction[] }> { return api.toggleMessageReaction(messageID, emoji) }

  async logout(refreshToken: string): Promise<void> {
    await this.apiRequest(`/auth/logout`, { method: 'POST', body: { refresh_token: refreshToken }, noAuth: true })
  }

  async createBotToken(input: { name?: string; scopes: string[]; chat_ids: string[]; expires_at?: string }): Promise<BotToken> {
    const payload = await this.apiRequest<{ token?: BotToken }>(`/bot/tokens`, {
      method: 'POST',
      body: {
        name: input.name ?? '',
        scopes: input.scopes,
        chat_ids: input.chat_ids,
        expires_at: input.expires_at ?? '',
      },
    })
    if (!payload.token) throw new ApiError('request_failed', 'Token generation failed')
    return payload.token
  }

  async botCreateMessage(botToken: string, input: { chat_id: string; content: string; attachment_ids?: string[] }): Promise<MessageItem> {
    const payload = await this.apiRequest<{ item?: MessageItem }>(`/bot/messages`, {
      method: 'POST',
      body: {
        chat_id: input.chat_id,
        content: input.content,
        attachment_ids: input.attachment_ids ?? [],
      },
      headers: { Authorization: `Bearer ${botToken}` },
      noAuth: true,
    })
    if (!payload.item) throw new ApiError('send_failed', 'Send failed')
    return payload.item
  }

  async botListChatMessages(botToken: string, chatID: string, limit = 50, cursor = ''): Promise<{ items: MessageItem[]; nextCursor: string }> {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)
    const payload = await this.apiRequest<{ items?: MessageItem[]; next_cursor?: string }>(`/bot/chats/${chatID}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${botToken}` },
      noAuth: true,
    })
    return { items: Array.isArray(payload.items) ? payload.items : [], nextCursor: payload.next_cursor ?? '' }
  }

  async botCreateWebhook(botToken: string, input: { endpoint_url: string; events: string[] }): Promise<BotWebhook> {
    const payload = await this.apiRequest<{ webhook?: BotWebhook }>(`/bot/webhooks`, {
      method: 'POST',
      body: input,
      headers: { Authorization: `Bearer ${botToken}` },
      noAuth: true,
    })
    if (!payload.webhook) throw new ApiError('request_failed', 'Webhook create failed')
    return payload.webhook
  }

  async upsertDeviceKeys(userDeviceID: string, input: { identity_key: string; signed_prekey: { key_id: number; public_key: string; signature: string }; one_time_prekeys: Array<{ key_id: number; public_key: string }> }): Promise<E2EDevice> {
    const payload = await this.apiRequest<{ device?: E2EDevice }>(`/e2e/devices/${userDeviceID}`, {
      method: 'PUT',
      body: input,
    })
    if (!payload.device) throw new ApiError('request_failed', 'Device upsert failed')
    return payload.device
  }

  async listUserDevices(userID: string): Promise<E2EDeviceSummary[]> {
    const payload = await this.apiRequest<{ items?: E2EDeviceSummary[] }>(`/e2e/users/${userID}/devices`)
    return Array.isArray(payload.items) ? payload.items : []
  }

  async claimPreKeyBundle(userID: string, deviceID: string): Promise<E2EPreKeyBundle> {
    const payload = await this.apiRequest<{ bundle?: E2EPreKeyBundle }>(`/e2e/users/${userID}/devices/${deviceID}/bundle:claim`, {
      method: 'POST',
    })
    if (!payload.bundle) throw new ApiError('request_failed', 'Bundle claim failed')
    return payload.bundle
  }

  async getUserKeyBackup(userID: string): Promise<E2EUserKeyBackup> {
    const payload = await this.apiRequest<{ backup?: E2EUserKeyBackup }>(`/e2e/users/${userID}/key-backup`)
    if (!payload.backup) throw new ApiError('not_found', 'Backup not found')
    return payload.backup
  }

  async upsertUserKeyBackup(userID: string, input: { alg: string; kdf: string; salt: string; params: unknown; ciphertext: string }): Promise<E2EUserKeyBackup> {
    const payload = await this.apiRequest<{ backup?: E2EUserKeyBackup }>(`/e2e/users/${userID}/key-backup`, {
      method: 'PUT',
      body: input,
    })
    if (!payload.backup) throw new ApiError('request_failed', 'Backup upsert failed')
    return payload.backup
  }

  async getPresence(userIDs: string[]): Promise<PresenceItem[]> {
    const params = new URLSearchParams()
    params.set('user_ids', userIDs.join(','))
    const payload = await this.apiRequest<{ items?: PresenceItem[] }>(`/presence?${params.toString()}`)
    return Array.isArray(payload.items) ? payload.items : []
  }

  async getProfileSettings(): Promise<ProfileSettings> {
    const payload = await this.apiRequest<{ settings?: ProfileSettings }>(`/profile/settings`)
    return payload.settings ?? { show_last_seen: true }
  }

  async updateProfileSettings(showLastSeen: boolean): Promise<ProfileSettings> {
    const payload = await this.apiRequest<{ settings?: ProfileSettings }>(`/profile/settings`, {
      method: 'PATCH',
      body: { show_last_seen: showLastSeen },
    })
    return payload.settings ?? { show_last_seen: showLastSeen }
  }

  async getChatNotifications(): Promise<ChatNotifications> {
    const payload = await this.apiRequest<{ chat_notifications?: ChatNotifications }>(`/profile/settings`)
    return payload.chat_notifications ?? { muted_chat_ids: [], unread_by_chat: {} }
  }

  async setChatMuted(chatID: string, muted: boolean): Promise<ChatNotifications> {
    const payload = await this.apiRequest<{ chat_notifications?: ChatNotifications }>(`/profile/settings`, {
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

  async getAttachment(attachmentID: string): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
    return api.getAttachment(attachmentID)
  }

  async getAttachmentNormalized(attachmentID: string): Promise<{ attachment: NormalizedMediaAttachment; url: string; preview_url?: string }> {
    const payload = await this.getAttachment(attachmentID)
    return { ...payload, attachment: normalizeMediaAttachment(payload.attachment) }
  }

  async getAttachmentDownloadURL(attachmentID: string): Promise<{ url: string; filename?: string }> {
    const payload = await this.apiRequest<{ url?: string; filename?: string }>(`/media/attachments/${attachmentID}/download-url`)
    if (!payload.url) {
      throw new ApiError('attachment_not_found', 'Attachment download URL not found')
    }
    return { url: payload.url, filename: payload.filename }
  }

  async importAttachmentFromURL(input: {
    source_url: string
    filename?: string
  }): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
    return api.importAttachmentFromURL(input)
  }

  async uploadAttachmentWithProgress(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
    return api.uploadAttachmentWithProgress(file, onProgress)
  }

  async uploadMediaSessionWithProgress(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ session: MediaSession; attachment: MediaAttachment; url: string; preview_url?: string }> {
    return api.uploadMediaSessionWithProgress(file, onProgress)
  }

  async uploadFile(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string; protocol: 'hls-session' | 'multipart-legacy' }> {
    try {
      const uploaded = await this.uploadMediaSessionWithProgress(file, onProgress)
      return { attachment: uploaded.attachment, url: uploaded.url, preview_url: uploaded.preview_url, protocol: 'hls-session' }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (!(error.code === 'not_found' || error.code === 'request_failed' || error.code === 'internal')) throw error
      const uploaded = await this.uploadAttachmentWithProgress(file, onProgress)
      return { attachment: uploaded.attachment, url: uploaded.url, preview_url: uploaded.preview_url, protocol: 'multipart-legacy' }
    }
  }

  buildWsUrl(deviceID?: string): string {
    const token = this.getAccessToken()
    if (!token) return ''
    const url = this.wsBase
      ? new URL(this.wsBase)
      : new URL(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/private/v1/ws`)
    url.searchParams.set('access_token', token)
    if (deviceID) url.searchParams.set('device_id', deviceID)
    return url.toString()
  }

  async buildWsUrlWithFreshToken(deviceID?: string, forceRefresh = false): Promise<string> {
    const token = await this.getOrRefreshToken(forceRefresh)
    if (!token) {
      this.clearAuth()
      this.redirectToAuth(this.getNextUrl())
      return ''
    }

    const url = this.wsBase
      ? new URL(this.wsBase)
      : new URL(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/private/v1/ws`)

    url.searchParams.set('access_token', token)
    if (deviceID) url.searchParams.set('device_id', deviceID)
    return url.toString()
  }
}

export function createBrowserClient(config: Omit<ComboxClientConfig, 'authStorage' | 'profileStorage'> = {}): ComboxClient {
  return new ComboxClient({
    ...config,
    authStorage: createBrowserAuthStorage(),
    profileStorage: createBrowserProfileStorage(),
  })
}
