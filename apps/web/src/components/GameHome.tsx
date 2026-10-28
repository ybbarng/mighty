"use client";

import type { ReactNode } from "react";

import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";

import { BackToGames } from "./BackToGames";
import { MadeWith } from "./brand/MadeWith";

/** 큰 메뉴 단추 하나 */
export interface HomeAction {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}

function MenuItem({
  action,
  primary,
  primaryClass,
}: {
  action: HomeAction;
  primary: boolean;
  primaryClass: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        playUiCue("click");
        action.onClick();
      }}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
        primary ? primaryClass : "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      <span className="w-7 text-center text-2xl">{action.icon}</span>
      <span className="flex flex-1 flex-col">
        <span className="font-bold text-base">{action.title}</span>
        <span className={cn("text-xs", primary ? "opacity-75" : "opacity-60")}>
          {action.detail}
        </span>
      </span>
    </button>
  );
}

const SMALL =
  "rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15 text-center";

/**
 * 게임마다의 첫 화면. 모든 게임이 같은 모양을 쓴다(원작 마이티처럼 무엇을 할지만 고른다).
 * 위에서부터 게임 목록 링크, 그림과 한 줄 설명, 이어하기·혼자·다함께·배우기, 옵션·규칙·내 기록, 바닥글.
 * 규칙·컴퓨터 실력 같은 고를 것은 옵션 화면에 둔다.
 */
export function GameHome({
  game,
  background,
  primaryClass,
  hero,
  tagline,
  resume,
  solo,
  together,
  learn,
  onOptions,
  aboutLabel,
  onAbout,
  credit,
  theme,
}: {
  /** 내 기록 링크(`/profile?game=`)에 쓰는 게임 id */
  game: string;
  /** 화면 밖(당겨 내릴 때) 바탕색을 맞추는 `data-game` 값(globals.css) */
  theme?: string;
  /** 화면 배경(Tailwind 클래스) */
  background: string;
  /** 가장 먼저 권하는 단추의 색(Tailwind 클래스) */
  primaryClass: string;
  /** 제목 자리: 로고나 큰 그림과 이름 */
  hero: ReactNode;
  tagline: ReactNode;
  /** 저장한 대국이 있을 때만 */
  resume?: () => void;
  solo: HomeAction;
  together: HomeAction;
  learn: {
    title: string;
    /** 마친 단원 수와 모든 단원 수 */
    learned: number;
    total: number;
    /** 아직 하나도 안 했을 때의 안내 */
    firstHint: string;
    onClick: () => void;
  };
  onOptions: () => void;
  /** 규칙 한눈에 보기 단추 이름(예: "하트는?") */
  aboutLabel: string;
  onAbout: () => void;
  /** 바닥글 위 한 줄(어디서 이어받았나 등) */
  credit?: ReactNode;
}) {
  // 처음 온 사람에게는 배우기를 먼저 권한다. 하던 게임이 있으면 이어하기를.
  const newcomer = learn.learned === 0 && !resume;
  const learnDetail =
    learn.learned >= learn.total
      ? "모든 단원을 마쳤어요. 언제든 다시 볼 수 있어요"
      : learn.learned > 0
        ? `${learn.learned}/${learn.total} 단원 마침`
        : learn.firstHint;

  return (
    <main
      data-game={theme}
      className={cn(
        "flex min-h-dvh items-center justify-center p-4 text-white",
        background,
      )}
    >
      <div className="flex w-full max-w-sm flex-col gap-3">
        <BackToGames />
        <div className="mb-2 text-center">
          {hero}
          <p className="mt-2 font-medium text-sm text-white/85">{tagline}</p>
        </div>

        {resume && (
          <MenuItem
            primary
            primaryClass={primaryClass}
            action={{
              icon: "▶",
              title: "하던 게임 이어하기",
              detail: "멈춘 곳부터 다시 둡니다",
              onClick: resume,
            }}
          />
        )}
        <MenuItem
          primary={!resume && !newcomer}
          primaryClass={primaryClass}
          action={solo}
        />
        <MenuItem
          primary={false}
          primaryClass={primaryClass}
          action={together}
        />
        <MenuItem
          primary={newcomer}
          primaryClass={primaryClass}
          action={{
            icon: "🎓",
            title: learn.title,
            detail: learnDetail,
            onClick: learn.onClick,
          }}
        />

        <div className="mt-1 flex justify-center gap-2">
          <button type="button" onClick={onOptions} className={SMALL}>
            옵션
          </button>
          <button type="button" onClick={onAbout} className={SMALL}>
            {aboutLabel}
          </button>
          <a href={`/profile?game=${game}`} className={SMALL}>
            내 기록
          </a>
        </div>
        <p className="mt-2 text-center text-[11px] opacity-40">
          {credit}
          {credit && <br />}
          <MadeWith />
        </p>
      </div>
    </main>
  );
}
