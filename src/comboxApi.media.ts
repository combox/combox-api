import type { MediaAttachment, MediaSession } from './comboxApi.types'
import { ApiError, apiRequest, sleep } from './comboxApi.core'

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024 * 1024
const ATTACHMENT_CACHE_TTL_MS = 10 * 60 * 1000

type AttachmentLookupPayload = {
  attachment: MediaAttachment
  url: string
  preview_url?: string
}

const attachmentCacheByID = new Map<string, { expiresAt: number; value: AttachmentLookupPayload }>()
const attachmentInFlightByID = new Map<string, Promise<AttachmentLookupPayload>>()

const SUPPORTED_STREAM_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/x-flac',
  'audio/midi',
  'audio/mid',
  'audio/x-midi',
  'audio/x-mid',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'application/ogg',
])

function detectAttachmentKind(file: File): 'image' | 'video' | 'audio' | 'file' {
  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (file.type.startsWith('image/')) return 'image'
  if ((mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/ogg') && SUPPORTED_STREAM_MIMES.has(mime)) {
    if (mime.startsWith('video/')) return 'video'
    return 'audio'
  }
  if (!mime && /\.(mp4|m4v|mov|webm|ogg)$/i.test(name)) return 'video'
  if (!mime && /\.(mp3|aac|m4a|ogg|opus|flac|wav|webm)$/i.test(name)) return 'audio'
  return 'file'
}

function parseETag(headerValue: string | null): string {
  const value = (headerValue || '').trim()
  return value.replace(/^W\//, '').replace(/^"/, '').replace(/"$/, '')
}

const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024
const DEFAULT_MULTIPART_PART_SIZE = 8 * 1024 * 1024
const MAX_MULTIPART_PARTS = 10000

function planMultipartUpload(totalBytes: number): { partSize: number; partsCount: number } {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return { partSize: MIN_MULTIPART_PART_SIZE, partsCount: 1 }
  }

  let partSize = DEFAULT_MULTIPART_PART_SIZE
  if (Math.ceil(totalBytes / partSize) > MAX_MULTIPART_PARTS) {
    partSize = Math.ceil(totalBytes / MAX_MULTIPART_PARTS)
  }
  if (partSize < MIN_MULTIPART_PART_SIZE) {
    partSize = MIN_MULTIPART_PART_SIZE
  }

  const partsCount = Math.max(1, Math.ceil(totalBytes / partSize))
  return { partSize, partsCount }
}

export async function uploadAttachment(file: File): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  return uploadAttachmentWithProgress(file)
}

function uploadPartWithProgress(
  url: string,
  chunk: Blob,
  contentType: string,
  onProgress: (loadedBytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(event.loaded)
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError('upload_failed', `Upload failed with ${xhr.status}`))
        return
      }
      const etag = parseETag(xhr.getResponseHeader('ETag'))
      if (!etag) {
        reject(new ApiError('upload_failed', 'Upload ETag is missing'))
        return
      }
      resolve(etag)
    }

    xhr.onerror = () => reject(new ApiError('upload_failed', 'Network error during upload'))
    xhr.onabort = () => reject(new ApiError('upload_failed', 'Upload aborted'))
    xhr.send(chunk)
  })
}

