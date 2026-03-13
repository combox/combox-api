import type { ChatInviteLink, ChatItem, ChatMember, GIFItem, MessageItem, MessageReaction, MessageStatus, SearchResults } from './comboxApi.types'
import { ApiError, apiRequest } from './comboxApi.core'

export async function listChats(): Promise<ChatItem[]> {
  const payload = await apiRequest<{ items?: ChatItem[] }>('/chats')
  return Array.isArray(payload.items) ? payload.items : []
}

export async function getChat(chatID: string): Promise<ChatItem> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${chatID}`)
  if (!payload.chat) throw new ApiError('get_chat_failed', 'Get chat failed')
  return payload.chat
}

export async function createChat(input: { title: string; member_ids: string[]; type?: string }): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats`, {
    method: 'POST',
    body: { title: input.title, member_ids: input.member_ids, type: input.type ?? 'standard' },
  })
  if (!payload.chat) throw new ApiError('create_chat_failed', 'Create chat failed')
  return { chat: payload.chat }
}

export async function updateChat(chatID: string, input: {
  title?: string
  avatar_data_url?: string | null
  avatar_gradient?: string | null
  comments_enabled?: boolean
  reactions_enabled?: boolean
  is_public?: boolean
  public_slug?: string | null
}): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${chatID}`, { method: 'PATCH', body: input })
  if (!payload.chat) throw new ApiError('update_chat_failed', 'Update chat failed')
  return { chat: payload.chat }
}

export async function listChatInviteLinks(chatID: string): Promise<ChatInviteLink[]> {
  const payload = await apiRequest<{ items?: ChatInviteLink[] }>(`/chats/${chatID}/invite-links`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function createChatInviteLink(chatID: string, input?: { title?: string }): Promise<ChatInviteLink> {
  const payload = await apiRequest<{ item?: ChatInviteLink }>(`/chats/${chatID}/invite-links`, { method: 'POST', body: { title: input?.title || '' } })
  if (!payload.item) throw new ApiError('create_invite_link_failed', 'Create invite link failed')
  return payload.item
}

export async function acceptChannelInviteLink(token: string): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/invite-links/${encodeURIComponent(token)}/accept`, { method: 'POST' })
  if (!payload.chat) throw new ApiError('accept_invite_link_failed', 'Accept invite link failed')
  return { chat: payload.chat }
}

export async function listChannels(groupChatID: string): Promise<ChatItem[]> {
  const payload = await apiRequest<{ items?: ChatItem[] }>(`/chats/${groupChatID}/channels`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function listChatMembers(chatID: string, options?: { include_banned?: boolean }): Promise<ChatMember[]> {
  const suffix = options?.include_banned ? '?include_banned=1' : ''
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members${suffix}`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function addChatMembers(chatID: string, memberIDs: string[]): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members`, { method: 'POST', body: { member_ids: memberIDs } })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function acceptChatInvite(token: string): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' })
  if (!payload.chat) throw new ApiError('accept_invite_failed', 'Accept invite failed')
  return { chat: payload.chat }
}

export async function leaveChat(chatID: string): Promise<void> {
  await apiRequest(`/chats/${encodeURIComponent(chatID)}/leave`, { method: 'POST' })
}

export async function deleteChat(chatID: string): Promise<void> {
  await apiRequest(`/chats/${encodeURIComponent(chatID)}`, { method: 'DELETE' })
}

export async function updateChatMemberRole(chatID: string, userID: string, role: 'member' | 'moderator' | 'admin' | 'subscriber' | 'banned'): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members/${userID}`, { method: 'PATCH', body: { role } })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function removeChatMember(chatID: string, userID: string): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members/${userID}`, { method: 'DELETE' })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function createChannel(groupChatID: string, input: { title: string; channel_type?: 'text' | 'voice' }): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/${groupChatID}/channels`, {
    method: 'POST',
    body: { title: input.title, channel_type: input.channel_type ?? 'text' },
  })
  if (!payload.chat) throw new ApiError('create_channel_failed', 'Create channel failed')
  return { chat: payload.chat }
}

export async function createStandaloneChannel(input: { title: string; public_slug?: string; is_public?: boolean }): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/standalone-channels`, {
    method: 'POST',
    body: { title: input.title, public_slug: input.public_slug, is_public: input.is_public ?? true },
  })
  if (!payload.chat) throw new ApiError('create_standalone_channel_failed', 'Create standalone channel failed')
  return { chat: payload.chat }
}

