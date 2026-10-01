import { ApiError, apiRequest } from './comboxApi.core'

/**
 * User reports for the Report buttons in the UI.
 *
 * Backend contract (see internal/transport/http/reports_handlers.go and
 * internal/service/reports/service.go):
 *   POST /api/private/v1/reports
 *   { target_type: 'user'|'chat'|'photo'|'message', target_id, reason }
 *   -> 201 { message, report: Entry }
 *
 * Validation (server): target_type must be one of the four values,
 * target_id 1..256 chars, reason 1..2000 runes (trimmed). Rate limited to
 * 10/min per reporter (429 when exceeded).
 */

/** Allowed report targets (backend `validTargetType`). */
export type ReportTargetType = 'user' | 'chat' | 'photo' | 'message'

/** One stored report row (backend `reports.Entry`). */
export type ReportEntry = {
  id: string
  reporter_id: string
  target_type: string
  target_id: string
  reason: string
  created_at: string
}

/** Input for {@link createReport}. */
export type CreateReportInput = {
  target_type: ReportTargetType
  target_id: string
  reason: string
}

function asTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Creates one report. Throws ApiError on validation (400) or rate limit (429). */
export async function createReport(input: CreateReportInput): Promise<ReportEntry> {
  const target_type = asTrimmed(input?.target_type).toLowerCase() as ReportTargetType
  const target_id = asTrimmed(input?.target_id)
  const reason = asTrimmed(input?.reason)
  if (target_type !== 'user' && target_type !== 'chat' && target_type !== 'photo' && target_type !== 'message') {
    throw new ApiError('error.validation', 'Invalid report target type')
  }
  if (!target_id) throw new ApiError('error.validation', 'Report target id is required')
  if (!reason) throw new ApiError('error.validation', 'Report reason is required')
  const payload = await apiRequest<{ report?: ReportEntry }>('/reports', {
    method: 'POST',
    body: { target_type, target_id, reason },
  })
  if (!payload?.report || !asTrimmed(payload.report.id)) {
    throw new ApiError('request_failed', 'Report creation failed')
  }
  return payload.report
}

/** Convenience wrapper for reporting a user (profile Report button). */
export async function reportUser(targetID: string, reason: string): Promise<ReportEntry> {
  return createReport({ target_type: 'user', target_id: targetID, reason })
}
