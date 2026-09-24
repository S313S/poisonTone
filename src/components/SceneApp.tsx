"use client";
/* eslint-disable @next/next/no-img-element -- object URLs are local previews, not remote image assets */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { preparePhoto } from "@/lib/photo";
import type { GenerationMode } from "@/lib/validation";

type Source = "camera" | "album" | "text";
type PlaceState = "idle" | "loading" | "ready" | "denied" | "failed";
type Result = { requestId: string; promptVersion: string; mode: "live" | "demo"; status: "ok" | "needs_context" | "blocked" | "error"; roasts?: { id: string; text: string }[]; message?: string | null };
type GameKind = "truth" | "dare";

const GAME_QUESTIONS: Record<GameKind, string[]> = {
  truth: [
    "这周哪件小事最让你想翻白眼？只说事，不点名。",
    "如果今天能删掉一件家务，你会删哪件？",
    "最近哪次出门，你刚出发就想原路返回？",
    "今天有什么瞬间，让你差点脱口而出‘我真服了’？",
  ],
  dare: [
    "轮流用六个字吐槽眼前这事，不准带脏字。",
    "用导航播报的语气，给今天这事配一句话。",
    "给这场面起个电影名，谁先把大家逗笑谁赢。",
    "每人补四个字，接龙拼出一句离谱的现场吐槽。",
  ],
};

function GenerationWait({ mode, elapsedSeconds }: { mode: GenerationMode; elapsedSeconds: number }) {
  return <div className="generationWait">
    <div className="waitTrack" role="progressbar" aria-label="文案生成中"><span /></div>
    <p role="status">{mode === "deep" ? "深度开喷中，正在酝酿新角度。" : "先快速找三句槽点…"}</p>
    <small aria-hidden="true">已等待 {elapsedSeconds} 秒</small>
  </div>;
}

