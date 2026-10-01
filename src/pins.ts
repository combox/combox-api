import type { MediaAttachment } from './comboxApi.types'
import { ApiError, apiRequest } from './comboxApi.core'

export type PinnedAttachment = {
  attachment: MediaAttachment
  url: string
  preview_url?: string
}

/** Server-side pin for "Save to playlist": the backend copies the attachment
 *  into the caller's own storage and returns the NEW owned attachment id plus
 *  a fresh playback URL. The saved copy keeps playing even after the source
 *  chat message (or the whole chat) is deleted.
 */
export async function pinAttachment(attachmentID: string): Promise<PinnedAttachment> {
  const id = (attachmentID || '').trim()
  if (!id) {
    throw new ApiError('attachment_not_found', 'Attachment id is missing')
  }
  const payload = await apiRequest<{ attachment?: MediaAttachment; url?: string; preview_url?: string }>(
    `/media/attachments/${encodeURIComponent(id)}/pin`,
    { method: 'POST' },
  )
  if (!payload.attachment?.id || !payload.url) {
    throw new ApiError('pin_failed', 'Could not pin the attachment')
  }
  return { attachment: payload.attachment, url: payload.url, preview_url: payload.preview_url }
}