export async function uploadAttachmentWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  const kind = detectAttachmentKind(file)
  const sizeBytes = file.size
  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ApiError('file_too_large', 'File is too large (max 5 GB)')
  }
  const { partSize, partsCount } = planMultipartUpload(sizeBytes)

  const createPayload = await apiRequest<{
    result?: {
      attachment: MediaAttachment
      upload: { upload_id: string; parts_count: number }
    }
  }>('/media/attachments', {
    method: 'POST',
    body: {
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      kind,
      variant: 'original',
      is_client_compressed: false,
      size_bytes: sizeBytes,
      multipart: { parts_count: partsCount },
    },
  })

  const attachment = createPayload.result?.attachment
  const uploadID = createPayload.result?.upload?.upload_id
  if (!attachment?.id || !uploadID) {
    throw new ApiError('upload_failed', 'Attachment init failed')
  }

  const uploadedParts: Array<{ part_number: number; etag: string }> = []
  let uploadedBytes = 0
  for (let partNumber = 1; partNumber <= partsCount; partNumber += 1) {
    const start = (partNumber - 1) * partSize
    const end = Math.min(sizeBytes, start + partSize)
    const chunk = file.slice(start, end)

    const partPayload = await apiRequest<{ url?: string }>(`/media/attachments/${attachment.id}/multipart/part-url`, {
      method: 'POST',
      body: { upload_id: uploadID, part_number: partNumber, content_type: file.type || 'application/octet-stream' },
    })

    if (!partPayload.url) {
      throw new ApiError('upload_failed', `Failed to get upload URL for part ${partNumber}`)
    }

    let partReported = 0
    const etag = await uploadPartWithProgress(
      partPayload.url,
      chunk,
      file.type || 'application/octet-stream',
      (loaded) => {
        if (loaded < partReported) return
        partReported = loaded
        const overall = Math.min(sizeBytes, uploadedBytes + partReported)
        onProgress?.(Math.min(99, Math.round((overall / Math.max(1, sizeBytes)) * 100)))
      },
    )
    uploadedBytes += chunk.size

    uploadedParts.push({ part_number: partNumber, etag })
  }

  await apiRequest(`/media/attachments/${attachment.id}/multipart/complete`, {
    method: 'POST',
    body: {
      upload_id: uploadID,
      parts: uploadedParts,
    },
  })

  const details = await getAttachment(attachment.id)
  onProgress?.(100)
  return details
}

function extractUploadInit(result: unknown): { attachment: MediaAttachment; uploadID: string } {
  const root = (result || {}) as {
    attachment?: MediaAttachment
    upload?: {
      upload_id?: string
      upload?: { upload_id?: string }
    }
  }

  const uploadID = root.upload?.upload_id || root.upload?.upload?.upload_id || ''
  if (!root.attachment?.id || !uploadID) {
    throw new ApiError('upload_failed', 'Attachment init failed')
  }
  return { attachment: root.attachment, uploadID }
}

export async function uploadMediaSessionWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ session: MediaSession; attachment: MediaAttachment; url: string; preview_url?: string }> {
  const kind = detectAttachmentKind(file)
  const sizeBytes = file.size
  if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ApiError('file_too_large', 'File is too large (max 5 GB)')
  }
  const { partSize, partsCount } = planMultipartUpload(sizeBytes)

  const createPayload = await apiRequest<{
    result?: {
      session?: MediaSession
      attachment?: MediaAttachment
      upload?: {
        upload_id?: string
        upload?: { upload_id?: string }
      }
    }
  }>('/media/sessions', {
    method: 'POST',
    body: {
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      kind,
      variant: 'original',
      is_client_compressed: false,
      size_bytes: sizeBytes,
      multipart: { parts_count: partsCount },
    },
  })

  const created = createPayload.result
  const session = created?.session
  if (!session?.id) {
    throw new ApiError('upload_failed', 'Session init failed')
  }
  const { attachment } = extractUploadInit({
    attachment: created?.attachment,
    upload: created?.upload,
  })

  const uploadedParts: Array<{ part_number: number; etag: string }> = []
  let uploadedBytes = 0
  for (let partNumber = 1; partNumber <= partsCount; partNumber += 1) {
    const start = (partNumber - 1) * partSize
    const end = Math.min(sizeBytes, start + partSize)
    const chunk = file.slice(start, end)

    const partPayload = await apiRequest<{ url?: string }>(`/media/sessions/${session.id}/part-url`, {
      method: 'POST',
      body: { part_number: partNumber, content_type: file.type || 'application/octet-stream' },
    })

    if (!partPayload.url) {
      throw new ApiError('upload_failed', `Failed to get upload URL for part ${partNumber}`)
    }

    let partReported = 0
    const etag = await uploadPartWithProgress(
      partPayload.url,
      chunk,
      file.type || 'application/octet-stream',
      (loaded) => {
        if (loaded < partReported) return
        partReported = loaded
        const overall = Math.min(sizeBytes, uploadedBytes + partReported)
        onProgress?.(Math.min(99, Math.round((overall / Math.max(1, sizeBytes)) * 100)))
      },
    )
    uploadedBytes += chunk.size
    uploadedParts.push({ part_number: partNumber, etag })
  }

  await apiRequest<{ session?: MediaSession }>(`/media/sessions/${session.id}/complete`, {
    method: 'POST',
    body: { parts: uploadedParts },
  })

  let resolvedSession = session
  const startedAt = Date.now()
  const timeoutMs = 90_000
  while (Date.now() - startedAt < timeoutMs) {
    const statusPayload = await apiRequest<{ session?: MediaSession }>(`/media/sessions/${session.id}`)
    const current = statusPayload.session
    if (current) resolvedSession = current

    const status = (current?.status || '').toLowerCase()
    if (status === 'ready') break
    if (status === 'failed') {
      throw new ApiError('media_processing_failed', current?.error_message || 'Media processing failed')
    }

    onProgress?.(99)
    await sleep(600)
  }

  if ((resolvedSession.status || '').toLowerCase() !== 'ready') {
    throw new ApiError('media_processing_timeout', 'Media processing timeout')
  }

  const details = await getAttachment(attachment.id)
  onProgress?.(100)
  return { session: resolvedSession, attachment: details.attachment, url: details.url, preview_url: details.preview_url }
}

