export type SavedTrack = {
  id: string
  title: string
  artist: string
  duration: number
  fileSize: string
  fileUrl: string
  addedAt: string
  /** Owned attachment id from POST /media/attachments/{id}/pin. The profile
   *  store may drop it on older backends; playback re-derives it from the
   *  pinned fileUrl (u/<uid>/<attachmentId>/…) when it is missing.
   */
  attachmentId?: string
}

export type AuthUser = {
  id: string
  email: string
  username: string
  first_name?: string
  last_name?: string
  birth_date?: string
  avatar_data_url?: string
  avatar_gradient?: string
  bio?: string
  phone_number?: string
  name_color?: string
  saved_tracks?: SavedTrack[]
  playlist_title?: string
  playlist_is_public?: boolean
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
  bio?: string
  phone_number?: string
  name_color?: string
  saved_tracks?: SavedTrack[]
  playlist_title?: string
  playlist_is_public?: boolean
}

/** One entry of the "Active sessions" list in the settings. */
export type AuthSession = {
  id: string
  user_agent: string
  ip_address: string
  created_at: string
  expires_at: string
  /** True for the session the current access token was issued for. */
  current: boolean
}
