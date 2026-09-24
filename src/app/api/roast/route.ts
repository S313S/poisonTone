import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { apiJson, boundedBody, dailyBudget, limit, sameOrigin } from "@/lib/server";
import { parseContext, parseGenerationMode } from "@/lib/validation";
import { demoRoasts, generateRoasts, ModelError } from "@/lib/model";
import { PROMPT_VERSION } from "@/lib/prompt";

export const runtime = "nodejs";
const MAX_BODY = 3 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const mode = process.env.DEMO_MODE === "true" ? "demo" : "live";
  const envelope = { requestId, promptVersion: PROMPT_VERSION, mode };
  if (!sameOrigin(request)) return apiJson({ ...envelope, status: "error", message: "请求来源不正确。" }, 403);
  if (!limit(request, "roast", 6)) return apiJson({ ...envelope, status: "error", message: "今天试得太密了，请过一会儿再生成。" }, 429);
  try {
    const type = request.headers.get("content-type") || "";
    if (!type.startsWith("multipart/form-data;")) return apiJson({ ...envelope, status: "error", message: "请求格式不正确。" }, 400);
    const bytes = await boundedBody(request, MAX_BODY);
    const form = await new Request("http://local/form", { method: "POST", headers: { "content-type": type }, body: Buffer.from(bytes) }).formData();
    const generationMode = parseGenerationMode(form.get("generationMode"));
    if (!generationMode) return apiJson({ ...envelope, status: "error", message: "生成模式不正确。" }, 400);
    const file = form.get("image");
    const hasImage = file instanceof File && file.size > 0;
    const contextRaw = form.get("context");
    if (typeof contextRaw !== "string" || contextRaw.length > 4_000) return apiJson({ ...envelope, status: "error", message: "现场信息格式不正确。" }, 400);
    const parsed = parseContext(JSON.parse(contextRaw), hasImage);
    if (!parsed.ok) return apiJson({ ...envelope, status: "error", message: parsed.error }, 400);
    let image: { mime: string; bytes: Buffer } | undefined;
    if (hasImage) {
      if (file.size > 2.5 * 1024 * 1024) return apiJson({ ...envelope, status: "error", message: "照片太大，请换一张。" }, 413);
      const input = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(input, { limitInputPixels: 20_000_000 }).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "") || !metadata.width || !metadata.height || metadata.width * metadata.height > 20_000_000) return apiJson({ ...envelope, status: "error", message: "请使用 JPEG、PNG 或 WebP 照片。" }, 415);
      const output = await sharp(input, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      image = { mime: "image/jpeg", bytes: output };
    }
    if (mode === "live" && !dailyBudget("roast", 100)) return apiJson({ ...envelope, status: "error", message: "今天的生成额度已用完，请明天再试。" }, 429);
    const result = mode === "demo" ? demoRoasts(parsed.context) : await generateRoasts(parsed.context, image, generationMode);
    return apiJson({ ...envelope, ...result });
  } catch (error) {
    const kind = error instanceof ModelError ? error.kind : error instanceof Error && error.message === "too_large" ? "too_large" : "invalid_request";
    const message = error instanceof ModelError ? error.message : kind === "too_large" ? "照片或请求太大，请换一张。" : "照片或现场信息无法处理，请换一张试试。";
    console.warn(JSON.stringify({ type: "scene_roast_error", requestId, kind }));
    return apiJson({ ...envelope, status: "error", message }, kind === "too_large" ? 413 : kind === "config" ? 503 : kind === "rate" ? 429 : kind === "invalid_request" ? 400 : 502);
  }
}
