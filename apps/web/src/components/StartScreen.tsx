"use client";

import type { ReactNode } from "react";

import { BOT_LEVELS } from "@/game/bots";
import { chosenRules, ruleLabel, useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import { useTutorialProgress } from "@/tutorial/progress";

import { Logo } from "./brand/Logo";

function MenuItem({
  title,
  detail,
  onClick,
  primary = false,
  icon,
}: {
  title: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
        primary
          ? "border-amber-300 bg-amber-400 text-black hover:bg-amber-300"
          : "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      <span className="w-7 text-center text-2xl">{icon}</span>
      <span className="flex flex-1 flex-col">
        <span className="font-bold text-base">{title}</span>
        <span className={cn("text-xs", primary ? "opacity-75" : "opacity-60")}>
          {detail}
        </span>
      </span>
    </button>
  );
}

/**
 * 첫 화면. 원작처럼 무엇을 할지만 고른다(나홀로·다함께·배우기).
 * 규칙·카드·컴퓨터 실력은 옵션 화면에 둔다.
 */
export function StartScreen({
  onSolo,
  onTogether,
  onTutorial,
  onOptions,
  onAbout,
  onResume,
}: {
  /** 나홀로 마이티: 컴퓨터와 */
  onSolo: () => void;
  /** 다함께 마이티: 방을 만들어 친구를 부른다 */
  onTogether: () => void;
  onTutorial: () => void;
  onOptions: () => void;
  onAbout: () => void;
  /** 저장한 대국이 있을 때만 */
  onResume?: () => void;
}) {
  const ruleCode = useSettings((s) => s.ruleCode);
  const customRules = useSettings((s) => s.customRules);
  const botLevel = useSettings((s) => s.botLevel);
  const learned = useTutorialProgress((s) => s.completed.length);
  const rules = chosenRules(ruleCode);
  const rule = ruleLabel(ruleCode, customRules);
  const level = BOT_LEVELS.find((l) => l.value === botLevel)?.label;
  // 처음 온 사람에게는 배우기를 먼저 권한다.
  const newcomer = learned === 0 && !onResume;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-sm flex-col gap-3">
        <div className="mb-2 text-center">
          <h1 className="flex justify-center">
            <Logo size={240} animated />
          </h1>
          <p className="mt-2 font-medium text-sm text-white/85">
            공약을 걸고, 프렌드를 찾고, 마이티로 뒤집어라
          </p>
        </div>

        {onResume && (
          <MenuItem
            primary
            icon="▶"
            title="하던 게임 이어하기"
            detail="멈춘 곳부터 다시 둡니다"
            onClick={onResume}
          />
        )}
        <MenuItem
          primary={!onResume && !newcomer}
          icon="♠"
          title="나홀로 마이티"
          detail={`컴퓨터 ${rules.playerCount - 1}명과 · ${rule} · ${level ?? ""}`}
          onClick={onSolo}
        />
        <MenuItem
          icon="👥"
          title="다함께 마이티"
          detail="링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다"
          onClick={onTogether}
        />
        <MenuItem
          primary={newcomer}
          icon="🎓"
          title="마이티 배우기"
          detail={
            learned === 0
              ? "처음이라면 여기부터. 용어부터 한 판까지"
              : `${learned}단원 마쳤어요`
          }
          onClick={onTutorial}
        />

        <div className="mt-1 flex justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={onOptions}
            className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            옵션
          </button>
          <button
            type="button"
            onClick={onAbout}
            className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            마이티는?
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] opacity-40">
          마이티 네트워크 4.0을 이어받아 만들었습니다 · © 2026 ybbarng
        </p>
      </div>
    </main>
  );
}