export async function getStandaloneChannel(chatID: string): Promise<ChatItem> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/standalone-channels/${chatID}`)
  if (!payload.chat) throw new ApiError('get_standalone_channel_failed', 'Get standalone channel failed')
  return payload.chat
}

export async function updateStandaloneChannel(chatID: string, input: {
  title?: string
  avatar_data_url?: string | null
  avatar_gradient?: string | null
  comments_enabled?: boolean
  reactions_enabled?: boolean
  is_public?: boolean
  public_slug?: string | null
}): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/standalone-channels/${chatID}`, { method: 'PATCH', body: input })
  if (!payload.chat) throw new ApiError('update_standalone_channel_failed', 'Update standalone channel failed')
  return { chat: payload.chat }
}

export async function subscribeChannel(chatID: string): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/standalone-channels/${chatID}/subscribe`, { method: 'POST' })
  if (!payload.chat) throw new ApiError('subscribe_standalone_channel_failed', 'Subscribe standalone channel failed')
  return { chat: payload.chat }
}

export async function unsubscribeChannel(chatID: string): Promise<void> {
  await apiRequest(`/standalone-channels/${chatID}/unsubscribe`, { method: 'POST' })
}

export async function listChannelMembers(chatID: string, options?: { include_banned?: boolean }): Promise<ChatMember[]> {
  const suffix = options?.include_banned ? '?include_banned=1' : ''
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members${suffix}`)
  return Array.isArray(payload.items) ? payload.items : []
}