export async function getAttachment(attachmentID: string): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  const id = attachmentID.trim()
  if (!id) {
    throw new ApiError('attachment_not_found', 'Attachment URL not found')
  }
  const now = Date.now()
  const cached = attachmentCacheByID.get(id)
  if (cached && cached.expiresAt > now) {
    return { attachment: cached.value.attachment, url: cached.value.url, preview_url: cached.value.preview_url }
  }

  const inFlight = attachmentInFlightByID.get(id)
  if (inFlight) {
    const value = await inFlight
    return { attachment: value.attachment, url: value.url, preview_url: value.preview_url }
  }

  const request = apiRequest<{ attachment?: MediaAttachment; url?: string; preview_url?: string }>(`/media/attachments/${id}`)
    .then((payload) => {
      if (!payload.attachment || !payload.url) {
        throw new ApiError('attachment_not_found', 'Attachment URL not found')
      }
      const value: AttachmentLookupPayload = {
        attachment: payload.attachment,
        url: payload.url,
        preview_url: payload.preview_url,
      }
      attachmentCacheByID.set(id, { expiresAt: Date.now() + ATTACHMENT_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => {
      attachmentInFlightByID.delete(id)
    })

  attachmentInFlightByID.set(id, request)
  const value = await request
  return { attachment: value.attachment, url: value.url, preview_url: value.preview_url }
}

export async function importAttachmentFromURL(input: {
  source_url: string
  filename?: string
}): Promise<{ attachment: MediaAttachment; url: string; preview_url?: string }> {
  const payload = await apiRequest<{ attachment?: MediaAttachment; url?: string; preview_url?: string }>(`/media/attachments/import-url`, {
    method: 'POST',
    body: {
      source_url: input.source_url,
      filename: input.filename || undefined,
    },
  })
  if (!payload.attachment || !payload.url) {
    throw new ApiError('upload_failed', 'Attachment import failed')
  }
  return { attachment: payload.attachment, url: payload.url, preview_url: payload.preview_url }
}

export async function getAttachmentDownloadURL(attachmentID: string): Promise<{ url: string; filename?: string }> {
  const payload = await apiRequest<{ url?: string; filename?: string }>(`/media/attachments/${attachmentID}/download-url`)
  if (!payload.url) {
    throw new ApiError('attachment_not_found', 'Attachment download URL not found')
  }
  return { url: payload.url, filename: payload.filename }
}
