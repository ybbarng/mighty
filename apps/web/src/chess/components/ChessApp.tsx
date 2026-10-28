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
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { chessOnline } from "../online";
import { useChessStudyProgress, useChessTutorialProgress } from "../progress";
import { CHESS_PUZZLE_SETS } from "../puzzles";
import { endChessSession } from "../session";
import {
  CHESS_LEVELS,
  type ChessLevel,
  type ColorPick,
  useChessSettings,
} from "../settings";
import { type ChessSaved, clearChess, loadChess, useChess } from "../store";
import { CHESS_LESSONS } from "../tutorial";
import { PieceIcon } from "./ChessBoard";
import { ChessGame } from "./ChessGame";
import { ChessPuzzleScreen } from "./ChessPuzzleScreen";
import { chessTutorial } from "./chess-tutorial";

/** 체스 화면들의 배경(대국 화면의 짙은 색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: ColorPick; label: string }[] = [
  { value: "white", label: "백(먼저)" },
  { value: "black", label: "흑" },
  { value: "random", label: "무작위" },
];

/**
 * 체스 설정과 배우기 진행은 첫 그리기 뒤에 읽는다(미리 그린 HTML과 첫 화면을 맞춘다).
 * 다른 게임은 공통 StoreHydration이 하지만, 체스는 공통 파일을 건드리지 않으려고 여기서 한다
 */
export function useChessHydration(): void {
  useEffect(() => {
    void useChessSettings.persist.rehydrate();
    void useChessTutorialProgress.persist.rehydrate();
    void useChessStudyProgress.persist.rehydrate();
  }, []);
}

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
    <main
      data-game="chess"
      className={cn("flex min-h-dvh justify-center p-4 text-white", BG)}
    >
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

/** 체스 옵션: 개인 시간·판 수·컴퓨터·내 색·칸 이름. 다함께 체스도 여기서 고른 판 수와 시간을 쓴다 */
function ChessOptions({ onBack }: { onBack: () => void }) {
  const s = useChessSettings();
  const level = CHESS_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="체스 옵션" onBack={onBack}>
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
        <p className="text-xs opacity-60">
          비긴 판은 누구의 승리로도 세지 않는다
        </p>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {CHESS_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as ChessLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 체스에서 내 색">
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
        <p className="text-xs opacity-60">여러 판이면 판마다 백·흑을 바꾼다</p>
      </Section>
      <Section title="칸 이름">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.coordinates}
            onClick={() => s.set({ coordinates: true })}
          >
            보이기(a~h·1~8)
          </Chip>
          <Chip
            active={!s.coordinates}
            onClick={() => s.set({ coordinates: false })}
          >
            숨기기
          </Chip>
        </div>
      </Section>
      <p className="text-xs opacity-60">
        다함께 체스도 여기서 고른 판 수와 시간으로 방을 엽니다.
      </p>
    </SubScreen>
  );
}

/** 체스 규칙 한눈에 */
function ChessRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "상대 킹을 체크메이트(체크를 어떻게 해도 풀 수 없음)하면 이긴다. 백이 먼저 둔다.",
    ],
    ["킹", "어느 방향으로든 한 칸. 상대가 노리는 칸으로는 못 간다."],
    ["퀸", "가로·세로·대각선으로 막힐 때까지."],
    ["룩", "가로·세로로 막힐 때까지."],
    ["비숍", "대각선으로 막힐 때까지."],
    ["나이트", "L 모양(두 칸 + 옆 한 칸). 다른 기물을 뛰어넘는다."],
    [
      "폰",
      "앞으로 한 칸(처음 자리에서는 두 칸까지). 잡을 때는 앞쪽 대각선. 끝줄에 닿으면 퀸·룩·비숍·나이트로 바뀐다.",
    ],
    [
      "캐슬링",
      "킹과 룩이 움직인 적 없고 사이가 비었으면, 킹을 룩 쪽으로 두 칸 옮기고 룩을 킹 옆으로. 체크 중이거나 킹이 지나가는 칸을 상대가 노리면 못 한다.",
    ],
    [
      "앙파상",
      "상대 폰이 두 칸 나와 내 폰 옆에 서면, 바로 다음 수에 지나간 칸으로 가며 잡을 수 있다.",
    ],
    [
      "비김",
      "스테일메이트(체크가 아닌데 둘 수 없음), 50수 동안 폰도 잡기도 없음, 같은 판 세 번, 어느 편도 메이트할 기물이 없음. 시간이 다 돼도 상대가 메이트할 기물이 없으면 비긴다.",
    ],
  ];
  return (
    <SubScreen title="체스는?" onBack={onBack}>
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

/** 체스 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function ChessHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: ChessSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useChessSettings();
  const learned = useChessTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<ChessSaved | null>(null);
  useEffect(() => setSaved(loadChess()), []);
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = CHESS_LEVELS.find((l) => l.value === s.level)?.label;
  const color = PICK_OPTIONS.find((p) => p.value === s.pick)?.label;

  return (
    <GameHome
      game="chess"
      theme="chess"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            <span className="rounded-2xl bg-[#f0d9b5] p-1 shadow-[2px_5px_8px_rgba(0,0,0,0.55)]">
              <PieceIcon piece="wK" className="size-14" />
            </span>
            <span className="mt-5 rounded-2xl bg-[#b58863] p-1 shadow-[2px_5px_8px_rgba(0,0,0,0.55)]">
              <PieceIcon piece="bQ" className="size-14" />
            </span>
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">체스</h1>
        </>
      }
      tagline="킹·퀸·룩·비숍·나이트·폰으로 상대 킹을 체크메이트하라"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "♔︎",
        title: "나홀로 체스",
        detail: ["컴퓨터와", color, wins, timePresetLabel(s.time), level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 체스",
        detail: "링크로 친구를 부릅니다. 서버 없이 바로 이어집니다",
        onClick: onOnline,
      }}
      learn={{
        title: "체스 배우기",
        learned,
        total: CHESS_LESSONS.length,
        firstHint: `처음이라면 여기부터. 기물 움직임부터 ${CHESS_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="체스는?"
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
const STUDY_SETS = CHESS_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 체스(/chess): 첫 화면, 옵션, 규칙, 배우기, 다함께 체스 방, 대국 화면 */
export function ChessApp() {
  useChessHydration();
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useChess((s) => s.view);
  const winsToFinish = useChessSettings((s) => s.winsToFinish);
  const time = useChessSettings((s) => s.time);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useChess.getState().practice)
      clearChess();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("chess");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endChessSession();
    useChess.getState().leave();
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online")
    return (
      <BoardOnlineScreen
        game={chessOnline}
        rules={{ winsToFinish, ...(time !== "none" ? { time } : {}) }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <ChessGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={chessTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
        extra={{
          title: "수 배우기",
          detail: `메이트 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개. 규칙을 익혔다면 여기서 실력을 키워요`,
          onClick: () => setScreen({ kind: "study" }),
        }}
      />
    );
  if (screen.kind === "study")
    return (
      <StudyHome
        title="체스 수 배우기"
        background={BG}
        sets={STUDY_SETS}
        progress={useChessStudyProgress}
        onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
        onBack={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "puzzle")
    return (
      <ChessPuzzleScreen
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
        tutorial={chessTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <ChessOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <ChessRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <ChessHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useChess.getState().resume(saved);
        else {
          const s = useChessSettings.getState();
          useChess.getState().newGame({
            rules: {
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
