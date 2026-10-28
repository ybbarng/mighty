"use client";

import {
  type JanggiView,
  kingOf,
  materialScore,
  type ScoreReason,
  SETUPS,
  SIDE_NAMES,
  seatToMove,
  sideOfSeat,
  timeControlOf,
} from "@mighty/janggi-engine";
import { useEffect, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { GameClock } from "@/components/GameClock";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { cn } from "@/lib/cn";

import { BIKJANG_INFO, JANGGI_LEVELS, useJanggiSettings } from "../settings";
import { useJanggi } from "../store";
import { JanggiBoard, pieceLabel, SIDE_COLOR } from "./JanggiBoard";

const REASON_LABEL: Record<ScoreReason, string> = {
  bikjang: "빅장",
  repetition: "같은 수 되풀이",
  limit: "수 한도",
  passes: "둘 다 쉼",
};

/** 자리 표: 편(楚·漢), 이름, 남은 기물 점수, 이긴 판 수, 차례 표시 */
function PlayerPlate({
  view,
  seat,
  name,
}: {
  view: JanggiView;
  seat: number;
  name: string;
}) {
  const labels = useJanggiSettings((s) => s.labels);
  const side = sideOfSeat(view, seat);
  const turn = seatToMove(view) === seat;
  const control = timeControlOf(view.rules);
  return (
    <div
      data-turn={turn || undefined}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-white/5",
      )}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#f1e2c0] font-bold font-serif text-sm shadow-[1px_2px_2px_rgba(0,0,0,0.5)]"
        style={{ color: SIDE_COLOR[side] }}
      >
        {pieceLabel("K", side, labels)}
      </span>
      <span className="truncate font-semibold text-sm">{name}</span>
      <span className="ml-auto whitespace-nowrap text-white/70 text-xs">
        {materialScore(view.board, side)}점 · {view.wins[seat] ?? 0}승
      </span>
      {control && view.clocks?.[seat] && (
        <GameClock
          clock={view.clocks[seat]}
          control={control}
          running={turn && view.phase === "play"}
        />
      )}
    </div>
  );
}

