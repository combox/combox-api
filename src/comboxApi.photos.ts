import { apiRequest } from './comboxApi.core'

/**
 * One archived avatar of a user or a chat, as stored by the backend
 * (`profile_photos`). `created_at` is an RFC3339 timestamp.
 */
export type ProfilePhoto = {
  id: string
  url: string
  created_at: string
}

/**
 * Photo history of a user. Visible to whoever may open that profile.
 * Returns `[]` for an owner without any archived photo.
 */
export async function listUserPhotos(userID: string): Promise<ProfilePhoto[]> {
  const payload = await apiRequest<{ photos?: ProfilePhoto[] }>(`/users/${encodeURIComponent(userID)}/photos`)
  return Array.isArray(payload.photos) ? payload.photos : []
}

/**
 * Photo history of a chat (group / channel / standalone channel).
 * Members only; a forbidden viewer rejects with an `ApiError`.
 */
export async function listChatPhotos(chatID: string): Promise<ProfilePhoto[]> {
  const payload = await apiRequest<{ photos?: ProfilePhoto[] }>(`/chats/${encodeURIComponent(chatID)}/photos`)
  return Array.isArray(payload.photos) ? payload.photos : []
}
