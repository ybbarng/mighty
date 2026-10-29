"use client";

import { useEffect, useState } from "react";

import { BoardOnlineScreen } from "@/components/BoardOnlineScreen";
import { GameHome } from "@/components/GameHome";
import {
  TimePresetPicker,
  timePresetLabel,
} from "@/components/TimePresetPicker";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { baseballOnline } from "../online";
import { useBaseballTutorialProgress } from "../progress";
import { endBaseballSession } from "../session";
import {
  BASEBALL_LEVELS,
  type BaseballLevel,
  rulesFromSettings,
  useBaseballSettings,
  WINS_OPTIONS,
} from "../settings";
import {
  type BaseballSaved,
  clearBaseball,
  loadBaseball,
  useBaseball,
} from "../store";
import { BASEBALL_LESSONS } from "../tutorial";
import { BaseballGame } from "./BaseballGame";
import { baseballTutorial } from "./baseball-tutorial";
import { DigitBox, LIGHT } from "./parts";

/** 숫자야구 화면들의 배경(밤 야구장 잔디) */
const BG =
  "bg-[radial-gradient(ellipse_at_top,#14532d_0%,#052e16_55%,#020617_100%)]";

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
      data-game="baseball"
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

/** 숫자야구 옵션. 다함께도 여기서 고른 자릿수·0·공정 규칙·판 수·시간을 쓴다 */
function BaseballOptions({ onBack }: { onBack: () => void }) {
  const s = useBaseballSettings();
  const level = BASEBALL_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="숫자야구 옵션" onBack={onBack}>
      <Section title="혼자 하기">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.soloMode === "duel"}
            onClick={() => s.set({ soloMode: "duel" })}
          >
            서로 맞히기
          </Chip>
          <Chip
            active={s.soloMode === "puzzle"}
            onClick={() => s.set({ soloMode: "puzzle" })}
          >
            컴퓨터 수만 맞히기
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          {s.soloMode === "duel"
            ? "나도 비밀 수를 정하고 컴퓨터와 번갈아 맞힌다"
            : "컴퓨터가 숨긴 수를 몇 번 만에 맞히나 혼자 푼다"}
        </p>
      </Section>
      <Section title="자릿수">
        <div className="flex flex-wrap gap-1.5">
          {([3, 4] as const).map((d) => (
            <Chip
              key={d}
              active={s.digits === d}
              onClick={() => s.set({ digits: d })}
            >
              {d}자리
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="쓰는 숫자">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!s.zero} onClick={() => s.set({ zero: false })}>
            1~9
          </Chip>
          <Chip active={s.zero} onClick={() => s.set({ zero: true })}>
            0~9
          </Chip>
        </div>
      </Section>
      <Section title="공정 규칙">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.fair} onClick={() => s.set({ fair: true })}>
            후공에게 한 번 더
          </Chip>
          <Chip active={!s.fair} onClick={() => s.set({ fair: false })}>
            먼저 맞히면 승
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          {s.fair
            ? "선이 맞히면 후공도 같은 횟수만큼 묻는다. 둘 다 맞히면 비김"
            : "먼저 묻는 쪽이 조금 유리하다"}
        </p>
      </Section>
      <Section title="판 수(서로 맞히기)">
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
      <Section title="개인 시간">
        <TimePresetPicker value={s.time} onChange={(time) => s.set({ time })} />
        <p className="text-xs opacity-60">맞힐 차례에만 시계가 간다</p>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {BASEBALL_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as BaseballLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.showHints}
          onChange={(e) => s.set({ showHints: e.target.checked })}
          className="size-4 accent-amber-300"
        />
        지금까지 답과 맞는 후보 수 보이기
      </label>
      <p className="text-xs opacity-60">
        다함께 숫자야구는 늘 서로 맞히기로, 여기서 고른 규칙으로 방을 엽니다.
      </p>
    </SubScreen>
  );
}

