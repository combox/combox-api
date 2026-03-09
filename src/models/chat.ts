import type { SearchUserResult } from './search'

export type ChatItem = {
  id: string
  title: string
  is_direct: boolean
  type: string
  kind?: string
  is_public?: boolean
  public_slug?: string
  comments_enabled?: boolean
  reactions_enabled?: boolean
  parent_chat_id?: string
  channel_type?: 'text' | 'voice'
  topic_number?: number
  is_general?: boolean
  bot_id?: string
  peer_user_id?: string
  viewer_role?: string
  subscriber_count?: number
  avatar_data_url?: string
  avatar_gradient?: string
  last_message_preview?: string
  created_at: string
}

export type ChatInviteLink = {
  id: string
  chat_id: string
  created_by: string
  token: string
  title?: string
  is_primary: boolean
  use_count: number
  revoked_at?: string
  created_at: string
}

export type ChatMember = {
  user_id: string
  role: string
  joined_at?: string
}

export type ChatMemberProfile = ChatMember & {
  profile?: SearchUserResult
}
