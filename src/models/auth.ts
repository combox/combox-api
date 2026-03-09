export type AuthUser = {
  id: string
  email: string
  username: string
  first_name?: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
  session_idle_ttl_seconds?: number
}

export type AuthTokens = {
  access_token: string
  refresh_token: string
  expires_in_sec: number
}

export type ProfileUpdateInput = {
  username?: string
  first_name?: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
}
