import { NextRequest } from "next/server";
import { apiJson, boundedBody, limit, sameOrigin } from "@/lib/server";
import { resolvePlace } from "@/lib/location";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return apiJson({ status: "error", message: "请求来源不正确。" }, 403);
  if (!limit(request, "location", 25)) return apiJson({ status: "error", message: "定位请求太频繁，请稍后再试。" }, 429);
  try {
    const bytes = await boundedBody(request, 1024);
    const raw = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const { latitude, longitude, accuracy, source } = raw;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0 || accuracy > 100_000 || !["gps", "autonavi"].includes(source)) return apiJson({ status: "error", message: "坐标信息不正确。" }, 400);
    if (!process.env.AMAP_WEB_SERVICE_KEY) return apiJson({ status: "unavailable", message: "地图服务尚未配置，可手动填写地点或跳过。" }, 503);
    const place = await resolvePlace(latitude, longitude, accuracy, source, process.env.AMAP_WEB_SERVICE_KEY);
    if (!place) return apiJson({ status: "unavailable", message: "暂时无法解析地点，可手动填写或跳过。" }, 502);
    return apiJson({ status: "ok", place, source: "gps", coarse: true });
  } catch {
    return apiJson({ status: "unavailable", message: "定位解析失败，可手动填写或跳过。" }, 502);
  }
}