/** 대국 화면 */
export function JanggiGame({
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
  } = useJanggi();
  const submit = useJanggi((s) => s.submit);
  const undo = useJanggi((s) => s.undo);
  const canUndo = useJanggi((s) => s.canUndo());
  const clearNotice = useJanggi((s) => s.clearNotice);
  const labels = useJanggiSettings((s) => s.labels);
  const [selected, setSelected] = useState<number | null>(null);
  const played = view?.played.length ?? 0;

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 수가 오가면 고른 기물을 놓는다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 둔 수가 늘 때만 푼다
  useEffect(() => setSelected(null), [played]);

  if (!view || !host) return null;
  const me = host.seat;
  const mySide = sideOfSeat(view, me);
  const myMove = view.decision?.kind === "move";
  const mySetup = view.decision?.kind === "setup";
  const levelName = JANGGI_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const last = view.played.at(-1);
  const lastMove = last && "from" in last ? last : null;
  const checkedKing = view.check ? kingOf(view.board, view.check) : null;

  let status: string;
  if (view.phase === "setup")
    status = mySetup
      ? "상차림을 고르세요(마·상 자리)"
      : online
        ? `${opponent}가 상차림을 고르는 중`
        : "컴퓨터가 상차림을 고르는 중…";
  else if (view.phase === "play")
    status = myMove
      ? view.check === mySide
        ? "장군! 궁을 지키세요"
        : selected !== null
          ? "갈 곳을 누르세요"
          : "내 차례 — 옮길 기물을 누르세요"
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (result?.seat === me)
    status =
      result.kind === "checkmate"
        ? "외통으로 이겼어요!"
        : result.kind === "resign"
          ? "상대가 기권했어요"
          : result.kind === "time"
            ? "상대 시간이 다 돼 이겼어요!"
            : "점수로 이겼어요!";
  else
    status =
      result?.kind === "checkmate"
        ? "외통당해 졌어요"
        : result?.kind === "resign"
          ? "기권했어요"
          : result?.kind === "time"
            ? "시간이 다 돼 졌어요"
            : "점수로 졌어요";

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const detailOf = (r: NonNullable<JanggiView["result"]>) =>
    r.kind === "checkmate"
      ? "외통!"
      : r.kind === "resign"
        ? r.seat === me
          ? "상대 기권"
          : "기권"
        : r.kind === "time"
          ? r.seat === me
            ? "상대 시간 끝"
            : "시간패"
          : `${REASON_LABEL[r.reason]} · 초 ${r.scores.c} : 한 ${r.scores.h}`;
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? { won: ended.result.seat === me, detail: detailOf(ended.result) }
      : null;
  const outcome: Outcome | null =
    result === null ? null : result.seat === me ? "win" : "loss";

  const gameOver = view.phase === "gameOver";
  const bikjangLabel = BIKJANG_INFO.find(
    (b) => b.value === view.rules.bikjang,
  )?.label;

  return (
    <main
      data-game="janggi"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-3 bg-[#1c1917] px-4 py-3 text-white short-landscape:grid short-landscape:grid-cols-[auto_minmax(0,18rem)] short-landscape:grid-rows-[auto_auto_auto_1fr] short-landscape:content-center short-landscape:justify-center short-landscape:gap-x-6",
        // 미션 띠가 위에 놓일 자리를 비워 둔다.
        mission && "pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-xl items-center gap-2 text-sm short-landscape:col-start-2 short-landscape:row-start-1">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 장기
        </button>
        <span className="ml-auto text-white/60">
          나는 {SIDE_NAMES[mySide]} · {bikjangLabel} · {view.roundNumber}판째
        </span>
      </header>

      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-start-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      <div className="flex w-full max-w-xl gap-2 short-landscape:col-start-2 short-landscape:row-start-2 short-landscape:flex-col">
        <PlayerPlate view={view} seat={me} name="나" />
        <PlayerPlate view={view} seat={1 - me} name={opponent} />
      </div>

      {/* 판은 세로로 길다(9×10). 휴대폰 가로는 판이 화면 높이를 채우고 나머지는 오른쪽에 */}
      <div
        className={cn(
          "relative aspect-[924/1024] w-[min(100%,calc((100dvh-16rem)*0.9))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-4 short-landscape:row-start-1 short-landscape:w-[calc((100dvh-1.5rem)*0.9)]",
          // 미션 띠 자리만큼 줄여 판 아래가 화면 밖으로 밀리지 않게 한다.
          mission &&
            "w-[min(100%,calc((100dvh-20rem)*0.9))] short-landscape:w-[calc((100dvh-5.5rem)*0.9)]",
        )}
      >
        <JanggiBoard
          board={view.board}
          flipped={mySide === "h"}
          legal={view.legal}
          selected={selected}
          onSelect={setSelected}
          onMove={(m) => submit({ type: "move", from: m.from, to: m.to })}
          lastMove={lastMove}
          checkedKing={checkedKing}
          labels={labels}
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <RoundOutcome
        outcome={outcome}
        status={notice ?? status}
        summary={`나 ${view.wins[me] ?? 0} : ${view.wins[1 - me] ?? 0} ${opponent}${result?.kind === "score" ? ` · 초 ${result.scores.c}점, 한 ${result.scores.h}점` : ""}`}
        className="short-landscape:col-start-2 short-landscape:row-start-3"
      />

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-4 short-landscape:content-start">
        {mySetup && (
          <fieldset className="grid w-full grid-cols-2 gap-2">
            <legend className="sr-only">상차림</legend>
            {SETUPS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => submit({ type: "setup", setup: s.value })}
                className="rounded-xl border border-amber-300/60 bg-amber-300/10 px-3 py-2 font-semibold hover:bg-amber-300/20"
              >
                {s.label}
              </button>
            ))}
          </fieldset>
        )}
        {view.phase === "play" && (
          <>
            {!online && !mission && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setSelected(null);
                  undo();
                }}
                className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
              >
                무르기
              </button>
            )}
            {myMove && view.check !== mySide && (
              <button
                type="button"
                onClick={() => submit({ type: "pass" })}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                한 수 쉬기
              </button>
            )}
            {/* 온라인 참가자는 내 차례에만 행동을 보낼 수 있다 */}
            {(!online || myMove) && (
              <button
                type="button"
                onClick={() => submit({ type: "resign" })}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                기권
              </button>
            )}
          </>
        )}
        {view.phase === "roundEnd" && !view.continued[me] && (
          <button
            type="button"
            onClick={() => submit({ type: "continue" })}
            className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
          >
            다음 판
          </button>
        )}
        {/* 미션은 결과 창이 다음·다시 하기를 맡는다 */}
        {gameOver && !mission && (
          <>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
            <a href="/" className="rounded-xl bg-white/10 px-4 py-2">
              게임 목록
            </a>
          </>
        )}
      </div>

      {online && (
        <div className="w-full max-w-xl short-landscape:col-start-2">
          <ChatBox mySeat={me} />
        </div>
      )}
    </main>
  );
}
