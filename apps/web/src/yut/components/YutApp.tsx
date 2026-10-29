"use client";

import { useEffect, useState } from "react";

import { BoardOnlineScreen } from "@/components/BoardOnlineScreen";
import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { YutIconArt } from "../icon-art";
import { yutOnline, yutRulesSummary } from "../online";
import { useYutTutorialProgress } from "../progress";
import { endYutSession } from "../session";
import {
  rulesFromSettings,
  useYutSettings,
  YUT_LEVELS,
  YUT_LINEUPS,
  type YutLevel,
} from "../settings";
import { clearYut, loadYut, useYut, type YutSaved } from "../store";
import { YUT_LESSONS } from "../tutorial";
import { YUT_BG, YutGame } from "./YutGame";
import { yutTutorial } from "./yut-tutorial";

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
      data-game="yut"
      className={cn("flex min-h-dvh justify-center p-4 text-white", YUT_BG)}
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

/** 윷놀이 옵션. 다함께도 여기서 고른 판 짜기·규칙을 쓴다(빈자리는 컴퓨터) */
function YutOptions({ onBack }: { onBack: () => void }) {
  const s = useYutSettings();
  const lineup = YUT_LINEUPS.find((l) => l.value === s.lineup);
  const level = YUT_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="윷놀이 옵션" onBack={onBack}>
      <Section title="판 짜기">
        <div className="flex flex-wrap gap-1.5">
          {YUT_LINEUPS.map((l) => (
            <Chip
              key={l.value}
              active={s.lineup === l.value}
              onClick={() => s.set({ lineup: l.value })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{lineup?.description}</p>
      </Section>
      <Section title="말 수">
        <div className="flex flex-wrap gap-1.5">
          {[2, 3, 4, 5].map((n) => (
            <Chip
              key={n}
              active={s.pieces === n}
              onClick={() => s.set({ pieces: n })}
            >
              {n}개
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="빽도">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={s.backDo} onClick={() => s.set({ backDo: true })}>
            있음
          </Chip>
          <Chip active={!s.backDo} onClick={() => s.set({ backDo: false })}>
            없음
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          표시한 가락 하나만 배가 위면 빽도, 한 칸 뒤로 간다
        </p>
      </Section>
      <Section title="던지기 확률">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={s.flatPercent === 60}
            onClick={() => s.set({ flatPercent: 60 })}
          >
            실제 윷처럼
          </Chip>
          <Chip
            active={s.flatPercent === 50}
            onClick={() => s.set({ flatPercent: 50 })}
          >
            고르게
          </Chip>
        </div>
        <p className="text-xs opacity-60">
          {s.flatPercent === 60
            ? "가락마다 배가 위로 올 확률 60%: 개·걸이 잦고 모는 드물다(2.6%)"
            : "가락마다 반반: 모가 6.3%로 늘어난다"}
        </p>
      </Section>
      <Section title="참먹이">
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!s.landOnHome}
            onClick={() => s.set({ landOnHome: false })}
          >
            지나야 남
          </Chip>
          <Chip
            active={s.landOnHome}
            onClick={() => s.set({ landOnHome: true })}
          >
            서도 남
          </Chip>
        </div>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {YUT_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as YutLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <p className="text-xs opacity-60">
        다함께 윷놀이도 여기서 고른 규칙으로 방을 엽니다. 빈자리는 컴퓨터가
        맡습니다.
      </p>
    </SubScreen>
  );
}

/** 윷놀이 규칙 한눈에 */
function YutRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "내 말을 모두 판을 한 바퀴 돌려 참먹이 밖으로 먼저 내보내면 이긴다.",
    ],
    [
      "윷",
      "윷가락 넷을 던져 배(평평한 면)가 하나면 도(1칸), 둘이면 개(2칸), 셋이면 걸(3칸), 넷이면 윷(4칸), 하나도 없으면 모(5칸). 표시한 가락 하나만 배면 빽도(1칸 뒤로).",
    ],
    [
      "한 번 더",
      "윷·모가 나오거나 상대 말을 잡으면 한 번 더 던진다. 나온 결과는 모아 두었다가 원하는 말에 나눠 쓴다.",
    ],
    [
      "지름길",
      "모·뒷모 자리나 가운데 방에 멈춘 말은 다음에 대각선 지름길로 간다. 지나가기만 하면 원래 길로 간다.",
    ],
    [
      "업기·잡기",
      "내 말이 있는 자리에 서면 업혀 함께 움직인다. 상대 말이 있는 자리에 서면 잡아서(업힌 말까지) 처음으로 돌려보낸다.",
    ],
    [
      "공정한 던지기",
      "던지기 결과는 판 처음에 모두의 기기가 약속한 해시 사슬에서 한 고리씩 꺼내 섞어 정한다. 방장도 결과를 고르거나 미리 알 수 없고, 판 끝에 기록 전체를 다시 계산해 확인한다.",
    ],
  ];
  return (
    <SubScreen title="윷놀이는?" onBack={onBack}>
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

/** 윷놀이 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function YutHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: YutSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useYutSettings();
  const learned = useYutTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<YutSaved | null>(null);
  useEffect(() => setSaved(loadYut()), []);
  const level = YUT_LEVELS.find((l) => l.value === s.level)?.label;
  const rules = rulesFromSettings(s);

  return (
    <GameHome
      game="yut"
      theme="yut"
      background={YUT_BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div aria-hidden="true" className="mx-auto size-24 drop-shadow-xl">
            <YutIconArt />
          </div>
          <h1 className="mt-3 font-black text-4xl tracking-wide drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
            윷놀이
          </h1>
        </>
      }
      tagline="윷가락을 던져 말을 몰고, 업고, 잡는다"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🪵",
        title: "나홀로 윷놀이",
        detail: [yutRulesSummary(rules), `컴퓨터 ${level ?? ""}`]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 윷놀이",
        detail: "링크로 친구를 부릅니다. 던지기는 모두의 기기가 함께 정해요",
        onClick: onOnline,
      }}
      learn={{
        title: "윷놀이 배우기",
        learned,
        total: YUT_LESSONS.length,
        firstHint: `처음이라면 여기부터. ${YUT_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="윷놀이는?"
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

/** 윷놀이(/yut): 첫 화면, 옵션, 규칙, 배우기, 다함께 방, 대국 화면 */
export function YutApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useYut((s) => s.view);
  const settings = useYutSettings();

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver" && !useYut.getState().practice) clearYut();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("yut");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endYutSession();
    useYut.getState().leave();
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
        game={yutOnline}
        rules={rulesFromSettings(settings)}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <YutGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={yutTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={yutTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <YutOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <YutRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <YutHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useYut.getState().resume(saved);
        else {
          const s = useYutSettings.getState();
          useYut.getState().newGame({
            rules: rulesFromSettings(s),
            level: s.level,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
