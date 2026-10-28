"use client";

import {
  encodeHeartsRules,
  type HeartsRules,
  WINDOWS_RULE_CODE,
} from "@mighty/hearts-engine";
import { type ReactNode, useEffect, useState } from "react";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { ActionButton } from "@/components/panels/common";
import { SuitStylePicker } from "@/components/SuitStylePicker";
import { SuitText } from "@/components/SuitText";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";
import { useHeartsTutorialProgress } from "@/tutorial/progress";

import { HEARTS_LEVELS } from "../bots";
import { endHeartsSession } from "../session";
import { heartsRules, useHeartsSettings } from "../settings";
import { clearHearts, type HeartsSaved, loadHearts, useHearts } from "../store";
import { HEARTS_LESSONS } from "../tutorial";
import { HeartsOnlineScreen } from "./HeartsOnlineScreen";
import { HeartsTable } from "./HeartsTable";
import { heartsTutorial } from "./hearts-tutorial";

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

const BG =
  "flex min-h-dvh justify-center bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)] p-4";

function MenuItem({
  title,
  detail,
  onClick,
  primary = false,
  icon,
}: {
  title: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        playUiCue("click");
        onClick();
      }}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
        primary
          ? "border-rose-300 bg-rose-500 text-white hover:bg-rose-400"
          : "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      <span className="w-7 text-center text-2xl">{icon}</span>
      <span className="flex flex-1 flex-col">
        <span className="font-bold text-base">{title}</span>
        <span className="text-xs opacity-70">{detail}</span>
      </span>
    </button>
  );
}

/** 하트(/hearts) */
export function HeartsApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const [saved, setSaved] = useState<HeartsSaved | null>(null);
  const ruleCode = useHeartsSettings((s) => s.ruleCode);
  const level = useHeartsSettings((s) => s.level);
  const newGame = useHearts((s) => s.newGame);
  const resume = useHearts((s) => s.resume);
  const learned = useHeartsTutorialProgress((s) => s.completed.length);

  useEffect(() => {
    if (screen.kind === "start") setSaved(loadHearts());
  }, [screen.kind]);

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("hearts");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endHeartsSession();
    useHearts.setState({
      seatNames: null,
      audit: null,
      hostLeft: false,
      reconnecting: false,
      offlineSeats: [],
      endVote: null,
    });
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  const rules = heartsRules(ruleCode);

  if (screen.kind === "online")
    return (
      <HeartsOnlineScreen
        rules={rules}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <HeartsTable onExit={backToStart} />;
  if (screen.kind === "options")
    return <HeartsOptions onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "rules")
    return <HeartsRulesScreen onBack={() => setScreen({ kind: "start" })} />;
  if (screen.kind === "tutorial")
    return (
      <TutorialHome
        tutorial={heartsTutorial}
        onBack={backToStart}
        onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
      />
    );
  if (screen.kind === "lesson")
    return (
      <LessonPlayer
        key={screen.lessonId}
        tutorial={heartsTutorial}
        lessonId={screen.lessonId}
        onExit={() => setScreen({ kind: "tutorial" })}
      />
    );

  const levelLabel = HEARTS_LEVELS.find((l) => l.value === level)?.label;
  return (
    <main className={cn(BG, "items-center")}>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <BackToGames />
        <div className="mb-3 text-center">
          <div className="text-7xl text-red-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            ♥
          </div>
          <h1 className="mt-1 font-black text-4xl tracking-wide">하트</h1>
          <p className="mt-2 text-sm opacity-80">
            <SuitText text="하트와 ♠Q를 피하고, 가장 적게 먹은 사람이 이긴다" />
          </p>
        </div>
        {saved && (
          <MenuItem
            primary
            icon="▶"
            title="하던 게임 이어하기"
            detail="멈춘 곳부터 다시 둡니다"
            onClick={() => {
              try {
                resume(saved);
                setScreen({ kind: "playing" });
              } catch {
                clearHearts();
                setSaved(null);
              }
            }}
          />
        )}
        <MenuItem
          primary={!saved}
          icon="♥"
          title="나홀로 하트"
          detail={`컴퓨터 3명과 · ${ruleCode === WINDOWS_RULE_CODE ? "윈도우 하트" : "직접 정한 규칙"} · ${levelLabel ?? ""}`}
          onClick={() => {
            const seed = Number(
              new URLSearchParams(window.location.search).get("seed"),
            );
            newGame({
              rules,
              ...(Number.isInteger(seed) && seed > 0 ? { seed } : {}),
            });
            setScreen({ kind: "playing" });
          }}
        />
        <MenuItem
          icon="👥"
          title="다함께 하트"
          detail="링크로 친구를 부릅니다. 빈자리는 컴퓨터가 앉습니다"
          onClick={() => setScreen({ kind: "online", room: null })}
        />
        <MenuItem
          icon="🎓"
          title="하트 배우기"
          detail={
            learned >= HEARTS_LESSONS.length
              ? "모든 단원을 마쳤어요. 언제든 다시 볼 수 있어요"
              : learned > 0
                ? `${learned}/${HEARTS_LESSONS.length} 단원 마침`
                : `처음이라면 여기부터. ${HEARTS_LESSONS.length}단원, 미션 3개`
          }
          onClick={() => setScreen({ kind: "tutorial" })}
        />
        <div className="mt-1 flex justify-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setScreen({ kind: "options" })}
            className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            옵션
          </button>
          <button
            type="button"
            onClick={() => setScreen({ kind: "rules" })}
            className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            하트는?
          </button>
          <a
            href="/profile?game=hearts"
            className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15"
          >
            내 기록
          </a>
        </div>
        <p className="mt-2 text-center text-[11px] opacity-40">
          윈도우에 들어 있던 하트 규칙을 따라 만들었습니다
          <br />
          <MadeWith />
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs",
    on ? "border-amber-300 bg-white text-black" : "border-white/15 bg-white/5",
  );

