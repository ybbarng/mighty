"use client";

import { useEffect, useState } from "react";
import { BoardOnlineScreen } from "@/components/BoardOnlineScreen";
import { GameHome } from "@/components/GameHome";
import { StudyHome } from "@/components/study/StudyHome";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { badukOnline } from "../online";
import { useBadukStudyProgress, useBadukTutorialProgress } from "../progress";
import { BADUK_PUZZLE_SETS } from "../puzzles";
import { endBadukSession } from "../session";
import {
  BADUK_LEVELS,
  type BadukLevel,
  SIZE_INFO,
  type StonePick,
  useBadukSettings,
} from "../settings";
import { type BadukSaved, clearBaduk, loadBaduk, useBaduk } from "../store";
import { BADUK_LESSONS } from "../tutorial";
import { BadukGame, StoneDot } from "./BadukGame";
import { BadukPuzzleScreen } from "./BadukPuzzleScreen";
import { badukTutorial } from "./baduk-tutorial";

/** 바둑 화면들의 배경(대국 화면의 짙은 색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#57534e_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: StonePick; label: string }[] = [
  { value: "black", label: "흑(먼저)" },
  { value: "white", label: "백" },
  { value: "random", label: "무작위" },
];

const KOMI_OPTIONS = [
  { value: 7.5, label: "덤 7.5" },
  { value: 6.5, label: "덤 6.5" },
] as const;

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

/** 바둑 옵션: 판 크기·덤·개인 시간·판 수·컴퓨터·내 돌. 다함께 바둑도 여기서 고른 규칙을 쓴다 */
function BadukOptions({ onBack }: { onBack: () => void }) {
  const s = useBadukSettings();
  const size = SIZE_INFO.find((b) => b.value === s.size);
  const level = BADUK_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="바둑 옵션" onBack={onBack}>
      <Section title="판 크기">
        <div className="flex flex-wrap gap-1.5">
          {SIZE_INFO.map((b) => (
            <Chip
              key={b.value}
              active={s.size === b.value}
              onClick={() => s.set({ size: b.value })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{size?.description}</p>
      </Section>
      <Section title="덤">
        <div className="flex flex-wrap gap-1.5">
          {KOMI_OPTIONS.map((k) => (
            <Chip
              key={k.value}
              active={s.komi === k.value}
              onClick={() => s.set({ komi: k.value })}
            >
              {k.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          흑이 먼저 두는 대신 백이 더 받는 점수. 0.5가 붙어 비기지 않는다
        </p>
      </Section>
      <Section title="개인 시간">
        <TimePresetPicker value={s.time} onChange={(time) => s.set({ time })} />
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
          {BADUK_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as BadukLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 바둑에서 내 돌">
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
      <p className="text-xs opacity-60">
        다함께 바둑도 여기서 고른 판 크기·덤·판 수·시간으로 방을 엽니다.
      </p>
    </SubScreen>
  );
}

/** 바둑 규칙 한눈에 */
function BadukRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "판을 더 넓게 차지하면 이긴다. 흑이 먼저 두고, 줄이 만나는 점에 돌을 하나씩 번갈아 놓는다.",
    ],
    [
      "따내기",
      "돌 위·아래·왼쪽·오른쪽 빈 점이 활로다. 상대가 활로를 모두 막으면 그 돌(이어진 무리)은 들려 나간다.",
    ],
    [
      "자살수",
      "놓자마자 활로가 없는 자리에는 둘 수 없다. 그 수로 상대 돌을 따내면 둘 수 있다.",
    ],
    [
      "패",
      "판 모양을 이번 판에 나왔던 모양으로 되돌리는 수는 둘 수 없다. 패를 따내면 상대는 다른 곳에 한 수 둔 뒤에 되따낸다.",
    ],
    [
      "끝",
      "둘 곳이 없으면 쉰다. 두 사람이 이어서 쉬면 판이 끝난다. 기권해도 끝난다.",
    ],
    [
      "세기",
      "판 위 내 돌 수 + 내 돌로만 둘러싼 빈 점 수. 백은 덤(7.5 또는 6.5)을 더한다. 흑백 모두에 닿은 빈 점은 누구 것도 아니다.",
    ],
    [
      "죽은 돌",
      "판 위에 놓인 그대로 센다. 끝내기 전에 내 집 안의 죽은 돌은 따내야 한다. 그대로 쉬면 그 둘레는 내 집으로 세지 않는다.",
    ],
  ];
  return (
    <SubScreen title="바둑은?" onBack={onBack}>
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

/** 바둑 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function BadukHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: BadukSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useBadukSettings();
  const learned = useBadukTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<BadukSaved | null>(null);
  useEffect(() => setSaved(loadBaduk()), []);
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = BADUK_LEVELS.find((l) => l.value === s.level)?.label;
  const side = PICK_OPTIONS.find((p) => p.value === s.pick)?.label;

  return (
    <GameHome
      game="baduk"
      theme="baduk"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            <StoneDot black className="size-14" />
            <StoneDot black={false} className="mt-5 size-14" />
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">바둑</h1>
        </>
      }
      tagline="돌을 번갈아 놓아 더 넓게 차지하라"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "⚫",
        title: "나홀로 바둑",
        detail: [
          "컴퓨터와",
          `${s.size}줄`,
          side,
          wins,
          timePresetLabel(s.time),
          level,
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 바둑",
        detail: "링크로 친구를 부릅니다. 서버 없이 바로 이어집니다",
        onClick: onOnline,
      }}
      learn={{
        title: "바둑 배우기",
        learned,
        total: BADUK_LESSONS.length,
        firstHint: `처음이라면 여기부터. 돌 놓기부터 ${BADUK_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="바둑은?"
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
  | { kind: "lesson"; lessonId: string }
  | { kind: "study" }
  | { kind: "puzzle"; puzzleId: string };

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = BADUK_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 바둑(/baduk): 첫 화면, 옵션, 규칙, 배우기, 다함께 바둑 방, 대국 화면 */
export function BadukApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endBadukSession();
    useBaduk.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial", "study"] },
  );
  const view = useBaduk((s) => s.view);
  const size = useBadukSettings((s) => s.size);
  const komi = useBadukSettings((s) => s.komi);
  const winsToFinish = useBadukSettings((s) => s.winsToFinish);
  const time = useBadukSettings((s) => s.time);

  // 저장한 설정과 배우기 진행을 첫 그리기 뒤에 읽는다(다른 게임은 StoreHydration이 맡는다).
  useEffect(() => {
    void useBadukSettings.persist.rehydrate();
    void useBadukTutorialProgress.persist.rehydrate();
    void useBadukStudyProgress.persist.rehydrate();
  }, []);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useBaduk.getState().practice)
      clearBaduk();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("baduk");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  if (screen.kind === "online")
    return (
      <BoardOnlineScreen
        game={badukOnline}
        rules={{
          size,
          komi,
          winsToFinish,
          ...(time !== "none" ? { time } : {}),
        }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <BadukGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={badukTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
        extra={{
          title: "수 배우기",
          detail: `잡기·사활 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개. 규칙을 익혔다면 여기서 실력을 키워요`,
          onClick: () => setScreen({ kind: "study" }),
        }}
      />
    );
  if (screen.kind === "study")
    return (
      <StudyHome
        title="바둑 수 배우기"
        background={BG}
        sets={STUDY_SETS}
        progress={useBadukStudyProgress}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
        onBack={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "puzzle")
    return (
      <BadukPuzzleScreen
        key={screen.puzzleId}
        puzzleId={screen.puzzleId}
        onExit={() => setScreen({ kind: "study" })}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={badukTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <BadukOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <BadukRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <BadukHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useBaduk.getState().resume(saved);
        else {
          const s = useBadukSettings.getState();
          useBaduk.getState().newGame({
            rules: {
              size: s.size,
              komi: s.komi,
              winsToFinish: s.winsToFinish,
              ...(s.time !== "none" ? { time: s.time } : {}),
            },
            level: s.level,
            pick: s.pick,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
