"use client";

import { useEffect, useState } from "react";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useOmokTutorialProgress } from "@/tutorial/progress";

import { endOmokSession } from "../session";
import {
  OMOK_LEVELS,
  type OmokLevel,
  useOmokSettings,
  VARIANT_INFO,
} from "../settings";

import {
  clearOmok,
  loadOmok,
  type OmokSaved,
  type StonePick,
  useOmok,
} from "../store";
import { OMOK_LESSONS } from "../tutorial";
import { OmokGame } from "./OmokGame";
import { OmokOnlineScreen } from "./OmokOnlineScreen";
import { omokTutorial } from "./omok-tutorial";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: StonePick; label: string }[] = [
  { value: "black", label: "● 흑(먼저)" },
  { value: "white", label: "○ 백" },
  { value: "random", label: "무작위" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm transition",
        active
          ? "border-amber-300 bg-amber-300 font-semibold text-black"
          : "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm text-white/70">{title}</h2>
      {children}
    </section>
  );
}

/** 시작 화면: 규칙·판 수·컴퓨터·내 돌을 고른다 */
function OmokStart({
  onStart,
  onOnline,
  onLearn,
}: {
  onStart: (saved?: OmokSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
}) {
  const s = useOmokSettings();
  const learned = useOmokTutorialProgress((p) => p.completed.length);
  const total = OMOK_LESSONS.length;
  const [saved, setSaved] = useState<OmokSaved | null>(null);
  useEffect(() => setSaved(loadOmok()), []);
  const variant = VARIANT_INFO.find((v) => v.value === s.variant);
  const level = OMOK_LEVELS.find((l) => l.value === s.level);

  return (
    <main
      data-game="center"
      className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)] px-4 py-6 text-white"
    >
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <BackToGames />
        <header className="text-center">
          <h1 className="font-black text-4xl tracking-tight">오목</h1>
          <p className="mt-1 text-sm text-white/70">
            가로·세로·대각선으로 다섯 개를 먼저 잇는 사람이 이긴다
          </p>
        </header>

        <button
          type="button"
          onClick={onLearn}
          className="flex flex-col items-start gap-0.5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
        >
          <span className="font-bold">오목 배우기</span>
          <span className="text-white/60 text-xs">
            {learned >= total
              ? "모든 단원을 마쳤어요. 언제든 다시 볼 수 있어요"
              : learned > 0
                ? `${learned}/${total} 단원 마침`
                : `처음이라면 여기부터. ${total}단원, 미션 4개`}
          </span>
        </button>

        {saved && (
          <button
            type="button"
            onClick={() => onStart(saved)}
            className="rounded-2xl bg-white/10 py-3 font-semibold hover:bg-white/15"
          >
            이어하기
          </button>
        )}

        <Section title="규칙">
          <div className="flex gap-2">
            {VARIANT_INFO.map((v) => (
              <Chip
                key={v.value}
                active={s.variant === v.value}
                onClick={() => s.set({ variant: v.value })}
              >
                {v.label}
              </Chip>
            ))}
          </div>
          <p className="text-white/60 text-xs">{variant?.description}</p>
        </Section>

        <Section title="판 수">
          <div className="flex gap-2">
            {WINS_OPTIONS.map((w) => (
              <Chip
                key={w.value}
                active={s.winsToFinish === w.value}
                onClick={() => s.set({ winsToFinish: w.value })}
              >
                {w.label}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="컴퓨터">
          <div className="flex gap-2">
            {OMOK_LEVELS.map((l) => (
              <Chip
                key={l.value}
                active={s.level === l.value}
                onClick={() => s.set({ level: l.value as OmokLevel })}
              >
                {l.label}
              </Chip>
            ))}
          </div>
          <p className="text-white/60 text-xs">{level?.description}</p>
        </Section>

        <Section title="내 돌">
          <div className="flex gap-2">
            {PICK_OPTIONS.map((p) => (
              <Chip
                key={p.value}
                active={s.pick === p.value}
                onClick={() => s.set({ pick: p.value })}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="text-white/60 text-xs">
            여러 판이면 판마다 흑백을 바꾼다
          </p>
        </Section>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.showForbidden}
            onChange={(e) => s.set({ showForbidden: e.target.checked })}
            className="size-4 accent-amber-300"
          />
          내 차례에 금지 자리를 ×로 보이기
        </label>

        <button
          type="button"
          onClick={() => onStart()}
          className="rounded-2xl bg-amber-300 py-3 font-bold text-black text-lg hover:bg-amber-200"
        >
          컴퓨터와 시작
        </button>
        <button
          type="button"
          onClick={onOnline}
          className="rounded-2xl border border-amber-300/60 py-3 font-bold text-amber-200 text-lg hover:bg-amber-300/10"
        >
          친구와 하기
        </button>
        <p className="-mt-3 text-center text-white/50 text-xs">
          방을 만들어 링크를 보내면 친구가 바로 들어옵니다. 위에서 고른 규칙과
          판 수를 씁니다
        </p>
        <a
          href="/profile?game=omok"
          className="self-center rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
        >
          내 기록·지난 게임 다시 보기
        </a>
        <p className="mt-2 text-center text-[11px] opacity-40">
          <MadeWith />
        </p>
      </div>
    </main>
  );
}

type Screen =
  | { kind: "start" }
  | {
      kind: "online";
      /** 초대 링크로 들어왔으면 방 코드, 방장이면 null */
      room: string | null;
      /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
      resume?: { room: string; restore: HostRestore };
    }
  | { kind: "playing" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string };

/** 오목(/omok): 시작 화면, 친구와 하기 방, 대국 화면 */
export function OmokApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useOmok((s) => s.view);
  const variant = useOmokSettings((s) => s.variant);
  const winsToFinish = useOmokSettings((s) => s.winsToFinish);

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    // 튜토리얼 미션은 이어하기 저장과 상관없다.
    if (view?.phase === "gameOver" && !useOmok.getState().practice) clearOmok();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("omok");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endOmokSession();
    useOmok.getState().leave();
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online")
    return (
      <OmokOnlineScreen
        rules={{ variant, winsToFinish }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <OmokGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={omokTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={omokTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  return (
    <OmokStart
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onStart={(saved) => {
        if (saved) useOmok.getState().resume(saved);
        else {
          const s = useOmokSettings.getState();
          useOmok.getState().newGame({
            rules: { variant: s.variant, winsToFinish: s.winsToFinish },
            level: s.level,
            pick: s.pick,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
