"use client";

import {
  BAGAJI_OPTIONS,
  CALL_SECONDS_OPTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type NyrongppongRules,
  ROUND_OPTIONS,
  STOP_OPTIONS,
  YAK_INFO,
  YAK_NAMES,
} from "@mighty/nyrongppong-engine";
import { useEffect, useState } from "react";
import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useScreenHistory } from "@/game/screen-history";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { useNyrongppongTutorialProgress } from "../progress";
import { endNyrongppongSession } from "../session";
import {
  NYRONGPPONG_LEVELS,
  type NyrongppongLevel,
  rulesOf,
  useNyrongppongSettings,
} from "../settings";
import {
  clearNyrongppong,
  loadNyrongppong,
  type NyrongppongSaved,
  useNyrongppong,
} from "../store";
import { NYRONGPPONG_LESSONS } from "../tutorial";
import { NYRONGPPONG_BG, NyrongppongGame } from "./NyrongppongGame";
import { NyrongppongOnlineScreen } from "./NyrongppongOnlineScreen";
import { nyrongppongTutorial } from "./nyrongppong-tutorial";

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
      className={cn(
        "flex min-h-dvh justify-center p-4 text-white",
        NYRONGPPONG_BG,
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

const PLAYER_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);

/** 나이롱뽕 옵션: 인원·판 수·스톱·바가지·뽕 응답 시간·컴퓨터. 다함께 나이롱뽕도 여기서 고른 규칙을 쓴다 */
function NyrongppongOptions({ onBack }: { onBack: () => void }) {
  const s = useNyrongppongSettings();
  const level = NYRONGPPONG_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="나이롱뽕 옵션" onBack={onBack}>
      <Section title="인원">
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_OPTIONS.map((p) => (
            <Chip
              key={p}
              active={s.players === p}
              onClick={() => s.set({ players: p })}
            >
              {p}명
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          나홀로 나이롱뽕은 나머지 자리에 컴퓨터가 앉습니다
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
      </Section>
      <Section title="스톱">
        <div className="flex flex-wrap gap-1.5">
          {STOP_OPTIONS.map((v) => (
            <Chip
              key={v}
              active={s.stopLimit === v}
              onClick={() => s.set({ stopLimit: v })}
            >
              {v === 0 ? "스톱 없음" : `합 ${v} 이하`}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          뽕을 한 번 한 뒤 손패 합이 이 값 이하면 가져오기 전에 스톱할 수 있다.
          가장 낮지 않으면 바가지 +30
        </p>
      </Section>
      <Section title="뽕 바가지">
        <div className="flex flex-wrap gap-1.5">
          {BAGAJI_OPTIONS.map((v) => (
            <Chip
              key={v}
              active={s.bagaji === v}
              onClick={() => s.set({ bagaji: v })}
            >
              +{v}점
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">
          내가 버린 패로 남이 뽕해 손패를 다 털면(박) 받는 벌점
        </p>
      </Section>
      <Section title="뽕 응답 시간">
        <div className="flex flex-wrap gap-1.5">
          {CALL_SECONDS_OPTIONS.map((v) => (
            <Chip
              key={v}
              active={s.callSeconds === v}
              onClick={() => s.set({ callSeconds: v })}
            >
              {v}초
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="컴퓨터 실력">
        <div className="flex flex-wrap gap-1.5">
          {NYRONGPPONG_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as NyrongppongLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
    </SubScreen>
  );
}

/** 나이롱뽕 규칙 한눈에 */
function NyrongppongRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "판이 끝날 때 손에 남은 카드의 달 숫자 합이 벌점이다. 정한 판 수를 마치고 합계가 가장 낮은 사람이 이긴다.",
    ],
    [
      "나누기",
      "모두 다섯 장. 선은 여섯 장을 받아 첫 차례에 가져오지 않고 한 장 버린다. 선은 판마다 다음 사람으로 넘어간다.",
    ],
    ["차례", "더미에서 한 장 가져와 한 장 버린다. 차례는 자리 순서로 돈다."],
    [
      "뽕",
      '남이 버린 카드와 같은 달 두 장이 있으면 "뽕!". 그 세 장을 내려놓고 한 장 더 버린다. 사이 사람들은 차례를 건너뛰고 뽕한 사람 다음부터 이어진다.',
    ],
    [
      "박(털기)",
      "뽕한 뒤 남은 두 장이 짝이고 누가 그 달을 버려 뽕하면 손패를 다 털어 0점. 그 카드를 버린 사람은 바가지를 쓴다.",
    ],
    [
      "스톱",
      "뽕을 한 번 한 뒤 손패 합이 스톱 한도 이하면 가져오기 전에 스톱. 가장 낮으면 0점, 아니면 바가지 +30.",
    ],
    [
      "약",
      "가져온 뒤 여섯 장이 약이면 내고 판을 끝낸다. 약을 낸 사람은 약 점수, 나머지는 손패 합.",
    ],
    ["자연뽕", "같은 달 석 장을 들고 있으면 그 석 장은 손패 합에 세지 않는다."],
    ["더미 끝", "더미가 떨어지면 모두 손패 합을 받는다."],
  ];
  return (
    <SubScreen title="나이롱뽕은?" onBack={onBack}>
      <dl className="flex flex-col gap-3 text-sm">
        {items.map(([term, meaning]) => (
          <div key={term}>
            <dt className="font-bold text-amber-200">{term}</dt>
            <dd className="leading-relaxed opacity-85">{meaning}</dd>
          </div>
        ))}
        <div>
          <dt className="font-bold text-amber-200">약(여섯 장)</dt>
          <dd>
            <ul className="list-inside list-disc leading-relaxed opacity-85">
              {YAK_INFO.map((y) => (
                <li key={y.kind}>
                  {YAK_NAMES[y.kind]}: {y.text}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </SubScreen>
  );
}

/** 나이롱뽕 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function NyrongppongHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: NyrongppongSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useNyrongppongSettings();
  const learned = useNyrongppongTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<NyrongppongSaved | null>(null);
  useEffect(() => setSaved(loadNyrongppong()), []);
  const level = NYRONGPPONG_LEVELS.find((l) => l.value === s.level)?.label;
  return (
    <GameHome
      game="nyrongppong"
      theme="nyrongppong"
      background={NYRONGPPONG_BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center -space-x-4" aria-hidden="true">
            <HwatuCardView id="03g" width={56} className="-rotate-12" />
            <HwatuCardView
              id="03r"
              width={56}
              className="z-10 -translate-y-2"
            />
            <HwatuCardView id="03p" width={56} className="rotate-12" />
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">나이롱뽕</h1>
        </>
      }
      tagline="같은 달 두 장이면 뽕! 손패를 가장 작게 줄여라"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "🎴",
        title: "나홀로 나이롱뽕",
        detail: [`컴퓨터 ${s.players - 1}명과`, `${s.rounds}판`, level]
          .filter(Boolean)
          .join(" · "),
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 나이롱뽕",
        detail: "링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다",
        onClick: onOnline,
      }}
      learn={{
        title: "나이롱뽕 배우기",
        learned,
        total: NYRONGPPONG_LESSONS.length,
        firstHint: `처음이라면 여기부터. 버리기부터 뽕까지 ${NYRONGPPONG_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="나이롱뽕은?"
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

/** 나이롱뽕(/nyrongppong): 첫 화면, 옵션, 규칙, 배우기, 다함께 방, 대국 화면 */
export function NyrongppongApp() {
  // 판·방을 떠날 때(나가기 단추든 뒤로가기든) 하는 정리
  function leavePlay() {
    endNyrongppongSession();
    useNyrongppong.getState().leave();
  }
  // 화면마다 브라우저 기록에 남겨 뒤로가기가 바로 전 화면으로 간다(game/screen-history)
  const [screen, setScreen] = useScreenHistory<Screen>(
    { kind: "start" },
    { leavePlay, restorable: ["options", "rules", "tutorial"] },
  );
  const view = useNyrongppong((s) => s.view);
  const settings = useNyrongppongSettings();
  const rules: NyrongppongRules = rulesOf(settings);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useNyrongppong.getState().practice)
      clearNyrongppong();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("nyrongppong");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, [setScreen]);

  const backToStart = () => setScreen({ kind: "start" });

  if (screen.kind === "online")
    return (
      <NyrongppongOnlineScreen
        rules={rules}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing")
    return <NyrongppongGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={nyrongppongTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={nyrongppongTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <NyrongppongOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return (
      <NyrongppongRulesScreen onBack={() => setScreen({ kind: "start" })} />
    );
  return (
    <NyrongppongHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) {
          try {
            useNyrongppong.getState().resume(saved);
          } catch {
            clearNyrongppong();
            return;
          }
        } else {
          const s = useNyrongppongSettings.getState();
          const seed = Number(
            new URLSearchParams(window.location.search).get("seed"),
          );
          useNyrongppong.getState().newGame({
            rules: rulesOf(s),
            level: s.level,
            ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
