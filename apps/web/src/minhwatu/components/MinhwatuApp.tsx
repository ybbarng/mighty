"use client";

import {
  DEAL_SIZES,
  YAK_DESCRIPTIONS,
  YAK_NAMES,
} from "@mighty/minhwatu-engine";
import { useEffect, useState } from "react";

import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { useMinhwatuTutorialProgress } from "../progress";
import { describeRules } from "../rules-text";
import { endMinhwatuSession } from "../session";
import {
  MINHWATU_LEVELS,
  type MinhwatuLevel,
  PLAYER_OPTIONS,
  ROUND_OPTIONS,
  rulesOf,
  useMinhwatuSettings,
} from "../settings";
import {
  clearMinhwatu,
  loadMinhwatu,
  type MinhwatuSaved,
  useMinhwatu,
} from "../store";
import { MINHWATU_LESSONS } from "../tutorial";
import { MinhwatuOnlineScreen } from "./MinhwatuOnlineScreen";
import { MINHWATU_BG, MinhwatuTable } from "./MinhwatuTable";
import { minhwatuTutorial } from "./minhwatu-tutorial";

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
      data-game="minhwatu"
      className={cn(
        "flex min-h-dvh justify-center p-4 text-white",
        MINHWATU_BG,
      )}
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

/** 민화투 옵션: 인원·판 수·약 점수·초단·사오동·컴퓨터. 다함께 민화투도 여기서 고른 규칙을 쓴다 */
function MinhwatuOptions({ onBack }: { onBack: () => void }) {
  const s = useMinhwatuSettings();
  const level = MINHWATU_LEVELS.find((l) => l.value === s.level);
  const deal = DEAL_SIZES[s.players];
  return (
    <SubScreen title="민화투 옵션" onBack={onBack}>
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
          손패 {deal.hand}장, 바닥 {deal.floor}장으로 시작해요. 나 말고는
          컴퓨터가 앉아요
        </p>
      </Section>
      <Section title="판 수">
        <div className="flex flex-wrap gap-1.5">
          {ROUND_OPTIONS.map((r) => (
            <Chip
              key={r.value}
              active={s.rounds === r.value}
              onClick={() => s.set({ rounds: r.value })}
            >
              {r.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">판 점수를 더한 합계로 1등을 가려요</p>
      </Section>
      <Section title="약 점수(초약·풍약·비약)">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.yakScore === 20}
            onClick={() => s.set({ yakScore: 20 })}
          >
            20점
          </Chip>
          <Chip
            active={s.yakScore === 10}
            onClick={() => s.set({ yakScore: 10 })}
          >
            10점
          </Chip>
        </div>
      </Section>
      <Section title="더 치는 약">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.chodan} onClick={() => s.set({ chodan: !s.chodan })}>
            초단 30점
          </Chip>
          <Chip
            active={s.saodong}
            onClick={() => s.set({ saodong: !s.saodong })}
          >
            사오동 40점
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          초단(4·5·7월 띠)은 동네에 따라 안 치기도 하고, 사오동(11월 4장)은 치는
          곳이 적어요
        </p>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {MINHWATU_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as MinhwatuLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <p className="text-xs opacity-60">
        다함께 민화투도 여기서 고른 인원·판 수·약으로 방을 엽니다.
      </p>
    </SubScreen>
  );
}

/** 민화투 규칙 한눈에 */
function MinhwatuRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "같은 달 카드끼리 짝을 맞춰 먹고, 먹은 카드 점수와 약으로 남보다 많은 점수를 낸다. 고·스톱도 뻑도 없다.",
    ],
    [
      "나누기",
      "48장(12달 × 4장). 3명이면 손패 7장·바닥 6장, 2명이면 10장·8장, 4명이면 5장·8장. 남은 카드는 더미로 엎어 둔다. 바닥에 같은 달 4장이 깔리면 다시 섞는다.",
    ],
    [
      "한 차례",
      "손패 한 장을 낸다. 바닥에 같은 달이 있으면 둘을 먹고, 없으면 바닥에 놓인다. 그다음 더미에서 한 장 뒤집어 똑같이 맞춘다.",
    ],
    [
      "같은 달이 여럿",
      "바닥에 같은 달이 둘이면 하나를 골라 먹고, 셋이면 넷을 다 먹는다. 뒤집은 카드가 방금 낸 카드와 같은 달이면 바닥에 남는다.",
    ],
    [
      "카드 점수",
      "광 20점, 열끗 10점, 띠 5점, 피(쌍피 포함) 0점. 모두 더하면 240점이다.",
    ],
    [
      "약",
      [
        `${YAK_NAMES.choyak}(${YAK_DESCRIPTIONS.choyak})·${YAK_NAMES.pungyak}(${YAK_DESCRIPTIONS.pungyak})·${YAK_NAMES.biyak}(${YAK_DESCRIPTIONS.biyak}) 20점(옵션 10점)`,
        `${YAK_NAMES.hongdan}(${YAK_DESCRIPTIONS.hongdan})·${YAK_NAMES.cheongdan}(${YAK_DESCRIPTIONS.cheongdan})·${YAK_NAMES.chodan}(${YAK_DESCRIPTIONS.chodan}) 30점`,
        `옵션: ${YAK_NAMES.saodong}(${YAK_DESCRIPTIONS.saodong}) 40점. 약을 이루면 나머지 사람 모두에게서 그 점수를 받는다.`,
      ].join(". "),
    ],
    [
      "판 점수",
      "먹은 카드 점수 + 약으로 받은 점수 − 약으로 준 점수 − 본(240 ÷ 인원: 3명이면 80). 그래서 판 점수를 모두 더하면 0이다.",
    ],
    [
      "선과 판 수",
      "첫 판 선은 무작위, 그 뒤로는 앞 판 1등이 선이다. 정한 판 수만큼 치고 합계가 가장 높은 사람이 이긴다.",
    ],
  ];
  return (
    <SubScreen title="민화투는?" onBack={onBack}>
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

/** 민화투 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function MinhwatuHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: MinhwatuSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useMinhwatuSettings();
  const learned = useMinhwatuTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<MinhwatuSaved | null>(null);
  useEffect(() => setSaved(loadMinhwatu()), []);
  const level = MINHWATU_LEVELS.find((l) => l.value === s.level)?.label;

  return (
    <GameHome
      game="minhwatu"
      theme="minhwatu"
      background={MINHWATU_BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center" aria-hidden="true">
            <span className="-rotate-12 translate-y-2">
              <HwatuCardView id="01g" width={58} />
            </span>
            <span className="z-10 -mx-3">
              <HwatuCardView id="08g" width={58} />
            </span>
            <span className="translate-y-2 rotate-12">
              <HwatuCardView id="03g" width={58} />
            </span>
          </div>
          <h1 className="mt-3 font-black text-4xl tracking-wide">민화투</h1>
        </>
      }
      tagline="같은 달끼리 짝을 맞춰 먹고, 약으로 점수를 뺏어라"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🎴",
        title: "나홀로 민화투",
        detail: [`컴퓨터(${level})와`, describeRules(rulesOf(s))].join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 민화투",
        detail: "링크로 친구를 부릅니다. 빈자리는 컴퓨터가 채워요",
        onClick: onOnline,
      }}
      learn={{
        title: "민화투 배우기",
        learned,
        total: MINHWATU_LESSONS.length,
        firstHint: `처음이라면 여기부터. 짝 맞추기부터 ${MINHWATU_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="민화투는?"
      onAbout={onRules}
    />
  );
}

type Screen =
  | { kind: "start" }
  | {
      kind: "online";
      room: string | null;
      resume?: { room: string; restore: HostRestore };
    }
  | { kind: "playing" }
  | { kind: "options" }
  | { kind: "rules" }
  | { kind: "tutorial" }
  | { kind: "lesson"; lessonId: string };

/** 주소의 `?seed=`(화면 시험이 같은 판을 다시 칠 때) */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const seed = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : undefined;
}

/** 민화투(/minhwatu): 첫 화면, 옵션, 규칙, 배우기, 다함께 민화투 방, 대국 화면 */
export function MinhwatuApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useMinhwatu((s) => s.view);
  const settings = useMinhwatuSettings();

  // 저장한 설정과 배우기 진행을 첫 그리기 뒤에 불러온다(합칠 때 StoreHydration으로 옮긴다).
  useEffect(() => {
    void useMinhwatuSettings.persist.rehydrate();
    void useMinhwatuTutorialProgress.persist.rehydrate();
  }, []);

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver" && !useMinhwatu.getState().practice)
      clearMinhwatu();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("minhwatu");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endMinhwatuSession();
    useMinhwatu.getState().leave();
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online")
    return (
      <MinhwatuOnlineScreen
        rules={rulesOf(settings)}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <MinhwatuTable onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={minhwatuTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={minhwatuTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <MinhwatuOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <MinhwatuRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <MinhwatuHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useMinhwatu.getState().resume(saved);
        else {
          const s = useMinhwatuSettings.getState();
          const seed = seedFromUrl();
          useMinhwatu.getState().newGame({
            rules: rulesOf(s),
            level: s.level,
            ...(seed !== undefined ? { seed } : {}),
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
