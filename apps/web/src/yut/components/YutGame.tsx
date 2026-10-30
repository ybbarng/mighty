"use client";

import {
  type GameResult,
  HOME,
  type MoveOption,
  pendingSeats,
  sideCount,
  sideOf,
  type ThrowValue,
  throwName,
  type YutView,
} from "@mighty/yut-engine";
import { useEffect, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { ResultBanner } from "@/components/ResultBanner";
import { RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { cn } from "@/lib/cn";

import { outcomeFor } from "../kit";
import { yutSession } from "../session";
import { YUT_LEVELS } from "../settings";
import { useYut } from "../store";
import {
  PendingChips,
  PieceToken,
  SeatClocks,
  SideTray,
  seatLabel,
  sideLabel,
  YutSticks,
} from "./parts";
import { YutBoard } from "./YutBoard";

/** 윷놀이 화면 배경: 저녁 마당 */
export const YUT_BG =
  "bg-[radial-gradient(ellipse_at_top,#7c2d12_0%,#3b170a_45%,#1f0d07_100%)]";

function resultText(
  result: GameResult | null,
  view: YutView,
  name: (seat: number) => string,
): string {
  const mySide = sideOf(view.rules, view.mySeat);
  if (!result) return "게임을 끝냈어요";
  const won = result.side === mySide;
  const winner =
    result.side === null ? null : sideLabel(view, result.side, name);
  switch (result.kind) {
    case "finish":
      return won
        ? "말을 모두 냈어요! 이겼어요"
        : `${winner}이(가) 먼저 말을 모두 냈어요`;
    case "resign":
      if (result.seat === view.mySeat) return "기권했어요";
      return winner === null
        ? `${name(result.seat)}이(가) 기권해 끝났어요`
        : won
          ? `${name(result.seat)}이(가) 기권해 이겼어요`
          : `${name(result.seat)}이(가) 기권했어요`;
    case "forfeit":
      return result.seat === view.mySeat
        ? "던지기 고리를 공개하지 않아 졌어요"
        : `${name(result.seat)}이(가) 공개하지 않아 끝났어요`;
    case "time":
      return result.seat === view.mySeat
        ? "시간을 다 써서 졌어요"
        : `${name(result.seat)}이(가) 시간을 다 썼어요`;
  }
}

function bannerOf(result: GameResult | null, view: YutView): Banner {
  const outcome = outcomeFor(result, sideOf(view.rules, view.mySeat));
  const detail =
    result?.kind === "finish"
      ? `말 ${view.rules.pieces}개 모두 남`
      : result?.kind === "resign"
        ? "기권"
        : result?.kind === "forfeit"
          ? "공개하지 않음"
          : result?.kind === "time"
            ? "시간패"
            : null;
  return { won: outcome === "win", draw: outcome === "draw", detail };
}

/** 대국 화면: 위(가로는 왼쪽)에 윷판, 아래(가로는 오른쪽)에 윷가락·결과·던지기·편별 말 */
export function YutGame({
  onExit,
  mission,
}: {
  onExit: () => void;
  /** 튜토리얼 미션이면 목표 띠를 얹는다 */
  mission?: MissionProps;
}) {
  const {
    view,
    host,
    local,
    notice,
    level,
    seatNames,
    reconnecting,
    hostLeft,
    events,
    offlineSeats,
  } = useYut();
  const submit = useYut((s) => s.submit);
  const undo = useYut((s) => s.undo);
  const canUndo = useYut((s) => s.canUndo());
  const clearNotice = useYut((s) => s.clearNotice);
  const [selected, setSelected] = useState<ThrowValue | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 2200);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  const decision = view?.decision ?? null;
  const options: MoveOption[] =
    decision?.kind === "move" ? decision.options : [];
  const usable = new Set(options.map((o) => o.value));
  const value =
    selected !== null && usable.has(selected)
      ? selected
      : (view?.pending.find((v) => usable.has(v)) ?? null);
  const movable = new Map(
    options.filter((o) => o.value === value).map((o) => [o.from, o] as const),
  );
  const previewFrom = hover ?? armed;
  const preview =
    previewFrom !== null ? (movable.get(previewFrom) ?? null) : null;

  const move = (from: number) => {
    const option = movable.get(from);
    if (!option) return;
    setArmed(null);
    setHover(null);
    submit({ type: "move", value: option.value, from });
  };
  const pick = (from: number, pointerType: string) => {
    // 마우스·키보드는 누르면 바로, 터치는 겨누고(갈 곳을 보이고) 다시 누르면 움직인다.
    if (pointerType === "touch" || pointerType === "pen") {
      if (armed === from) move(from);
      else setArmed(from);
      return;
    }
    move(from);
  };

  // 차례가 바뀌거나 모아 둔 결과가 바뀌면 겨눈 말과 고른 결과를 푼다(다음은 처음 쓸 수 있는 결과부터).
  const pendingKey = view ? `${view.turn}:${view.pending.join(",")}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 결과·차례가 바뀔 때만 푼다
  useEffect(() => {
    setArmed(null);
    setHover(null);
    setSelected(null);
  }, [pendingKey]);

  // 키보드: 숫자로 결과 고르기(1 도 ~ 5 모, 0·b 빽도), Enter·Space로 던지기·겨눈 말 움직이기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      const map: Record<string, ThrowValue> = {
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "0": -1,
        b: -1,
      };
      const chosen = map[e.key];
      if (chosen !== undefined && usable.has(chosen)) {
        setSelected(chosen);
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && !target?.closest("button")) {
        if (decision?.kind === "throw") {
          e.preventDefault();
          submit({ type: "throw" });
        } else if (armed !== null) {
          e.preventDefault();
          move(armed);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!view || !host) return null;
  const me = host.seat;
  const mySide = sideOf(view.rules, me);
  const online = local === null;
  const players = view.rules.players;
  const name = (seat: number) => seatLabel(seat, me, seatNames, players - 1);
  const levelName = YUT_LEVELS.find((l) => l.value === level)?.label ?? "";
  const result = view.result;
  const gameOver = view.phase === "gameOver";
  const tossing = view.phase === "reveal";
  const myTurn = view.turn === me;
  const turnName = name(view.turn);

  let status: string;
  if (gameOver) status = resultText(result, view, name);
  else if (view.phase === "commit")
    status = "모두의 기기가 던지기 사슬을 약속하는 중…";
  else if (view.phase === "throw")
    status = myTurn ? "내 차례 — 윷을 던지세요" : `${turnName}의 차례`;
  else if (view.phase === "reveal") status = "모두의 기기가 함께 던지는 중…";
  else if (decision?.kind === "move")
    status =
      options.length > 0
        ? `움직일 말을 고르세요 · ${view.pending.map((v) => throwName(v)).join(", ")}`
        : "쓸 수 있는 결과가 없어요";
  else status = `${turnName}이(가) 말을 고르는 중…`;

  const ended = events.find((e) => e.type === "gameEnded");
  const banner: Banner | null =
    ended?.type === "gameEnded" && !mission ? bannerOf(result, view) : null;
  const outcome = gameOver ? outcomeFor(result, mySide) : null;
  const waitingOn = pendingSeats({ ...view, keys: [] });
  const waitingOffline =
    online &&
    !gameOver &&
    (view.phase === "commit" || view.phase === "reveal") &&
    waitingOn.some((s) => offlineSeats.includes(s));
  const hostRoom = yutSession.host;
  const homeOption = movable.get(HOME) ?? null;
  const sides = sideCount(view.rules);
  const summary = Array.from({ length: sides }, (_, side) => {
    const done = view.pieces.filter(
      (p) => p.side === side && p.point === -2,
    ).length;
    return `${sideLabel(view, side, name)} ${done}/${view.rules.pieces}`;
  }).join(" · ");

  return (
    <main
      data-game="yut"
      className={cn(
        "relative isolate flex min-h-dvh flex-col items-center gap-3 overflow-x-clip px-4 py-3 text-white split:grid split:grid-cols-[minmax(0,min(38rem,calc(100dvh-4.5rem)))_minmax(0,22rem)] split:content-start split:items-start split:justify-center split:gap-x-6 lg:py-5",
        YUT_BG,
        mission && "pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-xl items-center gap-2 text-sm split:col-span-2 split:max-w-none">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 윷놀이
        </button>
        <span className="ml-auto text-white/60">
          {view.rules.mode === "team"
            ? "2:2 편"
            : players === 2
              ? "1:1"
              : `${players}인`}
          {` · 말 ${view.rules.pieces}개`}
          {online ? "" : ` · 컴퓨터 ${levelName}`}
        </span>
      </header>

      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm split:col-span-2 split:max-w-none"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}
      {waitingOffline && (
        <div
          role="alert"
          className="flex w-full max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl bg-rose-800/80 px-3 py-2 text-center text-sm split:col-span-2 split:max-w-none"
        >
          <span>
            연결이 끊긴 사람이 있어요. 던지기 고리는 그 기기에만 있어 컴퓨터가
            대신 공개할 수 없어요.
          </span>
          {hostRoom && (
            <button
              type="button"
              onClick={() => hostRoom.abandon()}
              className="rounded-lg bg-white px-2 py-0.5 font-semibold text-black"
            >
              기다리지 않고 끝내기
            </button>
          )}
        </div>
      )}

      {/* 위(세로)·왼쪽(가로): 윷판 */}
      <div className="flex w-full max-w-[min(32rem,calc(100dvh-16rem))] min-w-64 flex-col items-center split:col-start-1 split:row-span-6 split:row-start-2 split:max-w-none">
        <YutBoard
          view={view}
          events={events}
          movable={movable}
          preview={preview}
          onHover={setHover}
          onPick={pick}
        />
      </div>

      {/* 아래(세로)·오른쪽(가로): 윷가락, 결과, 던지기, 편별 말 */}
      <div className="flex w-full max-w-xl flex-col items-center gap-2 split:col-start-2 split:row-start-2">
        <YutSticks
          sticks={view.lastThrow?.sticks ?? null}
          value={view.lastThrow?.value ?? null}
          throwKey={view.lastThrow ? view.lastThrow.index + 1 : 0}
          tossing={tossing}
        />
        <PendingChips
          values={view.pending}
          selected={value}
          usable={usable}
          {...(decision?.kind === "move" ? { onSelect: setSelected } : {})}
        />
        {decision?.kind === "move" && homeOption && (
          <button
            type="button"
            data-new-piece
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(HOME)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
            onFocus={() => setHover(HOME)}
            onBlur={() => setHover(null)}
            onClick={(e) =>
              pick(
                HOME,
                (e.nativeEvent as PointerEvent).pointerType || "keyboard",
              )
            }
            className={cn(
              "flex items-center gap-2 rounded-xl border border-amber-200/40 bg-black/35 px-3 py-1.5 text-sm",
              armed === HOME && "ring-2 ring-yellow-300",
            )}
          >
            <PieceToken side={mySide} size={18} />새 말 내기
            {value !== null ? ` (${throwName(value)})` : ""}
          </button>
        )}
        {decision?.kind === "throw" && (
          <button
            type="button"
            data-throw
            onClick={() => submit({ type: "throw" })}
            className="yut-pop w-full max-w-xs rounded-2xl bg-amber-300 py-3 font-black text-black text-lg shadow-lg active:scale-95"
          >
            윷 던지기
          </button>
        )}
      </div>

      <div className="flex w-full max-w-xl flex-col gap-2 split:col-start-2">
        <SideTray
          view={view}
          name={name}
          turnSide={sideOf(view.rules, view.turn)}
        />
        <SeatClocks view={view} name={name} />
      </div>

      <div className="relative w-full max-w-xl split:col-start-2">
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={`난 말 ${summary}`}
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 split:col-start-2">
        {!gameOver && (
          <>
            {!online && !mission && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => undo()}
                className="rounded-xl border border-white/10 bg-black/35 px-4 py-2 text-sm disabled:opacity-40"
              >
                무르기
              </button>
            )}
            <button
              type="button"
              onClick={() => submit({ type: "resign" })}
              className="rounded-xl border border-white/10 bg-black/35 px-4 py-2 text-sm"
            >
              기권
            </button>
          </>
        )}
        {gameOver && !mission && (
          <>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
            <a
              href="/"
              className="rounded-xl border border-white/10 bg-black/35 px-4 py-2"
            >
              게임 목록
            </a>
          </>
        )}
      </div>

      {online && (
        <div className="w-full max-w-xl split:col-start-2">
          <ChatBox mySeat={me} />
        </div>
      )}
    </main>
  );
}
