import { ApiError, apiRequest } from './comboxApi.core'

/** One chat of a shared folder preview, with the viewer's membership flag. */
export type ResolvedFolderInviteChat = {
  id: string
  title: string
  kind: string
  public_slug: string | null
  /** Whether the resolving user already belongs to the chat. */
  is_member: boolean
}

/** Preview of a shared chat folder. The server never auto-joins on resolve. */
export type ResolvedFolderInvite = {
  folder_name: string
  /** The folder's icon glyph (backend `icon` column); '' when unset. */
  folder_emoji: string
  chats: ResolvedFolderInviteChat[]
}

/**
 * Mints a share link for a folder owned by the signed-in user, or returns
 * the still-live token when one exists. Only the folder owner may call it.
 */
export async function createChatFolderInvite(folderID: string): Promise<{ token: string }> {
  const payload = await apiRequest<{ token?: string }>(`/chat-folder/${encodeURIComponent(folderID)}/invite`, {
    method: 'POST',
  })
  if (!payload.token) throw new ApiError('create_chat_folder_invite_failed', 'Create chat folder invite failed')
  return { token: payload.token }
}

/**
 * Revokes the live share link of a folder owned by the signed-in user.
 * `token` is accepted for forward compatibility and currently ignored: the
 * server revokes the folder's active invite.
 */
export async function revokeChatFolderInvite(folderID: string, token?: string): Promise<void> {
  void token
  await apiRequest(`/chat-folder/${encodeURIComponent(folderID)}/invite`, { method: 'DELETE' })
}

/**
 * Previews a shared folder for the signed-in holder of `token`. Fails with
 * ApiError('not_found') when the token is missing or revoked. Never
 * auto-joins: render an import dialog from the payload instead.
 */
export async function resolveChatFolderInvite(token: string): Promise<ResolvedFolderInvite> {
  const payload = await apiRequest<{
    folder_name?: string
    folder_emoji?: string
    chats?: ResolvedFolderInviteChat[]
  }>(`/chat-folders/invite/${encodeURIComponent(token)}`)
  if (typeof payload.folder_name !== 'string') {
    throw new ApiError('resolve_chat_folder_invite_failed', 'Resolve chat folder invite failed')
  }
  return {
    folder_name: payload.folder_name,
    folder_emoji: typeof payload.folder_emoji === 'string' ? payload.folder_emoji : '',
    chats: Array.isArray(payload.chats) ? payload.chats : [],
  }
}
