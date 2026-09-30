export type AttachmentToken = {
  id: string
  filename: string
  mimeType: string
  kind: string
}

// Upper bound for attachment-token extraction. Matching itself is O(n) (see
// below), but an explicit cap bounds worst-case CPU on adversarial inputs
// (e.g. a multi-megabyte paste) to a small constant. Inputs above the cap
// keep their FULL text — only token extraction is skipped — so this cap
// never truncates user data, it only declines to parse tokens in absurdly
// large messages.
const MAX_MESSAGE_CHARS = 200_000

// Strict token pattern (fix for CodeQL js/polynomial-redos,
// "Polynomial regular expression used on uncontrolled data").
//
// The previous pattern was:
//   /\[\[att:([^|\]]+)\|([^|\]]*)\|([^|\]]*)\|([^\]]*)\]\]/g
// Its last field `[^\]]*` also matches `|`, so on an input with k pipes and
// no closing `]]` the engine had to try every distribution of the pipes over
// the three `\|` separators plus the greedy tail — O(k^3) backtracking.
// That nested/overlapping-quantifier shape is exactly what the query flags.
//
// The rewritten pattern below matches in linear time because every
// quantified class is DISJOINT from the literal that follows it
// (`[^|\]]` can never match `|` or `]`):
//   * each `\|` / `\]\]` literal admits at most ONE alignment — shrinking a
//     group exposes a non-delimiter where a delimiter is required, so that
//     attempt fails in O(1). This is the possessive-quantifier / atomic-group
//     equivalent; JS has no `(?>…)` syntax, so disjoint alphabets + anchors
//     are the idiomatic emulation.
//   * there are no nested quantifiers: every `{m,n}` applies to a single
//     character class, never to a group containing another quantifier.
//   * every repetition is bounded (`{1,256}`, `{0,2048}`), so one match
//     attempt from a given start position costs O(1) steps no matter how
//     long the input is; scanning all start positions is O(n) overall.
// Encoder-produced tokens always satisfy these bounds (ids are UUID-sized,
// percent-encoded fields of realistic filenames stay far below 2048 chars),
// so legitimate messages parse exactly as before; only malformed or absurd
// candidates are left as plain text.
const TOKEN_STRICT_RE = /\[\[att:([^|\]]{1,256})\|([^|\]]{0,2048})\|([^|\]]{0,2048})\|([^|\]]{0,2048})\]\]/g

// Single-character repetition only (`\n` repeated) — linear, no nested
// quantifiers, no backtracking ambiguity. Not part of the finding.
const COLLAPSE_BLANK_LINES_RE = /\n{3,}/g

function safeDecodeComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    // Malformed `%`-escapes are uncontrolled input: keep the token as plain
    // text instead of propagating URIError out of the parser (the old code
    // let the exception escape parseMessageContent entirely).
    return null
  }
}

function collapseBlankLines(value: string): string {
  return value.replace(COLLAPSE_BLANK_LINES_RE, '\n\n').trim()
}

export function encodeAttachmentToken(token: AttachmentToken): string {
  return `[[att:${token.id}|${encodeURIComponent(token.filename)}|${encodeURIComponent(token.mimeType)}|${encodeURIComponent(token.kind)}]]`
}

export function parseMessageContent(raw: string): { text: string; attachments: AttachmentToken[] } {
  const attachments: AttachmentToken[] = []
  const input = typeof raw === 'string' ? raw : ''
  if (input.length > MAX_MESSAGE_CHARS) {
    // Defense in depth: keep the full text, skip token extraction.
    return { text: collapseBlankLines(input), attachments }
  }
  TOKEN_STRICT_RE.lastIndex = 0
  const text = input.replace(TOKEN_STRICT_RE, (full, id: string, filename: string, mimeType: string, kind: string) => {
    const decodedFilename = safeDecodeComponent(filename)
    const decodedMimeType = safeDecodeComponent(mimeType)
    const decodedKind = safeDecodeComponent(kind || 'file')
    if (decodedFilename === null || decodedMimeType === null || decodedKind === null) return full
    attachments.push({
      id: id.trim(),
      filename: decodedFilename,
      mimeType: decodedMimeType,
      kind: decodedKind,
    })
    return ''
  })

  return {
    text: collapseBlankLines(text),
    attachments,
  }
}
