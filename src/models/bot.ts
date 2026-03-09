export type BotToken = {
  id: string
  name?: string
  bot_id: string
  owner_user_id: string
  scopes: string[]
  chat_ids: string[]
  expires_at?: string
  token: string
}

export type BotWebhook = {
  id: string
  bot_user_id: string
  endpoint_url: string
  events: string[]
  enabled: boolean
  created_at: string
}
