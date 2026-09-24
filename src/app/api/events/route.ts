import { NextRequest } from "next/server";
import { parseEvent } from "@/lib/events";
import { apiJson, boundedBody, limit, sameOrigin } from "@/lib/server";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return apiJson({ ok: false }, 403);
  if (!limit(request, "events", 100)) return apiJson({ ok: false }, 429);
  try {
    const bytes = await boundedBody(request, 1024);
    const parsed = parseEvent(JSON.parse(Buffer.from(bytes).toString("utf8")));
    if (!parsed.ok) return apiJson({ ok: false }, 400);
    console.info(JSON.stringify({ type: "scene_roast_event", at: new Date().toISOString(), ...parsed.value }));
    return apiJson({ ok: true });
  } catch { return apiJson({ ok: false }, 400); }
}