export async function updateChannelMemberRole(chatID: string, userID: string, role: 'subscriber' | 'admin' | 'banned'): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members/${userID}`, { method: 'PATCH', body: { role } })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function removeChannelMember(chatID: string, userID: string): Promise<ChatMember[]> {
  const payload = await apiRequest<{ items?: ChatMember[] }>(`/chats/${chatID}/members/${userID}`, { method: 'DELETE' })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function deleteChannel(groupChatID: string, channelChatID: string): Promise<void> {
  await apiRequest(`/chats/${groupChatID}/channels/${channelChatID}`, { method: 'DELETE' })
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
  if (!payload.item || !payload.chat) throw new ApiError('send_failed', 'Send failed')
  return { item: payload.item, chat: payload.chat }
}

export async function openDirectChat(input: { recipient_user_id: string }): Promise<{ chat: ChatItem }> {
  const payload = await apiRequest<{ chat?: ChatItem }>(`/chats/direct`, { method: 'POST', body: { recipient_user_id: input.recipient_user_id } })
  if (!payload.chat) throw new ApiError('open_direct_chat_failed', 'Open direct chat failed')
  return { chat: payload.chat }
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
  return { items: Array.isArray(payload.items) ? payload.items : [], nextPos: payload.next_pos ?? '' }
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
    body: { id: item.id, title: item.title, preview_url: item.preview_url, url: item.url, width: item.width ?? 0, height: item.height ?? 0 },
  })
}

export async function listMessages(chatID: string, cursor = '', limit = 50): Promise<{ items: MessageItem[]; nextCursor: string }> {
	const params = new URLSearchParams()
	params.set('limit', String(limit))
	if (cursor) params.set('cursor', cursor)
	const payload = await apiRequest<{ items?: MessageItem[]; next_cursor?: string }>(`/chats/${chatID}/messages?${params.toString()}`)
	return { items: Array.isArray(payload.items) ? payload.items : [], nextCursor: payload.next_cursor ?? '' }
}

export async function getStandaloneChannelThread(channelChatID: string, rootMessageID: string): Promise<{ thread_chat_id: string }> {
	const channelID = String(channelChatID || '').trim()
	const rootID = String(rootMessageID || '').trim()
	const payload = await apiRequest<{ thread_chat_id?: string }>(`/standalone-channels/${channelID}/threads/${rootID}`)
	if (!payload.thread_chat_id) throw new ApiError('get_thread_failed', 'Get thread failed')
	return { thread_chat_id: payload.thread_chat_id }
}

export async function listStandaloneChannelThreadComments(
	channelChatID: string,
	rootMessageID: string,
	options?: { cursor?: string; limit?: number },
): Promise<{ thread_chat_id: string; items: MessageItem[]; next_cursor: string }> {
	const channelID = String(channelChatID || '').trim()
	const rootID = String(rootMessageID || '').trim()
	const params = new URLSearchParams()
	if (typeof options?.limit === 'number') params.set('limit', String(options.limit))
	if (options?.cursor) params.set('cursor', options.cursor)
	const suffix = params.toString() ? `?${params.toString()}` : ''
	const payload = await apiRequest<{ thread_chat_id?: string; items?: MessageItem[]; next_cursor?: string }>(
		`/standalone-channels/${channelID}/threads/${rootID}/comments${suffix}`,
	)
	if (!payload.thread_chat_id) throw new ApiError('list_comments_failed', 'List comments failed')
	return {
		thread_chat_id: payload.thread_chat_id,
		items: Array.isArray(payload.items) ? payload.items : [],
		next_cursor: payload.next_cursor ?? '',
	}
}

export async function postStandaloneChannelThreadComment(
	channelChatID: string,
	rootMessageID: string,
	input: { content: string; attachment_ids?: string[] },
): Promise<{ item: MessageItem }> {
	const channelID = String(channelChatID || '').trim()
	const rootID = String(rootMessageID || '').trim()
	const payload = await apiRequest<{ item?: MessageItem }>(`/standalone-channels/${channelID}/threads/${rootID}/comments`, {
		method: 'POST',
		body: { content: input.content, attachment_ids: input.attachment_ids ?? [] },
	})
	if (!payload.item) throw new ApiError('post_comment_failed', 'Post comment failed')
	return { item: payload.item }
}

export async function sendMessage(chatID: string, content: string, attachmentIDs: string[] = [], replyToMessageID = ''): Promise<MessageItem> {
	const payload = await apiRequest<{ item?: MessageItem; code?: string }>(`/chats/${chatID}/messages`, {
		method: 'POST',
		body: { content, attachment_ids: attachmentIDs, reply_to_message_id: replyToMessageID || undefined },
	})
	if (!payload.item) throw new Error(payload.code || 'send_failed')
	return payload.item
}

export async function deleteMessage(messageID: string): Promise<void> {
  await apiRequest(`/messages/${messageID}`, { method: 'DELETE' })
}

export async function editMessageByID(messageID: string, content: string, attachmentIDs: string[] = []): Promise<MessageItem> {
  const payload = await apiRequest<{ item?: MessageItem }>(`/messages/${messageID}`, { method: 'PATCH', body: { content, attachment_ids: attachmentIDs } })
  if (!payload.item) throw new ApiError('update_failed', 'Update failed')
  return payload.item
}

export async function editMessage(chatID: string, messageID: string, content: string, attachmentIDs: string[] = []): Promise<MessageItem> {
  const payload = await apiRequest<{ item?: MessageItem }>(`/chats/${chatID}/messages/${messageID}`, { method: 'PATCH', body: { content, attachment_ids: attachmentIDs } })
  if (!payload.item) throw new ApiError('update_failed', 'Update failed')
  return payload.item
}

export async function upsertMessageStatus(chatID: string, messageID: string, status: 'delivered' | 'read'): Promise<MessageStatus> {
  const payload = await apiRequest<{ status?: MessageStatus }>(`/chats/${chatID}/messages/${messageID}/status`, { method: 'POST', body: { status } })
  if (!payload.status) throw new ApiError('request_failed', 'Status update failed')
  return payload.status
}

export async function markMessageRead(chatID: string, messageID: string): Promise<MessageStatus> {
  return await upsertMessageStatus(chatID, messageID, 'read')
}

export async function toggleMessageReaction(messageID: string, emoji: string): Promise<{ action: string; reactions: MessageReaction[] }> {
  const payload = await apiRequest<{ action?: string; reactions?: MessageReaction[] }>(`/messages/${messageID}/reactions`, { method: 'POST', body: { emoji } })
  return { action: payload.action || 'set', reactions: Array.isArray(payload.reactions) ? payload.reactions : [] }
}
