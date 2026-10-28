"use client";

import { useEffect, useState } from "react";

import { GameHome } from "@/components/GameHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useJanggiTutorialProgress } from "@/tutorial/progress";

import { endJanggiSession } from "../session";
import {
  BIKJANG_INFO,
  JANGGI_LEVELS,
  type JanggiLevel,
  type PieceLabels,
  type SidePick,
  useJanggiSettings,
} from "../settings";
import { clearJanggi, type JanggiSaved, loadJanggi, useJanggi } from "../store";
import { JANGGI_LESSONS } from "../tutorial";
import { JanggiGame } from "./JanggiGame";
import { JanggiOnlineScreen } from "./JanggiOnlineScreen";
import { janggiTutorial } from "./janggi-tutorial";

/** 장기 화면들의 배경(대국 화면의 짙은 색과 이어진다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: SidePick; label: string }[] = [
  { value: "cho", label: "초(먼저)" },
  { value: "han", label: "한" },
  { value: "random", label: "무작위" },
];

const LABEL_OPTIONS: readonly { value: PieceLabels; label: string }[] = [
  { value: "hanja", label: "한자(車·包·馬)" },
  { value: "hangul", label: "한글(차·포·마)" },
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

/** 장기 옵션: 빅장 규칙·판 수·컴퓨터·내 편·기물 글자. 다함께 장기도 여기서 고른 규칙과 판 수를 쓴다 */
function JanggiOptions({ onBack }: { onBack: () => void }) {
  const s = useJanggiSettings();
  const bikjang = BIKJANG_INFO.find((b) => b.value === s.bikjang);
  const level = JANGGI_LEVELS.find((l) => l.value === s.level);
  return (
    <SubScreen title="장기 옵션" onBack={onBack}>
      <Section title="빅장">
        <div className="flex flex-wrap gap-1.5">
          {BIKJANG_INFO.map((b) => (
            <Chip
              key={b.value}
              active={s.bikjang === b.value}
              onClick={() => s.set({ bikjang: b.value })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{bikjang?.description}</p>
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
          {JANGGI_LEVELS.map((l) => (
            <Chip
              key={l.value}
              active={s.level === l.value}
              onClick={() => s.set({ level: l.value as JanggiLevel })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        <p className="text-xs opacity-60">{level?.description}</p>
      </Section>
      <Section title="나홀로 장기에서 내 편">
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
        <p className="text-xs opacity-60">
          여러 판이면 판마다 초·한을 바꾼다. 한은 뒤에 두는 대신 덤 1.5점을
          받는다
        </p>
      </Section>
      <Section title="기물 글자">
        <div className="flex flex-wrap gap-1.5">
          {LABEL_OPTIONS.map((l) => (
            <Chip
              key={l.value}
              active={s.labels === l.value}
              onClick={() => s.set({ labels: l.value })}
            >
              {l.label}
            </Chip>
          ))}
        </div>
      </Section>
      <p className="text-xs opacity-60">
        다함께 장기도 여기서 고른 빅장 규칙과 판 수로 방을 엽니다.
      </p>
    </SubScreen>
  );
}

/** 장기 규칙 한눈에 */
function JanggiRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "상대 궁을 외통(장군을 어떻게 해도 풀 수 없음)으로 몰면 이긴다. 초(초록)가 먼저 둔다.",
    ],
    [
      "상차림",
      "판을 시작할 때 마·상 자리를 넷 가운데 고른다. 한이 먼저 고른다.",
    ],
    ["궁·사", "궁성 안에서 선을 따라 한 칸."],
    [
      "차",
      "가로·세로 직선으로 막힐 때까지. 궁성 대각선 위에서는 대각선으로도.",
    ],
    ["포", "기물 하나를 반드시 넘어서 간다. 포는 넘지도 잡지도 못한다."],
    ["마", "한 칸 + 바깥쪽 대각선 한 칸. 처음 칸이 막히면(멱) 못 간다."],
    ["상", "한 칸 + 대각선 두 칸. 지나는 칸이 막히면 못 간다."],
    ["졸·병", "앞과 옆으로 한 칸. 상대 궁성 안에서는 앞쪽 대각선도."],
    [
      "장군",
      "내 궁이 잡히게 되는 수는 둘 수 없다. 장군이 아니면 한 수 쉴 수 있다.",
    ],
    [
      "점수로 가리기",
      "빅장(궁 둘이 마주 봄)·같은 수 세 번·200수·둘 다 쉼이면 남은 기물 점수로 가린다. 차 13·포 7·마 5·상 3·사 3·졸 2, 한은 덤 1.5.",
    ],
  ];
  return (
    <SubScreen title="장기는?" onBack={onBack}>
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

/** 장기 첫 화면. 모든 게임이 같은 모양(GameHome)을 쓴다 */
function JanggiHome({
  onStart,
  onOnline,
  onLearn,
  onOptions,
  onRules,
}: {
  onStart: (saved?: JanggiSaved) => void;
  onOnline: () => void;
  onLearn: () => void;
  onOptions: () => void;
  onRules: () => void;
}) {
  const s = useJanggiSettings();
  const learned = useJanggiTutorialProgress((p) => p.completed.length);
  const [saved, setSaved] = useState<JanggiSaved | null>(null);
  useEffect(() => setSaved(loadJanggi()), []);
  const wins = WINS_OPTIONS.find((w) => w.value === s.winsToFinish)?.label;
  const level = JANGGI_LEVELS.find((l) => l.value === s.level)?.label;
  const side = PICK_OPTIONS.find((p) => p.value === s.pick)?.label;
  const token = (text: string, color: string) => (
    <span
      className="inline-flex size-16 items-center justify-center bg-[#f1e2c0] font-black font-serif text-3xl shadow-[2px_5px_8px_rgba(0,0,0,0.55)] [clip-path:polygon(29%_0,71%_0,100%_29%,100%_71%,71%_100%,29%_100%,0_71%,0_29%)]"
      style={{ color }}
    >
      {text}
    </span>
  );

  return (
    <GameHome
      game="janggi"
      theme="janggi"
      background={BG}
      primaryClass="border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
      hero={
        <>
          <div className="flex justify-center gap-1" aria-hidden="true">
            {token("楚", "#0f6b3a")}
            <span className="mt-5">{token("漢", "#b91c1c")}</span>
          </div>
          <h1 className="mt-2 font-black text-4xl tracking-wide">장기</h1>
        </>
      }
      tagline="차·포·마·상으로 상대 궁을 외통으로 몰아라"
      {...(saved ? { resume: () => onStart(saved) } : {})}
      solo={{
        icon: "楚",
        title: "나홀로 장기",
        detail: `컴퓨터와 · ${side ?? ""} · ${wins ?? ""} · ${level ?? ""}`,
        onClick: () => onStart(),
      }}
      together={{
        icon: "👥",
        title: "다함께 장기",
        detail: "링크로 친구를 부릅니다. 서버 없이 바로 이어집니다",
        onClick: onOnline,
      }}
      learn={{
        title: "장기 배우기",
        learned,
        total: JANGGI_LESSONS.length,
        firstHint: `처음이라면 여기부터. 기물 움직임부터 ${JANGGI_LESSONS.length}단원`,
        onClick: onLearn,
      }}
      onOptions={onOptions}
      aboutLabel="장기는?"
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

/** 장기(/janggi): 첫 화면, 옵션, 규칙, 배우기, 다함께 장기 방, 대국 화면 */
export function JanggiApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useJanggi((s) => s.view);
  const bikjang = useJanggiSettings((s) => s.bikjang);
  const winsToFinish = useJanggiSettings((s) => s.winsToFinish);

  // 다 끝난 게임은 이어하기에 남기지 않는다(튜토리얼 미션은 이어하기 저장과 상관없다).
  useEffect(() => {
    if (view?.phase === "gameOver" && !useJanggi.getState().practice)
      clearJanggi();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("janggi");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endJanggiSession();
    useJanggi.getState().leave();
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online")
    return (
      <JanggiOnlineScreen
        rules={{ bikjang, winsToFinish }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <JanggiGame onExit={backToStart} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={janggiTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={janggiTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );
  if (screen.kind === "options")
    return <JanggiOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <JanggiRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  return (
    <JanggiHome
      onOnline={() => setScreen({ kind: "online", room: null })}
      onLearn={() => setScreen({ kind: "tutorial" })}
      onOptions={() => setScreen({ kind: "options" })}
      onRules={() => setScreen({ kind: "rules" })}
      onStart={(saved) => {
        if (saved) useJanggi.getState().resume(saved);
        else {
          const s = useJanggiSettings.getState();
          useJanggi.getState().newGame({
            rules: { bikjang: s.bikjang, winsToFinish: s.winsToFinish },
            level: s.level,
            pick: s.pick,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
