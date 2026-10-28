"use client";

import { useEffect, useState } from "react";

import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { useGostopTutorialProgress } from "../progress";
import { endGostopSession } from "../session";
import {
  GOSTOP_LEVELS,
  type GostopLevel,
  GUKJIN_INFO,
  gostopRulesOf,
  PLAYER_OPTIONS,
  ROUND_OPTIONS,
  useGostopSettings,
} from "../settings";
import { clearGostop, type GostopSaved, loadGostop, useGostop } from "../store";
import { GOSTOP_LESSONS } from "../tutorial";
import { GostopOnlineScreen } from "./GostopOnlineScreen";
import { GostopTable } from "./GostopTable";
import { gostopTutorial } from "./gostop-tutorial";

/** 고스톱 화면들의 배경(초록 담요) */
const BG = "bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_80%)]";

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

/** 고스톱 옵션: 인원·판 수·국진·컴퓨터. 다함께 고스톱도 여기서 고른 규칙을 쓴다 */
function GostopOptions({ onBack }: { onBack: () => void }) {
  const s = useGostopSettings();
  const gukjin = GUKJIN_INFO.find((g) => g.value === s.gukjin);
  const level = GOSTOP_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="고스톱 옵션" onBack={onBack}>
      <Section title="인원">
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_OPTIONS.map((p) => (
            <Chip
              key={p.value}
              active={s.players === p.value}
              onClick={() => s.set({ players: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          맞고는 10장씩·바닥 8장, 7점부터 고. 셋은 7장씩·바닥 6장, 3점부터 고.
        </p>
      </Section>
      <Section title="판 수">
        <div className="flex flex-wrap gap-1.5">
          {ROUND_OPTIONS.map((r) => (
            <Chip
              key={r}
              active={s.rounds === r}
              onClick={() => s.set({ rounds: r })}
            >
              {r}판
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          정한 판 수를 치면 점수 합이 가장 많은 사람이 이긴다.
        </p>
      </Section>
      <Section title="국진(9월 열끗)">
        <div className="flex flex-wrap gap-1.5">
          {GUKJIN_INFO.map((g) => (
            <Chip
              key={g.value}
              active={s.gukjin === g.value}
              onClick={() => s.set({ gukjin: g.value })}
            >
              {g.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{gukjin?.description}</p>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {GOSTOP_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as GostopLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <p className="text-xs opacity-60">
        다함께 고스톱도 여기서 고른 인원·판 수·국진 규칙으로 방을 엽니다.
        빈자리는 컴퓨터(중수)가 앉습니다.
      </p>
    </SubScreen>
  );
}

/** 고스톱 규칙 한눈에 */
function GostopRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "같은 달 카드를 짝 맞춰 먹어 점수를 낸다. 맞고 7점, 셋은 3점이 나면 고(계속) 또는 스톱(이김)을 고른다.",
    ],
    [
      "한 차례",
      "손패 한 장을 내 같은 달 바닥 카드를 먹고, 더미를 뒤집어 또 짝을 맞춘다. 같은 달이 둘이면 골라 먹는다.",
    ],
    ["광", "3광 3점(비광이 섞이면 2점), 4광 4점, 5광 15점."],
    ["열끗·띠", "5장 1점, 한 장마다 +1. 고도리(새 셋) 5점."],
    ["단", "홍단(1·2·3월)·청단(6·9·10월)·초단(4·5·7월) 각 3점."],
    ["피", "10장 1점, 한 장마다 +1. 쌍피는 두 장."],
    [
      "뻑·쪽·따닥·싹쓸이",
      "뻑은 석 장이 바닥에 남고, 넷째로 먹으면 피 한 장씩(자뻑은 두 장). 쪽·따닥·싹쓸이는 상대마다 피 한 장.",
    ],
    [
      "흔들기·폭탄·총통",
      "같은 달 석 장을 보이며 내면 두 배(흔들기), 바닥에 한 장이 있으면 석 장을 한꺼번에(폭탄, 두 배·피 한 장). 처음 패가 같은 달 넉 장이면 총통 10점.",
    ],
    [
      "고",
      "1고 +1, 2고 +2, 3고부터 +3에 두 배씩. 고를 부른 뒤에는 점수가 더 나야 다시 묻는다.",
    ],
    [
      "박",
      "피박(진 사람 피 5장 미만)·광박(광 없음)·멍박(이긴 사람 열끗 7장 이상)·고박(고 부르고 짐)은 두 배씩. 셋이면 고박은 진 사람 몫을 혼자 낸다.",
    ],
    ["나가리", "아무도 못 나면 다음 판 점수가 두 배."],
  ];
  return (
    <SubScreen title="고스톱은?" onBack={onBack}>
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

/** 고스톱 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function GostopHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: GostopSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useGostopSettings();
  const learned = useGostopTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<GostopSaved | null>(null);
  useEffect(() => setSaved(loadGostop()), []);
  const level = GOSTOP_LEVELS.find((l) => l.value === s.level)?.label;
  const mode = s.players === 2 ? "맞고" : "셋이서";

  return (
    <GameHome
      game="gostop"
      theme="gostop"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center" aria-hidden="true">
            {["01g", "08g", "12g"].map((id, i) => (
              <span
                key={id}
                className="-mx-1"
                style={{ transform: `rotate(${(i - 1) * 12}deg)` }}
              >
                <HwatuCardView id={id} width={58} />
              </span>
            ))}
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">고스톱</h1>
        </>
      }
      tagline="짝 맞춰 먹고, 고? 스톱?"
      {...(saved
        ? {
            resume: () => {
              try {
                onStart(saved);
              } catch {
                clearGostop();
                setSaved(null);
              }
            },
          }
        : {})}
      solo={{
        icon: "🎴",
        title: "나홀로 고스톱",
        detail: [`컴퓨터와 ${mode}`, `${s.rounds}판`, level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 고스톱",
        detail: "링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다",
        onClick: onOnline,
      }}
      learn={{
        title: "고스톱 배우기",
        learned,
        total: GOSTOP_LESSONS.length,
        firstHint: `처음이라면 여기부터. 짝 맞추기부터 ${GOSTOP_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="고스톱은?"
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

/** 고스톱(/gostop): 첫 화면, 옵션, 규칙, 배우기, 다함께 고스톱 방, 대국 화면 */
export function GostopApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useGostop((s) => s.view);
  const players = useGostopSettings((s) => s.players);
  const rounds = useGostopSettings((s) => s.rounds);
  const gukjin = useGostopSettings((s) => s.gukjin);

  // 저장한 설정·배우기 진행을 첫 그리기 뒤에 읽는다(합칠 때 StoreHydration으로 옮긴다, docs/28 7절).
  useEffect(() => {
    void useGostopSettings.persist.rehydrate();
    void useGostopTutorialProgress.persist.rehydrate();
  }, []);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useGostop.getState().practice)
      clearGostop();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("gostop");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endGostopSession();
    useGostop.getState().leave();
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online")
    return (
      <GostopOnlineScreen
        rules={gostopRulesOf({ players, rounds, gukjin })}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <GostopTable onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={gostopTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={gostopTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <GostopOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <GostopRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <GostopHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useGostop.getState().resume(saved);
        else {
          const s = useGostopSettings.getState();
          const seed = Number(
            new URLSearchParams(window.location.search).get("seed"),
          );
          useGostop.getState().newGame({
            rules: gostopRulesOf(s),
            level: s.level,
            ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
