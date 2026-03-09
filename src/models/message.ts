export type MessageReaction = {
  emoji: string
  count: number
  user_ids: string[]
}

export type E2EEnvelope = {
  recipient_device_id: string
  alg: string
  header: string
  ciphertext: string
}

export type E2EPayload = {
  sender_device_id: string
  envelope?: E2EEnvelope
}

export type MessageItem = {
  id: string
  chat_id: string
  user_id: string
  sender_bot_id?: string
  content: string
  reply_to_message_id?: string
  reply_to_message_preview?: string
  reply_to_message_sender_name?: string
  is_e2e: boolean
  e2e?: E2EPayload
  reactions?: MessageReaction[]
  created_at: string
  edited_at?: string
}

export type MessageStatus = {
  message_id: string
  chat_id: string
  user_id: string
  status: string
  updated_at: string
}
