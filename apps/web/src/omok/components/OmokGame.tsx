"use client";

import {
  type OmokView,
  pointName,
  seatToMove,
  stoneOfSeat,
} from "@mighty/omok-engine";
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

import { OMOK_LEVELS, useOmokSettings, VARIANT_INFO } from "../settings";
import { useOmok } from "../store";
import { OmokBoard } from "./OmokBoard";

/** 자리 표: 이름, 돌 색, 이긴 판 수, 차례 표시 */
function PlayerPlate({
  view,
  seat,
  name,
}: {
  view: OmokView;
  seat: number;
  name: string;
}) {
  const black = stoneOfSeat(view, seat) === 1;
  const turn = seatToMove(view) === seat;
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
      {/* 판 위 돌과 같은 빛(왼쪽 위)과 그림자 */}
      <span
        className="size-5 shrink-0 rounded-full shadow-[1px_2px_2px_rgba(0,0,0,0.5)]"
        style={{
          background: black
            ? "radial-gradient(circle at 36% 32%, #6b6b6b, #2a2a2a 35%, #050505)"
            : "radial-gradient(circle at 36% 32%, #ffffff, #f1f0ec 55%, #b9b6ae)",
        }}
      />
      <span className="truncate font-semibold text-sm">{name}</span>
      <span className="ml-auto text-sm text-white/70">
        {view.wins[seat] ?? 0}승
      </span>
    </div>
  );
}

/** 대국 화면 */
export function OmokGame({
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
  } = useOmok();
  const submit = useOmok((s) => s.submit);
  const undo = useOmok((s) => s.undo);
  const canUndo = useOmok((s) => s.canUndo());
  const clearNotice = useOmok((s) => s.clearNotice);
  const showForbidden = useOmokSettings((s) => s.showForbidden);
  const [aim, setAim] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  if (!view || !host) return null;
  const me = host.seat;
  const myStone = stoneOfSeat(view, me);
  const myTurn = view.phase === "play" && seatToMove(view) === me;
  const levelName = OMOK_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const lastMove = view.moves.at(-1) ?? null;

  let status: string;
  if (view.phase === "play")
    status = myTurn
      ? aim !== null
        ? `${pointName(aim)}: 한 번 더 누르면 둔다`
        : "내 차례 — 판을 눌러 두세요"
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (result?.kind === "draw") status = "비겼어요";
  else if (result?.seat === me)
    status =
      result.kind === "resign"
        ? "상대가 기권했어요"
        : result.kind === "time"
          ? "상대 시간이 다 돼 이겼어요!"
          : "이겼어요!";
  else
    status =
      result?.kind === "resign"
        ? "기권했어요"
        : result?.kind === "time"
          ? "시간이 다 돼 졌어요"
          : "졌어요";

  // 판이 막 끝난 장면이면 마이티·하트처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? {
          won: ended.result.kind !== "draw" && ended.result.seat === me,
          draw: ended.result.kind === "draw",
          detail:
            ended.result.kind === "five"
              ? "다섯!"
              : ended.result.kind === "time"
                ? ended.result.seat === me
                  ? "상대 시간 끝"
                  : "시간패"
                : ended.result.kind === "resign"
                  ? ended.result.seat === me
                    ? "상대 기권"
                    : "기권"
                  : null,
        }
      : null;
  const outcome =
    result === null
      ? null
      : result.kind === "draw"
        ? "draw"
        : result.seat === me
          ? "win"
          : "loss";

  const gameOver = view.phase === "gameOver";
  const variantLabel = VARIANT_INFO.find(
    (v) => v.value === view.rules.variant,
  )?.label;

  return (
    <main
      data-game="omok"
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
          ← 오목
        </button>
        <span className="ml-auto text-white/60">
          {variantLabel} · {view.roundNumber}판째
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

      {/* 휴대폰 가로: 판이 화면 높이를 꽉 채우고 나머지는 오른쪽에 */}
      <div
        className={cn(
          "relative aspect-square w-[min(100%,calc(100dvh-15rem))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-4 short-landscape:row-start-1 short-landscape:w-[calc(100dvh-1.5rem)]",
          // 미션 띠 자리만큼 줄여 판 아래가 화면 밖으로 밀리지 않게 한다.
          mission &&
            "w-[min(100%,calc(100dvh-19rem))] short-landscape:w-[calc(100dvh-5.5rem)]",
        )}
      >
        <OmokBoard
          board={view.board}
          myStone={myStone}
          canPlay={myTurn}
          lastMove={lastMove}
          winLine={result?.kind === "five" ? result.line : null}
          forbidden={showForbidden ? view.forbidden : []}
          aim={aim}
          onAim={setAim}
          onPlace={(at) => submit({ type: "place", at })}
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <RoundOutcome
        outcome={outcome}
        status={notice ?? status}
        summary={`나 ${view.wins[me] ?? 0} : ${view.wins[1 - me] ?? 0} ${opponent}${view.rules.winsToFinish > 1 ? ` · ${view.rules.winsToFinish}승 먼저` : ""}`}
        className="short-landscape:col-start-2 short-landscape:row-start-3"
      />

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-4 short-landscape:content-start">
        {view.phase === "play" && (
          <>
            {aim !== null && myTurn && (
              <button
                type="button"
                onClick={() => {
                  setAim(null);
                  submit({ type: "place", at: aim });
                }}
                className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
              >
                여기 두기
              </button>
            )}
            {!online && !mission && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setAim(null);
                  undo();
                }}
                className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
              >
                무르기
              </button>
            )}
            {/* 온라인 참가자는 내 차례에만 행동을 보낼 수 있다 */}
            {(!online || myTurn) && (
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
