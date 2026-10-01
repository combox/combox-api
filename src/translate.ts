import { ApiError, apiRequest } from './comboxApi.core'

/**
 * R19 auto-translate SDK contract (server: POST/GET /translate).
 *
 * The channel `auto_translate` toggle already exists on chats; these
 * helpers provide the missing pieces: the target-language picker data and
 * the actual translation engine calls.
 */

export type TranslateLanguage = {
  code: string
  name: string
}

export type TranslateResult = {
  text: string
  source: string
  target: string
}

export type TranslateTextInput = {
  text: string
  target: string
  /** Optional source language code (e.g. 'en'). Auto-detected by the server when omitted, if the engine supports it. */
  source?: string
}

/** Server-side limit mirrored from the backend (translatesvc.MaxTextRunes). */
export const TRANSLATE_MAX_TEXT_LENGTH = 2000

function normalizeCode(value: string | undefined): string {
  const code = (value ?? '').trim().toLowerCase().replace(/_/g, '-')
  const dash = code.indexOf('-')
  return (dash >= 0 ? code.slice(0, dash) : code).trim()
}

/**
 * Translate a text into the target language.
 *
 * POST /translate { text, target, source? } → { text, source, target }
 * `source` may be omitted: the server auto-detects it when the configured
 * engine supports detection (LibreTranslate-compatible via
 * TRANSLATE_ENGINE_URL); with the default MyMemory engine an explicit
 * source is required and the server answers 400 `detect_not_supported`.
 */
export async function translateText(
  text: string,
  target: string,
  source?: string,
): Promise<TranslateResult> {
  const cleanText = (text ?? '').trim()
  if (!cleanText) throw new ApiError('invalid_argument', 'Text is required')
  if ([...cleanText].length > TRANSLATE_MAX_TEXT_LENGTH) {
    throw new ApiError('invalid_argument', `Text exceeds ${TRANSLATE_MAX_TEXT_LENGTH} characters`)
  }
  const cleanTarget = normalizeCode(target)
  if (!cleanTarget) throw new ApiError('invalid_argument', 'Target language is required')
  const cleanSource = normalizeCode(source)

  const payload = await apiRequest<{ text?: string; source?: string; target?: string }>(`/translate`, {
    method: 'POST',
    body: {
      text: cleanText,
      target: cleanTarget,
      ...(cleanSource ? { source: cleanSource } : {}),
    },
  })
  if (!payload.text || !payload.target) throw new ApiError('request_failed', 'Translate failed')
  return {
    text: payload.text,
    source: (payload.source ?? cleanSource).trim().toLowerCase(),
    target: payload.target.trim().toLowerCase(),
  }
}

/** Same as translateText with an object argument. */
export async function translateTextInput(input: TranslateTextInput): Promise<TranslateResult> {
  return translateText(input.text, input.target, input.source)
}

/**
 * List the available target languages for the picker.
 *
 * GET /translate/languages → { languages: [{ code, name }] }
 * Always served (live from the engine when it has a language API,
 * otherwise the verified static list); never empty on success.
 */
export async function listTranslateLanguages(): Promise<TranslateLanguage[]> {
  const payload = await apiRequest<{ languages?: TranslateLanguage[] }>(`/translate/languages`)
  const items = Array.isArray(payload.languages) ? payload.languages : []
  return items
    .filter((item) => typeof item?.code === 'string' && item.code.trim() !== '')
    .map((item) => ({ code: item.code.trim().toLowerCase(), name: (item.name ?? '').trim() || item.code.trim() }))
}
