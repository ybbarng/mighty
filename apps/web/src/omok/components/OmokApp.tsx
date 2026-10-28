"use client";

import { useEffect, useState } from "react";

import { GameHome } from "@/components/GameHome";
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

/** 오목 화면들의 배경(대국 화면의 짙은 돌색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

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

/** 판 위 돌과 같은 빛(왼쪽 위)과 그림자 */
const STONE = {
  black: "radial-gradient(circle at 36% 32%, #6b6b6b, #2a2a2a 35%, #050505)",
  white: "radial-gradient(circle at 36% 32%, #ffffff, #f1f0ec 55%, #b9b6ae)",
};

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
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-amber-300 bg-white text-black"
          : "border-white/15 bg-white/5",
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
      <h2 className="font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

/** 옵션·규칙 화면의 틀: 제목과 "처음으로" */
function SubScreen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className={cn("flex min-h-dvh justify-center p-4 text-white", BG)}>
      <div className="flex w-full max-w-md flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">{title}</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          {children}
        </div>
      </div>
    </main>
  );
}

/** 오목 옵션: 규칙·판 수·컴퓨터·내 돌·금지 표시. 다함께 오목도 여기서 고른 규칙과 판 수를 쓴다 */
function OmokOptions({ onBack }: { onBack: () => void }) {
  const s = useOmokSettings();
  const variant = VARIANT_INFO.find((v) => v.value === s.variant);
  const level = OMOK_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="오목 옵션" onBack={onBack}>
      <Section title="규칙">
        <div className="flex flex-wrap gap-1.5">
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
        <p className="text-xs opacity-60">{variant?.description}</p>
      </Section>
      <Section title="판 수">
        <div className="flex flex-wrap gap-1.5">
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
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
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
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 오목에서 내 돌">
        <div className="flex flex-wrap gap-1.5">
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
        <p className="text-xs opacity-60">여러 판이면 판마다 흑백을 바꾼다</p>
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
      <p className="text-xs opacity-60">
        다함께 오목도 여기서 고른 규칙과 판 수로 방을 엽니다.
      </p>
    </SubScreen>
  );
}

/** 오목 규칙 한눈에 */
function OmokRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "가로·세로·대각선 어느 쪽이든 내 돌 다섯 개를 한 줄로 먼저 이으면 이긴다.",
    ],
    [
      "두기",
      "15줄 판의 줄이 만나는 점에 둔다. 흑이 먼저 두고 한 수씩 번갈아 둔다. 둔 돌은 옮기지 않는다.",
    ],
    [
      "일반 규칙",
      "정확히 다섯이어야 이긴다(여섯 이상은 아니다). 흑백 모두 3·3(한 수로 열린 셋 두 개)에 둘 수 없다.",
    ],
    ["자유 규칙", "다섯 이상이면 이긴다. 금지가 없다."],
    [
      "렌주 규칙",
      "먼저 두는 흑이 유리해서 흑만 3·3, 4·4, 장목(여섯 이상)에 둘 수 없다. 백은 다섯 이상이면 이긴다.",
    ],
    [
      "요령",
      "한 수 두기 전에 ① 내 다섯 ② 상대 넷 막기 ③ 내 열린 넷 ④ 상대 열린 셋 막기를 차례로 살핀다.",
    ],
  ];
  return (
    <SubScreen title="오목은?" onBack={onBack}>
      <dl className="flex flex-col gap-3 text-sm">
        {items.map(([term, meaning]) => (
          <div key={term}>
            <dt className="font-bold text-amber-200">{term}</dt>
            <dd className="leading-relaxed opacity-85">{meaning}</dd>
          </div>
        ))}
      </dl>
    </SubScreen>
  );
}

/** 오목 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function OmokHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: OmokSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useOmokSettings();
  const learned = useOmokTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<OmokSaved | null>(null);
  useEffect(() => setSaved(loadOmok()), []);
  const variant = VARIANT_INFO.find((v) => v.value === s.variant)?.label;
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = OMOK_LEVELS.find((l) => l.value === s.level)?.label;

  return (
    <GameHome
      game="omok"
      theme="omok"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center" aria-hidden="true">
            <span
              className="size-16 rounded-full shadow-[2px_5px_8px_rgba(0,0,0,0.55)]"
              style={{ background: STONE.black }}
            />
            <span
              className="-ml-4 mt-5 size-16 rounded-full shadow-[2px_5px_8px_rgba(0,0,0,0.55)]"
              style={{ background: STONE.white }}
            />
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">오목</h1>
        </>
      }
      tagline="가로·세로·대각선으로 다섯 개를 먼저 잇는 사람이 이긴다"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: (
          <span
            className="inline-block size-6 rounded-full align-middle shadow-[1px_2px_3px_rgba(0,0,0,0.5)]"
            style={{ background: STONE.black }}
          />
        ),
        title: "나홀로 오목",
        detail: `컴퓨터와 · ${variant ?? ""} 규칙 · ${wins ?? ""} · ${level ?? ""}`,
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 오목",
        detail: "링크로 친구를 부릅니다. 서버 없이 바로 이어집니다",
        onClick: onOnline,
      }}
      learn={{
        title: "오목 배우기",
        learned,
        total: OMOK_LESSONS.length,
        firstHint: `처음이라면 여기부터. ${OMOK_LESSONS.length}단원, 미션 4개`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="오목은?"
      onAbout={onRules}
    />
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
  | { kind: "options" }
  | { kind: "rules" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string };

/** 오목(/omok): 첫 화면, 옵션, 규칙, 배우기, 다함께 오목 방, 대국 화면 */
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
  if (screen.kind === "options")
    return <OmokOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <OmokRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <OmokHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
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
