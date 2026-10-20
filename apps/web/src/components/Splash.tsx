"use client";

import { useEffect, useState } from "react";

import { Logo } from "./brand/Logo";

const SEEN_KEY = "mighty-splash-seen";
const DURATION = 1600;

/** 이 탭에서 스플래시를 보여 줄지. effect가 두 번 돌아도(개발 모드) 한 번만 정한다 */
let shouldShow: boolean | null = null;

function decideOnce(): boolean {
  if (shouldShow !== null) return shouldShow;
  try {
    shouldShow = sessionStorage.getItem(SEEN_KEY) !== "1";
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 저장소를 못 쓰면 매번 보여 준다.
    shouldShow = true;
  }
  return shouldShow;
}

/** 처음 열었을 때 로고가 펼쳐지는 화면. 한 번 연 뒤 같은 탭에서는 다시 보이지 않고, 누르면 바로 넘긴다 */
export function Splash() {
  // 볼지 정하기 전에는 그리지 않는다. 다시 연 탭에서 스플래시가 잠깐 번쩍이지 않게 한다.
  const [stage, setStage] = useState<"pending" | "show" | "fade" | "done">(
    "pending",
  );

  useEffect(() => {
    if (!decideOnce()) {
      setStage("done");
      return;
    }
    setStage("show");
    const fade = setTimeout(() => setStage("fade"), DURATION);
    const done = setTimeout(() => setStage("done"), DURATION + 400);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, []);

  if (stage === "done" || stage === "pending") return null;
  return (
    <button
      type="button"
      aria-label="시작 화면으로 넘어가기"
      onClick={() => setStage("done")}
      className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 bg-felt-dark transition-opacity duration-400 ${
        stage === "fade" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="splash-glow absolute inset-0" />
      <div className="relative">
        <Logo size={300} animated />
      </div>
      <p className="splash-tagline relative text-sm text-white/70">
        대학가 카드게임, 다시 한 판
      </p>
    </button>
  );
}
