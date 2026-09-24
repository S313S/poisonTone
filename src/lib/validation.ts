export type InputSource = "camera" | "album" | "text";
export type GenerationMode = "fast" | "deep";
export type SceneContext = {
  source: InputSource;
  hasImage: boolean;
  selectedAt: string;
  timezone: string;
  sceneTime: string | null;
  place: string | null;
  placeSource: "gps" | "manual" | null;
  background: string;
  previousRoasts: string[];
};
type Parse<T> = { ok: true; value: T } | { ok: false; error: string };
export type RoastResult = { status: "ok" | "needs_context" | "blocked"; roasts: { id: string; text: string }[]; message: string | null };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const bounded = (value: unknown, max: number) => typeof value === "string" && [...value].length <= max;

export function parseGenerationMode(value: unknown): GenerationMode | null {
  if (value === null || value === "fast") return "fast";
  return value === "deep" ? "deep" : null;
}

export function parseContext(raw: unknown, hasImage: boolean): { ok: true; context: SceneContext } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "现场信息格式不正确。" };
  const source = raw.source;
  if (source !== "camera" && source !== "album" && source !== "text") return { ok: false, error: "输入来源不正确。" };
  if ((source === "text" && hasImage) || (source !== "text" && !hasImage)) return { ok: false, error: "照片和输入来源不匹配。" };
  if (!bounded(raw.background, 120) || !bounded(raw.place, 60) && raw.place !== null || !bounded(raw.timezone, 80)) return { ok: false, error: "现场信息太长。" };
  const background = (raw.background as string).trim();
  if (!hasImage && !background) return { ok: false, error: "请拍一张，或补一句现场情况。" };
  if (typeof raw.selectedAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(raw.selectedAt) || !Number.isFinite(Date.parse(raw.selectedAt))) return { ok: false, error: "本次使用时间不正确。" };
  if (Math.abs(Date.now() - Date.parse(raw.selectedAt)) > 24 * 3600_000) return { ok: false, error: "本次使用时间已过期，请重新选择。" };
  try { new Intl.DateTimeFormat("zh-CN", { timeZone: raw.timezone as string }).format(); }
  catch { return { ok: false, error: "设备时区不正确。" }; }
  if (typeof raw.timeConfirmed !== "boolean" || typeof raw.placeConfirmed !== "boolean" || ![null, "gps", "manual"].includes(raw.placeSource as string | null)) return { ok: false, error: "现场确认信息不正确。" };
  if (!Array.isArray(raw.previousRoasts) || raw.previousRoasts.length > 3 || !raw.previousRoasts.every((v) => bounded(v, 100))) return { ok: false, error: "上一批文案格式不正确。" };
  const allowSceneTime = source !== "album" || raw.timeConfirmed;
  const place = raw.placeConfirmed && typeof raw.place === "string" ? raw.place.trim() || null : null;
  if (place && (/\d|号|栋|幢|单元|房间|门牌/.test(place) || [...place].length > 40)) return { ok: false, error: "地点请只写城市、区县或公共地点附近，不填门牌。" };
  const formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: raw.timezone as string, year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "numeric", hour12: false });
  return { ok: true, context: {
    source, hasImage, selectedAt: raw.selectedAt, timezone: raw.timezone as string,
    sceneTime: allowSceneTime ? formatter.format(new Date(raw.selectedAt)) : null,
    place, placeSource: place ? raw.placeSource as "gps" | "manual" : null,
    background, previousRoasts: raw.previousRoasts as string[],
  } };
}

export function parseModelResult(raw: unknown): Parse<RoastResult> {
  if (!isRecord(raw) || !["ok", "needs_context", "blocked"].includes(raw.status as string) || !Array.isArray(raw.roasts)) return { ok: false, error: "模型结果格式不正确。" };
  if (raw.status !== "ok") {
    if (raw.roasts.length !== 0 || !bounded(raw.message, 100) || !(raw.message as string).trim()) return { ok: false, error: "模型结果格式不正确。" };
    return { ok: true, value: { status: raw.status as "blocked" | "needs_context", roasts: [], message: raw.message as string } };
  }
  if (raw.roasts.length !== 3 || raw.message !== null) return { ok: false, error: "模型没有返回三条文案。" };
  const texts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const item = raw.roasts[i];
    if (!isRecord(item) || item.id !== `r${i + 1}` || typeof item.text !== "string") return { ok: false, error: "文案格式不正确。" };
    const text = item.text.trim();
    if ([...text].length < 12 || [...text].length > 70 || /<[^>]+>|\b(?:1[3-9]\d{9})\b/.test(text)) return { ok: false, error: "文案长度或内容不合适。" };
    texts.push(text);
  }
  if (new Set(texts).size !== 3) return { ok: false, error: "三条文案重复。" };
  return { ok: true, value: { status: "ok", roasts: texts.map((text, i) => ({ id: `r${i + 1}`, text })), message: null } };
}
