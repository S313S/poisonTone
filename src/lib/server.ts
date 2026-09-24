import { NextRequest, NextResponse } from "next/server";

const windows = new Map<string, { count: number; expires: number }>();
const daily = new Map<string, { count: number; day: string }>();
export function limit(request: NextRequest, category: string, max: number): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${category}:${ip}`;
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.expires < now) { windows.set(key, { count: 1, expires: now + 600_000 }); return true; }
  entry.count++;
  return entry.count <= max;
}

export function dailyBudget(category: string, max: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const entry = daily.get(category);
  if (!entry || entry.day !== day) { daily.set(category, { day, count: 1 }); return true; }
  entry.count++;
  return entry.count <= max;
}

export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const actual = new URL(origin);
    if (process.env.APP_ORIGIN) return actual.origin === new URL(process.env.APP_ORIGIN).origin;
    const host = request.headers.get("host");
    return !!host && actual.host === host && (actual.protocol === "http:" || actual.protocol === "https:");
  } catch { return false; }
}

export function apiJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}

export async function boundedBody(request: NextRequest, maxBytes: number): Promise<Uint8Array> {
  const header = Number(request.headers.get("content-length"));
  if (Number.isFinite(header) && header > maxBytes) throw new Error("too_large");
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("too_large"); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}
