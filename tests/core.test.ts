import assert from "node:assert/strict";
import test from "node:test";
import { parseContext, parseGenerationMode, parseModelResult } from "../src/lib/validation";
import { formatPlace } from "../src/lib/location";
import { parseEvent } from "../src/lib/events";
import { PROMPT_VERSION, SCENE_ROAST_SYSTEM_PROMPT } from "../src/lib/prompt";

const base = {
  source: "camera", selectedAt: "2026-09-24T12:30:00.000Z", timezone: "Asia/Shanghai",
  background: "已经堵了两小时", place: null, placeSource: null,
  timeConfirmed: true, placeConfirmed: false, previousRoasts: [],
};

test("text input requires a scene but photo input can omit a note", () => {
  assert.equal(parseContext({ ...base, source: "text", background: "" }, false).ok, false);
  assert.equal(parseContext({ ...base, background: "" }, true).ok, true);
});

test("album time and place are excluded until confirmed", () => {
  const parsed = parseContext({ ...base, source: "album", place: "上海市静安区", placeSource: "gps", timeConfirmed: false, placeConfirmed: false }, true);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.context.sceneTime, null);
    assert.equal(parsed.context.place, null);
  }
});

test("precise residential addresses are rejected as model place input", () => {
  const parsed = parseContext({ ...base, place: "上海市静安区某路18号3栋", placeSource: "manual", placeConfirmed: true }, true);
  assert.equal(parsed.ok, false);
});

test("model output requires three distinct bounded plain texts", () => {
  assert.equal(parseModelResult({ status: "ok", roasts: [{ id: "r1", text: "重复内容十二个字符" }, { id: "r2", text: "重复内容十二个字符" }, { id: "r3", text: "重复内容十二个字符" }], message: null }).ok, false);
  assert.equal(parseModelResult({ status: "blocked", roasts: [], message: "请换一个生活场景" }).ok, true);
});

test("generation mode defaults to fast and rejects unknown values", () => {
  assert.equal(parseGenerationMode(null), "fast");
  assert.equal(parseGenerationMode("fast"), "fast");
  assert.equal(parseGenerationMode("deep"), "deep");
  assert.equal(parseGenerationMode("slow"), null);
});

test("place uses coarse administrative labels only", () => {
  assert.equal(formatPlace({ province: "上海市", city: [], district: "静安区", township: "某街道" }, 25), "上海市静安区");
  assert.equal(formatPlace({ province: "浙江省", city: "杭州市", district: "西湖区", township: "某街道" }, 2000), "杭州市西湖区");
});

test("events reject arbitrary content fields", () => {
  assert.equal(parseEvent({ event: "copy_succeeded", sessionId: "abc12345", text: "private" }).ok, false);
  assert.equal(parseEvent({ event: "copy_succeeded", sessionId: "abc12345" }).ok, true);
});

test("the full scene prompt is used as an independent versioned module", () => {
  assert.equal(PROMPT_VERSION, "scene-roast-v0.3");
  assert.ok(SCENE_ROAST_SYSTEM_PROMPT.length > 1000);
  assert.ok(SCENE_ROAST_SYSTEM_PROMPT.includes("【毒舌风格：先准，再狠】"));
  assert.ok(SCENE_ROAST_SYSTEM_PROMPT.includes("不能编造具体物体"));
  assert.ok(SCENE_ROAST_SYSTEM_PROMPT.includes("上一批文案"));
});
