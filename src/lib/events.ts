const eventNames = new Set(["page_open", "input_ready", "location_success", "location_failed", "generate_started", "generate_succeeded", "generate_failed", "copy_succeeded", "copy_fallback_shown", "regenerate_clicked", "not_funny_clicked"]);
const fields = new Set(["event", "sessionId", "requestId", "device", "durationBucket", "hasImage", "hasPlace", "promptVersion", "modelTag", "errorType"]);
export type SafeEvent = { event: string; sessionId: string; requestId?: string; device?: "mobile" | "desktop"; durationBucket?: string; hasImage?: boolean; hasPlace?: boolean; promptVersion?: string; modelTag?: string; errorType?: string };
export function parseEvent(raw: unknown): { ok: true; value: SafeEvent } | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !fields.has(key)) || !eventNames.has(value.event as string) || typeof value.sessionId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(value.sessionId)) return { ok: false };
  for (const key of ["requestId", "durationBucket", "promptVersion", "modelTag", "errorType"]) if (value[key] !== undefined && (typeof value[key] !== "string" || (value[key] as string).length > 64)) return { ok: false };
  if (value.device !== undefined && value.device !== "mobile" && value.device !== "desktop") return { ok: false };
  if (value.hasImage !== undefined && typeof value.hasImage !== "boolean" || value.hasPlace !== undefined && typeof value.hasPlace !== "boolean") return { ok: false };
  return { ok: true, value: value as SafeEvent };
}