/** 숫자야구 규칙 한눈에 */
function BaseballRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "상대가 숨긴 비밀 수를 먼저 맞히면 이긴다. 비밀 수는 서로 다른 숫자 세 개(또는 네 개)다.",
    ],
    [
      "답",
      "숫자와 자리가 맞으면 스트라이크(S), 숫자만 맞으면 볼(B), 하나도 없으면 아웃. 모든 자리가 맞으면 맞힌 것.",
    ],
    [
      "차례",
      "번갈아 하나씩 묻는다. 첫 판 선은 무작위, 판마다 바꾼다. 같은 수를 두 번 물을 수 없다.",
    ],
    [
      "공정 규칙",
      "선이 맞히면 후공에게 한 번 더 기회를 준다. 같은 횟수에 둘 다 맞히면 비긴다(옵션에서 끈다).",
    ],
    [
      "정직한 답",
      "내 비밀 수는 내 기기에만 있고 방장에게는 잠근 약속만 간다. 답은 내 기기가 세어 낸다. 판 끝에 공개해 모든 답을 다시 계산하고, 거짓이 있으면 그 자리를 짚고 거짓말한 쪽이 진다.",
    ],
    [
      "요령",
      "아웃이 나온 숫자는 지우고, 볼은 자리를 옮겨 보고, 스트라이크는 자리를 지킨다. 후보가 줄면 후보 가운데서 묻는다.",
    ],
  ];
  return (
    <SubScreen title="숫자야구는?" onBack={onBack}>
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

/** 숫자야구 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function BaseballHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: BaseballSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useBaseballSettings();
  const learned = useBaseballTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<BaseballSaved | null>(null);
  useEffect(() => setSaved(loadBaseball()), []);
  const level = BASEBALL_LEVELS.find((l) => l.value === s.level)?.label;
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const puzzle = s.soloMode === "puzzle";

  return (
    <GameHome
      game="baseball"
      theme="baseball"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            {["3", "7", "1"].map((d) => (
              <DigitBox key={d} digit={d} size="lg" />
            ))}
          </div>
          <div
            className="mt-2 flex justify-center gap-3 text-xs"
            aria-hidden="true"
          >
            <span className="flex items-center gap-1">
              <span className={cn("size-2.5 rounded-full", LIGHT.strike)} />S
            </span>
            <span className="flex items-center gap-1">
              <span className={cn("size-2.5 rounded-full", LIGHT.ball)} />B
            </span>
            <span className="flex items-center gap-1">
              <span className={cn("size-2.5 rounded-full", LIGHT.out)} />
              아웃
            </span>
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">숫자야구</h1>
        </>
      }
      tagline="숨긴 수를 묻고, 스트라이크·볼로 좁혀 먼저 맞힌다"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "⚾",
        title: "나홀로 숫자야구",
        detail: [
          puzzle ? "컴퓨터 수만 맞히기" : "컴퓨터와 서로 맞히기",
          `${s.digits}자리`,
          s.zero ? "0~9" : "1~9",
          puzzle ? null : wins,
          timePresetLabel(s.time),
          level,
        ]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 숫자야구",
        detail: "링크로 친구를 부릅니다. 비밀 수는 각자 기기에만 있어요",
        onClick: onOnline,
      }}
      learn={{
        title: "숫자야구 배우기",
        learned,
        total: BASEBALL_LESSONS.length,
        firstHint: `처음이라면 여기부터. ${BASEBALL_LESSONS.length}단원, 미션 4개`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="숫자야구는?"
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

/** 숫자야구(/baseball): 첫 화면, 옵션, 규칙, 배우기, 다함께 방, 대국 화면 */
export function BaseballApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useBaseball((s) => s.view);
  const settings = useBaseballSettings();

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver" && !useBaseball.getState().practice)
      clearBaseball();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("baseball");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endBaseballSession();
    useBaseball.getState().leave();
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
        game={baseballOnline}
        rules={rulesFromSettings(settings, true)}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <BaseballGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={baseballTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={baseballTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <BaseballOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <BaseballRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <BaseballHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useBaseball.getState().resume(saved);
        else {
          const s = useBaseballSettings.getState();
          useBaseball.getState().newGame({
            rules: rulesFromSettings(s),
            level: s.level,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
