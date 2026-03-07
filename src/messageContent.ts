export type AttachmentToken = {
  id: string
  filename: string
  mimeType: string
  kind: string
}

const TOKEN_RE = /\[\[att:([^|\]]+)\|([^|\]]*)\|([^|\]]*)\|([^\]]*)\]\]/g

export function encodeAttachmentToken(token: AttachmentToken): string {
  return `[[att:${token.id}|${encodeURIComponent(token.filename)}|${encodeURIComponent(token.mimeType)}|${encodeURIComponent(token.kind)}]]`
}

export function parseMessageContent(raw: string): { text: string; attachments: AttachmentToken[] } {
  const attachments: AttachmentToken[] = []
  const text = raw.replace(TOKEN_RE, (_full, id: string, filename: string, mimeType: string, kind: string) => {
    attachments.push({
      id: id.trim(),
      filename: decodeURIComponent(filename || ''),
      mimeType: decodeURIComponent(mimeType || ''),
      kind: decodeURIComponent(kind || 'file'),
    })
    return ''
  })

  return {
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    attachments,
  }
}
