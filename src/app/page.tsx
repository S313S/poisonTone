import SceneApp from "@/components/SceneApp";

export const dynamic = "force-dynamic";

export default function Home() {
  const demoMode = process.env.DEMO_MODE === "true";
  return <SceneApp demoMode={demoMode} deepThinkingAvailable={!demoMode && process.env.LLM_MODEL === "deepseek-v4.1-flash"} />;
}
