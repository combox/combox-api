export type GIFItem = {
  id: string
  title: string
  preview_url: string
  url: string
  width?: number
  height?: number
}

export type MediaAttachment = {
  id: string
  user_id: string
  filename: string
  mime_type: string
  kind: string
  variant: string
  size_bytes?: number
  width?: number
  height?: number
  duration_ms?: number
  bucket: string
  object_key: string
  upload_type: string
  upload_id?: string
  processing_status: string
  created_at: string
  updated_at: string
}

export type MediaSession = {
  id: string
  user_id: string
  attachment_id: string
  filename: string
  mime_type: string
  kind: string
  status: string
  parts_total: number
  parts_uploaded: number
  bytes_total?: number
  bytes_uploaded: number
  playlist_path?: string
  error_code?: string
  error_message?: string
  created_at: string
  updated_at: string
  finalized_at?: string
}