function Choice<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={chip(o.value === value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 하트 옵션: 컴퓨터 실력과 규칙 */
function HeartsOptions({ onBack }: { onBack: () => void }) {
  const ruleCode = useHeartsSettings((s) => s.ruleCode);
  const setRuleCode = useHeartsSettings((s) => s.setRuleCode);
  const level = useHeartsSettings((s) => s.level);
  const setLevel = useHeartsSettings((s) => s.setLevel);
  const rules = heartsRules(ruleCode);
  const update = (patch: Partial<HeartsRules>) =>
    setRuleCode(encodeHeartsRules({ ...rules, ...patch }));
  const onOff = [
    { value: true, label: "켜기" },
    { value: false, label: "끄기" },
  ] as const;

  return (
    <main className={BG}>
      <div className="flex w-full max-w-md flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">하트 옵션</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          <Section title="컴퓨터 실력">
            <Choice value={level} options={HEARTS_LEVELS} onChange={setLevel} />
            <p className="text-xs opacity-60">
              {HEARTS_LEVELS.find((l) => l.value === level)?.description}
            </p>
          </Section>
          <Section title="무늬 표기">
            <SuitStylePicker detail />
          </Section>
          <Section title="규칙">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs opacity-70">{ruleCode}</span>
              {ruleCode !== WINDOWS_RULE_CODE && (
                <button
                  type="button"
                  onClick={() => setRuleCode(WINDOWS_RULE_CODE)}
                  className="rounded bg-white/10 px-2 py-0.5 text-xs"
                >
                  윈도우 하트로 되돌리기
                </button>
              )}
            </div>
            <span className="text-xs opacity-70">카드 넘기기</span>
            <Choice
              value={rules.passing}
              options={[
                { value: "cycle", label: "왼·오른·맞은편·안 넘김" },
                { value: "left", label: "늘 왼쪽" },
                { value: "none", label: "안 넘김" },
              ]}
              onChange={(passing) => update({ passing })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="문 슛(하트 13장과 ♠Q 독차지)" />
            </span>
            <Choice
              value={rules.moon}
              options={[
                { value: "others", label: "다른 사람 +26" },
                { value: "self", label: "내 점수 −26" },
                { value: "off", label: "없음" },
              ]}
              onChange={(moon) => update({ moon })}
            />
            <span className="text-xs opacity-70">
              하트 깨기(하트가 나오기 전에는 하트로 선을 못 잡는다)
            </span>
            <Choice
              value={rules.heartsBreak}
              options={onOff}
              onChange={(heartsBreak) => update({ heartsBreak })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="♠Q가 나와도 하트가 깨진다" />
            </span>
            <Choice
              value={rules.queenBreaksHearts}
              options={onOff}
              onChange={(queenBreaksHearts) => update({ queenBreaksHearts })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="첫 턴에 하트·♠Q를 낼 수 있다" />
            </span>
            <Choice
              value={rules.firstTrickPoints}
              options={onOff}
              onChange={(firstTrickPoints) => update({ firstTrickPoints })}
            />
            <span className="text-xs opacity-70">
              <SuitText text="◆J를 먹으면 −10점" />
            </span>
            <Choice
              value={rules.jackOfDiamonds}
              options={onOff}
              onChange={(jackOfDiamonds) => update({ jackOfDiamonds })}
            />
            <span className="text-xs opacity-70">게임이 끝나는 점수</span>
            <Choice
              value={rules.endScore}
              options={[50, 100, 150].map((v) => ({
                value: v,
                label: `${v}점`,
              }))}
              onChange={(endScore) => update({ endScore })}
            />
          </Section>
          <p className="text-xs opacity-60">
            카드 디자인, 진행 속도, 효과음, 이름은 마이티 옵션과 같이 씁니다.
          </p>
        </div>
      </div>
    </main>
  );
}

/** 하트 규칙 한눈에 */
function HeartsRulesScreen({ onBack }: { onBack: () => void }) {
  const items: [string, string][] = [
    [
      "목표",
      "점수를 적게 먹는다. 누군가 100점이 넘으면 끝나고, 가장 낮은 사람이 이긴다.",
    ],
    ["점수", "하트 한 장 1점, ♠Q 13점. 한 판에 모두 26점."],
    [
      "카드 넘기기",
      "판마다 3장을 왼쪽 → 오른쪽 → 맞은편 → 안 넘김 차례로 넘긴다.",
    ],
    [
      "시작",
      "♣2를 가진 사람이 ♣2로 시작한다. 첫 턴에는 하트와 ♠Q를 낼 수 없다.",
    ],
    [
      "따라 내기",
      "선 무늬가 있으면 그 무늬를 낸다. 없으면 아무 카드나. 으뜸 무늬는 없고, 선 무늬에서 가장 높은 카드가 이긴다.",
    ],
    [
      "하트 깨기",
      "누군가 하트를 버리기 전에는 하트로 선을 잡을 수 없다(하트뿐이면 예외).",
    ],
    [
      "문 슛",
      "하트 13장과 ♠Q를 혼자 다 먹으면 나는 0점, 다른 사람이 26점씩 받는다.",
    ],
    [
      "요령",
      "높은 카드와 ♠Q·♠A·♠K를 넘기고, 따라 낼 때는 지금 이기는 카드 바로 아래로 피한다. 무늬가 떨어지면 ♠Q와 높은 하트를 버린다.",
    ],
  ];
  return (
    <main className={BG}>
      <div className="flex w-full max-w-md flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">하트는?</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        <dl className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/40 p-5 text-sm shadow-2xl">
          {items.map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-bold text-rose-200">{term}</dt>
              <dd className="leading-relaxed opacity-85">
                <SuitText text={meaning} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-center text-xs opacity-50">
          윈도우 하트의 규칙을 따랐습니다. 규칙은 옵션에서 바꿀 수 있습니다.
          친구와 할 때의 공정성은{" "}
          <a href="/security" className="underline">
            어떻게 지켜지나요?
          </a>
        </p>
        <ActionButton onClick={onBack}>처음으로</ActionButton>
      </div>
    </main>
  );
}
