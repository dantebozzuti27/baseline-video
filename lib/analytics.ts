/**
 * Analytics and Error Tracking Utilities
 * Fire-and-forget tracking for usage, errors, and business metrics
 */

type EventMetadata = Record<string, string | number | boolean | null | undefined>;

/**
 * Track a user event (page view, action, etc.)
 * This is a fire-and-forget call - errors are silently ignored
 */
export function trackEvent(eventType: string, metadata?: EventMetadata): void {
  if (typeof window === "undefined") return;

  fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: eventType,
      metadata: metadata ?? {}
    })
  }).catch(() => {
    // Silently ignore - analytics should never break the app
  });
}

/**
 * Log an error to the monitoring system
 * This is a fire-and-forget call - errors are silently ignored
 */
export function logError(
  errorType: "frontend" | "api" | "database",
  message: string,
  options?: {
    stack?: string;
    endpoint?: string;
    metadata?: EventMetadata;
  }
): void {
  if (typeof window === "undefined") return;

  fetch("/api/analytics/error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error_type: errorType,
      message,
      stack: options?.stack,
      endpoint: options?.endpoint,
      metadata: options?.metadata ?? {}
    })
  }).catch(() => {
    // Silently ignore
  });
}

/**
 * Server-side event tracking (for API routes)
 * Uses the Supabase admin client to insert directly
 */
export async function trackEventServer(
  supabaseAdmin: { from: (table: string) => any },
  eventType: string,
  options?: {
    userId?: string;
    teamId?: string;
    metadata?: EventMetadata;
  }
): Promise<void> {
  try {
    await supabaseAdmin.from("analytics_events").insert({
      event_type: eventType,
      user_id: options?.userId ?? null,
      team_id: options?.teamId ?? null,
      metadata: options?.metadata ?? {}
    });
  } catch {
    // Silently ignore - analytics should never break the app
  }
}

/**
 * Server-side error logging (for API routes)
 * Uses the Supabase admin client to insert directly
 */
export async function logErrorServer(
  supabaseAdmin: { from: (table: string) => any },
  errorType: "frontend" | "api" | "database",
  message: string,
  options?: {
    userId?: string;
    stack?: string;
    endpoint?: string;
    metadata?: EventMetadata;
  }
): Promise<void> {
  try {
    await supabaseAdmin.from("error_logs").insert({
      error_type: errorType,
      message,
      user_id: options?.userId ?? null,
      stack: options?.stack ?? null,
      endpoint: options?.endpoint ?? null,
      metadata: options?.metadata ?? {}
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Common event types for consistency
 */
export const EventTypes = {
  // Page views
  PAGE_VIEW: "page_view",

  // Auth
  SIGN_IN: "sign_in",
  SIGN_UP: "sign_up",
  SIGN_OUT: "sign_out",

  // Videos
  VIDEO_UPLOAD: "video_upload",
  VIDEO_VIEW: "video_view",
  VIDEO_DELETE: "video_delete",
  COMMENT_ADD: "comment_add",

  // Lessons
  LESSON_REQUEST: "lesson_request",
  LESSON_APPROVE: "lesson_approve",
  LESSON_DECLINE: "lesson_decline",
  LESSON_CANCEL: "lesson_cancel",
  LESSON_RESCHEDULE: "lesson_reschedule",

  // Programs
  PROGRAM_CREATE: "program_create",
  PROGRAM_ENROLL: "program_enroll",
  PROGRAM_COMPLETE: "program_complete",

  // Team
  PLAYER_INVITE: "player_invite",
  PLAYER_JOIN: "player_join",
  PLAYER_DEACTIVATE: "player_deactivate"
} as const;