function WaitGame({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<GameKind>("truth");
  const [questionIndex, setQuestionIndex] = useState<Record<GameKind, number>>({ truth: 0, dare: 0 });
  return <aside className="waitGame" aria-label="等候小游戏">
    <div className="waitGameHeader"><div><span>等候小游戏</span><h3>先和家人朋友玩一题</h3></div><button onClick={onClose} aria-label="收起等候小游戏">×</button></div>
    <p className="gameIntro">轮流作答或接招，可以跳过不想答的题。</p>
    <div className="gameKinds"><button className={kind === "truth" ? "active" : ""} aria-pressed={kind === "truth"} onClick={() => setKind("truth")}>真心话</button><button className={kind === "dare" ? "active" : ""} aria-pressed={kind === "dare"} onClick={() => setKind("dare")}>嘴上大冒险</button></div>
    <p className="gameQuestion">{GAME_QUESTIONS[kind][questionIndex[kind]]}</p>
    <button className="nextQuestion" onClick={() => setQuestionIndex((current) => ({ ...current, [kind]: (current[kind] + 1) % GAME_QUESTIONS[kind].length }))}>换一题 ↻</button>
  </aside>;
}

export default function SceneApp({ demoMode, deepThinkingAvailable }: { demoMode: boolean; deepThinkingAvailable: boolean }) {
  const [source, setSource] = useState<Source>("camera");
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [background, setBackground] = useState("");
  const [selectedAt, setSelectedAt] = useState<string | null>(null);
  const [place, setPlace] = useState("");
  const [placeSource, setPlaceSource] = useState<"gps" | "manual" | null>(null);
  const [placeState, setPlaceState] = useState<PlaceState>("idle");
  const [placeMessage, setPlaceMessage] = useState("");
  const [placeConfirmed, setPlaceConfirmed] = useState(false);
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [locationChoice, setLocationChoice] = useState<"unset" | "allow" | "skip">("unset");
  const [showConsent, setShowConsent] = useState(false);
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fast");
  const [resultMode, setResultMode] = useState<GenerationMode>("fast");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gameVisible, setGameVisible] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<{ id: string; success: boolean; text: string } | null>(null);
  const [feedback, setFeedback] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const sceneRef = useRef(0);
  const locationRef = useRef(0);
  const previewRef = useRef<string | null>(null);
  const sessionRef = useRef("");
  const inputReadyRef = useRef(false);
  const generationStartedAtRef = useRef(0);

  function event(name: string, extra: Record<string, unknown> = {}) {
    if (!sessionRef.current) return;
    const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop";
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: name, sessionId: sessionRef.current, device, ...extra }), keepalive: true }).catch(() => {});
  }
  useEffect(() => {
    sessionRef.current = crypto.randomUUID();
    event("page_open");
    return () => { requestRef.current?.abort(); if (previewRef.current) URL.revokeObjectURL(previewRef.current); };
  }, []);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - generationStartedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  function resetForNewScene() {
    inputReadyRef.current = false;
    sceneRef.current++;
    generationRef.current++;
    locationRef.current++;
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false); setResult(null); setError(""); setCopyState(null); setFeedback(false);
    setGenerationMode("fast"); setResultMode("fast"); setElapsedSeconds(0); setGameVisible(false);
    setPlace(""); setPlaceSource(null); setPlaceState("idle"); setPlaceMessage(""); setPlaceConfirmed(false);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null; setPreview(null); setImage(null);
  }

  async function choosePhoto(file: File | undefined, nextSource: "camera" | "album") {
    if (!file) return;
    resetForNewScene();
    const sceneToken = sceneRef.current;
    const chosenAt = new Date().toISOString();
    setSource(nextSource); setBackground(""); setTimeConfirmed(nextSource === "camera");
    try {
      const prepared = await preparePhoto(file);
      if (sceneToken !== sceneRef.current) { URL.revokeObjectURL(prepared.preview); return; }
      previewRef.current = prepared.preview;
      setPreview(prepared.preview); setImage(prepared.blob);
      setSelectedAt(chosenAt);
      event("input_ready", { hasImage: true });
      inputReadyRef.current = true;
      if (locationChoice === "allow") void requestLocation(nextSource);
    } catch (e) { setError(e instanceof Error ? e.message : "照片处理失败。"); }
  }

  function useTextOnly() {
    resetForNewScene(); setSource("text"); setSelectedAt(null); setTimeConfirmed(true); setBackground("");
  }

  function skipLocation() {
    locationRef.current++;
    setLocationChoice("skip"); setPlace(""); setPlaceSource(null); setPlaceConfirmed(false);
    setPlaceState("idle"); setPlaceMessage("本次不使用位置，可以直接生成。");
  }

  async function requestLocation(forSource: Source = source) {
    setLocationChoice("allow");
    const token = ++locationRef.current;
    if (!window.isSecureContext || !navigator.geolocation) { setPlaceState("failed"); setPlaceMessage("当前浏览器无法定位，请使用 HTTPS 或手动填写。"); event("location_failed", { errorType: "unavailable" }); return; }
    setPlaceState("loading"); setPlaceMessage("正在获取一次当前位置…");
    navigator.geolocation.getCurrentPosition(async (position) => {
      if (token !== locationRef.current) return;
      try {
        const response = await fetch("/api/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, source: "gps" }) });
        const data = await response.json();
        if (token !== locationRef.current) return;
        if (!response.ok || data.status !== "ok") throw new Error(data.message || "地点解析失败。");
        setPlace(data.place); setPlaceSource("gps"); setPlaceState("ready"); setPlaceConfirmed(forSource !== "album");
        setPlaceMessage(forSource === "album" ? "这是现在的位置；若照片是旧照，请先确认是否与画面有关。" : "已取得大致位置，可修改或清除。 ");
        event("location_success", { hasPlace: true });
      } catch (e) {
        if (token !== locationRef.current) return;
        setPlaceState("failed"); setPlaceMessage(e instanceof Error ? e.message : "地点解析失败，可手动填写或跳过。");
        event("location_failed", { errorType: "geocode" });
      }
    }, (geoError) => {
      if (token !== locationRef.current) return;
      setPlaceState(geoError.code === 1 ? "denied" : "failed");
      setPlaceMessage(geoError.code === 1 ? "已拒绝定位。可以不带位置继续。" : geoError.code === 3 ? "定位超时，可以不带位置继续。" : "暂时无法定位，可以手动填写。");
      event("location_failed", { errorType: geoError.code === 1 ? "denied" : geoError.code === 3 ? "timeout" : "unavailable" });
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
  }

  async function generate(regenerate = false, confirmedNow = false, requestedMode: GenerationMode = "fast") {
    if (loading) return;
    if (requestedMode === "deep" && !deepThinkingAvailable) { setError("当前模型暂不支持深度开喷。"); return; }
    if (!image && !background.trim()) { setError("请拍一张，或补一句现场情况。"); return; }
    if (!consented && !confirmedNow) { setShowConsent(true); return; }
    setError(""); setCopyState(null); setGenerationMode(requestedMode); setElapsedSeconds(0);
    generationStartedAtRef.current = Date.now();
    if (requestedMode === "deep") setGameVisible(true);
    setLoading(true);
    const token = ++generationRef.current;
    const controller = new AbortController(); requestRef.current = controller;
    const time = selectedAt || new Date().toISOString();
    if (!selectedAt) setSelectedAt(time);
    const context = { source: image ? source : "text", selectedAt: time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai", background: background.trim(), place: place.trim() || null, placeSource, placeConfirmed, timeConfirmed, previousRoasts: regenerate ? result?.roasts?.map((item) => item.text) || [] : [] };
    const form = new FormData();
    form.set("context", JSON.stringify(context));
    form.set("generationMode", requestedMode);
    if (image) form.set("image", image, "scene.jpg");
    event("generate_started", { hasImage: !!image, hasPlace: !!(place && placeConfirmed) });
    try {
      const response = await fetch("/api/roast", { method: "POST", body: form, signal: controller.signal });
      const data: Result = await response.json();
      if (token !== generationRef.current) return;
      if (!response.ok || data.status === "error") throw new Error(data.message || "生成失败，请稍后再试。");
      setResult(data); setResultMode(requestedMode); setFeedback(false);
      event("generate_succeeded", { requestId: data.requestId, hasImage: !!image, hasPlace: !!(place && placeConfirmed), promptVersion: data.promptVersion });
    } catch (e) {
      if (token !== generationRef.current || controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "生成失败，请稍后再试。");
      event("generate_failed", { errorType: "request" });
    } finally { if (token === generationRef.current) setLoading(false); }
  }

  async function copy(id: string, text: string) {
    const marked = `${text}（AI生成）`;
    try {
      await navigator.clipboard.writeText(marked);
      setCopyState({ id, success: true, text: marked });
      event("copy_succeeded", { requestId: result?.requestId });
    } catch {
      setCopyState({ id, success: false, text: marked });
      event("copy_fallback_shown", { requestId: result?.requestId });
    }
  }

  const timeLabel = selectedAt ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedAt)) : "提交时自动记录";
  const hasResults = result?.status === "ok";

  return <main className="appShell">
    <header className="siteHeader"><span className="brandMark">毒</span><span className="brandName">现场毒舌</span><span className="headerTag">把槽点说准</span></header>
    {demoMode && <div className="demoBanner" role="status">演示数据，非实时 AI 生成</div>}
    <section className="hero"><p className="eyebrow">生活已经够有戏了</p><h1>拍下眼前的破事，<br /><em>我替你吐槽。</em></h1><p className="heroDesc">一张照片，或一句现场情况。三句损得具体、能直接复制的话。</p></section>
    <input ref={cameraRef} className="hiddenInput" type="file" accept="image/*" capture="environment" onChange={(e) => { void choosePhoto(e.target.files?.[0], "camera"); e.target.value = ""; }} />
    <input ref={albumRef} className="hiddenInput" type="file" accept="image/*" onChange={(e) => { void choosePhoto(e.target.files?.[0], "album"); e.target.value = ""; }} />
    {hasResults ? <section className="resultSection">
      <div className="sectionHeading"><div><p className="eyebrow">这次的现场</p><h2>替你说出来了</h2></div><span className="aiBadge">AI 生成{resultMode === "deep" ? " · 深度版" : ""} · 仅供娱乐</span></div>
      <div className="sceneSummary">{preview && <img src={preview} alt="本次选择的现场照片" />}<div><strong>{background || "一张现场照片"}</strong><small>本次使用时间：{timeLabel}{place && placeConfirmed ? ` · ${place}` : ""}</small>{source === "album" && <small>相册照片的原始拍摄时间、地点未核实</small>}</div></div>
      <div className="roastList">{result.roasts?.map((item, index) => <article className="roastCard" key={item.id}><span className="cardNumber">0{index + 1}</span><p>{item.text}</p><button className="copyButton" onClick={() => void copy(item.id, item.text)}>{copyState?.id === item.id && copyState.success ? "已复制 ✓" : "复制这句"}</button>{copyState?.id === item.id && !copyState.success && <div className="copyFallback"><span>自动复制失败，长按下方文字复制：</span><p>{copyState.text}</p></div>}</article>)}</div>
      <div className="resultActions"><button className="primaryButton" disabled={loading} onClick={() => { event("regenerate_clicked", { requestId: result.requestId, modelTag: "fast" }); void generate(true, false, "fast"); }}>{loading ? "正在找新槽点…" : "快速换一批"}</button><button className="secondaryButton" onClick={() => { resetForNewScene(); setBackground(""); setSelectedAt(null); setSource("camera"); }}>重新拍一张</button></div>
      {deepThinkingAvailable && <button className="deepStartButton" disabled={loading} onClick={() => { event("regenerate_clicked", { requestId: result.requestId, modelTag: "deep" }); void generate(true, false, "deep"); }}>{resultMode === "deep" ? "还不够狠？再憋一轮" : "不够狠？让它深度开喷"}<small>重新生成三条 · 通常约 20～35 秒，较慢时可能超过</small></button>}
      {loading && <GenerationWait mode={generationMode} elapsedSeconds={elapsedSeconds} />}
      {loading && (generationMode === "deep" || elapsedSeconds >= 8) && !gameVisible && <button className="reopenGame" onClick={() => setGameVisible(true)}>等着无聊？玩一题</button>}
      {gameVisible && <WaitGame onClose={() => setGameVisible(false)} />}
      {error && <p className="inlineError" role="alert">{error}</p>}
      <button className="feedbackButton" disabled={feedback} onClick={() => { setFeedback(true); event("not_funny_clicked", { requestId: result.requestId }); }}>{feedback ? "收到，会继续练嘴" : "这批不够好笑"}</button>
    </section> : <section className="inputSection"><div className="sectionHeading"><div><p className="eyebrow">先把现场交给我</p><h2>今天，哪件事欠一句吐槽？</h2></div><span className="stepTag">01 / 02</span></div>
      <div className="captureCard">{preview ? <div className="previewWrap"><img src={preview} alt="已选照片预览" /><button onClick={() => albumRef.current?.click()}>重新选择照片</button></div> : <button className="cameraButton" onClick={() => cameraRef.current?.click()}><span className="cameraGlyph">◎</span><strong>拍一张</strong><small>用后置相机记录这场面</small></button>}
        <div className="inputAlternatives"><button onClick={() => albumRef.current?.click()}>从相册选</button><span>或</span><button onClick={useTextOnly}>不拍照，说一句</button></div></div>
      {source === "album" && preview && <div className="notice">这是本次使用的时间和地点，不一定是照片拍摄信息。<label><input type="checkbox" checked={timeConfirmed} onChange={(e) => setTimeConfirmed(e.target.checked)} />确认本次时间与画面有关</label></div>}
      <label className="fieldLabel" htmlFor="background">最想吐槽的具体槽点 <span>{image ? "选填" : "必填"}</span></label><textarea id="background" maxLength={120} rows={3} value={background} onChange={(e) => { setBackground(e.target.value); if (e.target.value.trim() && !inputReadyRef.current) { inputReadyRef.current = true; event("input_ready", { hasImage: !!image }); } }} placeholder="例如：导航半小时都显示‘还要一小时’。只写真实发生的事。" /><div className="charCount">{background.length} / 120</div>
      <div className="contextPanel"><div><span className="contextIcon">◷</span><div><strong>本次使用时间</strong><small>{timeLabel}</small></div></div><div><span className="contextIcon">⌖</span><div><strong>地点 <small>可跳过</small></strong><small>{placeState === "loading" ? "定位中…" : place || placeMessage || "未使用位置"}</small></div></div>
        {locationChoice === "unset" ? <div className="locationChoices"><p>允许使用当前位置？仅获取一次，并解析为大致地点。</p><button onClick={() => void requestLocation()}>允许使用当前位置</button><button onClick={skipLocation}>不使用位置</button></div> : <div className="locationChoices"><button disabled={placeState === "loading" || placeState === "denied"} onClick={() => void requestLocation()}>{placeState === "loading" ? "定位中…" : "重新获取位置"}</button><button onClick={skipLocation}>清除／不使用位置</button></div>}
        <label className="manualPlace">手动修改地点<input value={place} maxLength={60} onChange={(e) => { locationRef.current++; setPlace(e.target.value); setPlaceSource(e.target.value ? "manual" : null); setPlaceConfirmed(!!e.target.value); setPlaceState("idle"); }} placeholder="例如：上海市静安区（可留空）" /></label>
        {source === "album" && !!place && <label className="albumConfirm"><input type="checkbox" checked={placeConfirmed} onChange={(e) => setPlaceConfirmed(e.target.checked)} />确认这个地点与相册照片中的现场有关</label>}
      </div>
      <button className="primaryButton generateButton" disabled={loading || (!image && !background.trim())} onClick={() => void generate()}>{loading ? "正在找槽点…" : "替我吐槽"}<span>↗</span></button>
      {deepThinkingAvailable && <p className="generationHint">先快速出三句；不够狠，再让它深度开喷。</p>}
      {loading && <GenerationWait mode={generationMode} elapsedSeconds={elapsedSeconds} />}
      {loading && elapsedSeconds >= 8 && !gameVisible && <button className="reopenGame" onClick={() => setGameVisible(true)}>等着无聊？玩一题</button>}
      {gameVisible && <WaitGame onClose={() => setGameVisible(false)} />}
      {result && result.status !== "ok" && <p className="inlineMessage" role="status">{result.message}</p>}
      {error && <p className="inlineError" role="alert">{error}</p>}
      <p className="safetyNote">请在安全停车后或乘车时使用。不要上传含敏感信息的画面。</p>
    </section>}
    <footer><span>只吐槽现场，不替你编故事。</span><Link href="/privacy">隐私与使用说明</Link></footer>
    {showConsent && <div className="modalOverlay"><div className="consentModal" role="dialog" aria-modal="true" aria-labelledby="consent-title"><p className="eyebrow">发送前确认</p><h2 id="consent-title">{demoMode ? "这次会使用演示数据" : "这次内容会交给模型分析"}</h2><p>{demoMode ? "演示模式只验证操作流程，不调用模型；你的照片和填写的信息会发送到本应用服务端处理，但不会生成真实 AI 文案。" : "照片和填写的信息将发送至你配置的模型服务，用来生成三条吐槽。若启用位置，坐标会先由高德地图服务解析，模型只收到大致地点。应用不建立照片历史；服务商留存规则以实际配置为准。"}</p><div><button className="secondaryButton" onClick={() => setShowConsent(false)}>先不发送</button><button className="primaryButton" onClick={() => { setConsented(true); setShowConsent(false); void generate(false, true); }}>同意并生成</button></div></div></div>}
  </main>;
}
