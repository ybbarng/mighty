"use client";

import {
  type Board,
  type ChessView,
  KIND_NAMES,
  type Kind,
  kingOf,
  type Move,
  materialPoints,
  type Played,
  PROMOTIONS,
  type Promotion,
  SIDE_NAMES,
  type Side,
  seatToMove,
  sideOfSeat,
  timeControlOf,
} from "@mighty/chess-engine";
import { useEffect, useRef, useState } from "react";

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

import { DRAW_LABEL } from "../kit";
import { CHESS_LEVELS, useChessSettings } from "../settings";
import { useChess } from "../store";
import { ChessBoard, PieceIcon } from "./ChessBoard";

/** 처음 판에 있는 기물 수(킹 빼고) */
const START_COUNT: Record<Exclude<Kind, "K">, number> = {
  Q: 1,
  R: 2,
  B: 2,
  N: 2,
  P: 8,
};

/** `side`가 잡은 상대 기물(큰 것부터). 처음 수에서 남은 수를 빼 센다 */
export function capturedPieces(board: Board, side: Side): Kind[] {
  const enemy = side === "w" ? "b" : "w";
  const out: Kind[] = [];
  for (const kind of ["Q", "R", "B", "N", "P"] as const) {
    const left = board.filter((c) => c === `${enemy}${kind}`).length;
    for (let i = left; i < START_COUNT[kind]; i++) out.push(kind);
  }
  return out;
}

/** 기보 줄: "1. e4 e5 2. Nf3" */
export function moveListText(played: readonly Played[], firstWhite = true) {
  const parts: string[] = [];
  played.forEach((p, i) => {
    const ply = firstWhite ? i : i + 1;
    if (ply % 2 === 0) parts.push(`${ply / 2 + 1}. ${p.san}`);
    else if (i === 0) parts.push(`1… ${p.san}`);
    else parts.push(p.san);
  });
  return parts.join(" ");
}

/** 자리 표: 색, 이름, 잡은 기물과 기물 점수 차이, 이긴 판 수, 시계 */
function PlayerPlate({
  view,
  seat,
  name,
}: {
  view: ChessView;
  seat: number;
  name: string;
}) {
  const side = sideOfSeat(view, seat);
  const turn = seatToMove(view) === seat;
  const control = timeControlOf(view.rules);
  const captured = capturedPieces(view.position.board, side);
  const lead =
    materialPoints(view.position.board, side) -
    materialPoints(view.position.board, side === "w" ? "b" : "w");
  return (
    <div
      data-turn={turn || undefined}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-1.5",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-white/5",
      )}
    >
      <PieceIcon piece={`${side}K`} className="size-6 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-sm">{name}</span>
        <span
          className="flex h-4 items-center text-white/70 text-xs"
          title="잡은 기물"
        >
          {captured.map((k, i) => (
            <PieceIcon
              // biome-ignore lint/suspicious/noArrayIndexKey: 같은 기물이 여럿이다
              key={i}
              piece={`${side === "w" ? "b" : "w"}${k}`}
              className="-mr-1 size-4"
            />
          ))}
          {lead > 0 && <span className="ml-1.5">+{lead}</span>}
        </span>
      </span>
      <span className="ml-auto whitespace-nowrap text-white/70 text-xs">
        {view.wins[seat] ?? 0}승
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

/** 승급할 기물 고르기(판 위에 띄운다) */
function PromotionChooser({
  side,
  onChoose,
  onCancel,
}: {
  side: Side;
  onChoose: (p: Promotion) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/55">
      <fieldset className="flex flex-col items-center gap-2 rounded-2xl bg-stone-800 p-3 shadow-2xl">
        <legend className="sr-only">승급할 기물</legend>
        <p className="font-semibold text-sm">폰을 무엇으로 바꿀까요?</p>
        <div className="flex gap-2">
          {PROMOTIONS.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={KIND_NAMES[p]}
              onClick={() => onChoose(p)}
              className="flex flex-col items-center rounded-xl bg-[#f0d9b5] px-1.5 pt-1 pb-0.5 text-black hover:bg-amber-200"
            >
              <PieceIcon piece={`${side}${p}`} className="size-11" />
              <span className="text-[11px]">{KIND_NAMES[p]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-white/70 text-xs underline"
        >
          그만두기
        </button>
      </fieldset>
    </div>
  );
}

/** 판이 끝난 까닭(띠·결과 상자 아래 줄) */
export function resultDetail(
  result: NonNullable<ChessView["result"]>,
  me: number,
): string {
  if (result.kind === "draw") return DRAW_LABEL[result.reason];
  if (result.kind === "checkmate") return "체크메이트!";
  if (result.kind === "resign")
    return result.seat === me ? "상대 기권" : "기권";
  return result.seat === me ? "상대 시간 끝" : "시간패";
}

/** 대국 화면 */
export function ChessGame({
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
  } = useChess();
  const submit = useChess((s) => s.submit);
  const undo = useChess((s) => s.undo);
  const canUndo = useChess((s) => s.canUndo());
  const clearNotice = useChess((s) => s.clearNotice);
  const coordinates = useChessSettings((s) => s.coordinates);
  const [selected, setSelected] = useState<number | null>(null);
  const [promotion, setPromotion] = useState<Move | null>(null);
  const played = view?.played.length ?? 0;
  const list = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 수가 오가면 고른 기물을 놓고, 기보 줄을 끝으로 민다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 둔 수가 늘 때만 한다
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
    list.current?.scrollTo({ left: list.current.scrollWidth });
  }, [played]);

  if (!view || !host) return null;
  const me = host.seat;
  const mySide = sideOfSeat(view, me);
  const myMove = view.decision?.kind === "move";
  const levelName = CHESS_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const last = view.played.at(-1) ?? null;
  const checkedKing = view.check
    ? kingOf(view.position.board, view.check)
    : null;

  let status: string;
  if (view.phase === "play")
    status = myMove
      ? view.check === mySide
        ? "체크! 킹을 지키세요"
        : selected !== null
          ? "갈 칸을 누르세요"
          : "내 차례 — 옮길 기물을 누르세요"
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (result?.kind === "draw") status = "비겼어요";
  else if (result?.seat === me)
    status =
      result.kind === "checkmate"
        ? "체크메이트로 이겼어요!"
        : result.kind === "resign"
          ? "상대가 기권했어요"
          : "상대 시간이 다 돼 이겼어요!";
  else
    status =
      result?.kind === "checkmate"
        ? "체크메이트당해 졌어요"
        : result?.kind === "resign"
          ? "기권했어요"
          : "시간이 다 돼 졌어요";

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? {
          won: ended.result.kind !== "draw" && ended.result.seat === me,
          draw: ended.result.kind === "draw",
          detail: resultDetail(ended.result, me),
        }
      : null;
  const outcome: Outcome | null =
    result === null
      ? null
      : result.kind === "draw"
        ? "draw"
        : result.seat === me
          ? "win"
          : "loss";
  const gameOver = view.phase === "gameOver";

  /** 판에서 고른 수: 승급이면 고르는 창을 띄운다 */
  const onMove = (m: Move) => {
    if (
      view.legal.some((l) => l.from === m.from && l.to === m.to && l.promotion)
    ) {
      setPromotion(m);
      return;
    }
    submit({ type: "move", from: m.from, to: m.to });
  };

  return (
    <main
      data-game="chess"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-2.5 bg-[#1c1917] px-4 py-3 text-white short-landscape:grid short-landscape:grid-cols-[auto_minmax(0,18rem)] short-landscape:grid-rows-[auto_auto_auto_auto_1fr] short-landscape:content-center short-landscape:justify-center short-landscape:gap-x-6",
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
          ← 체스
        </button>
        <span className="ml-auto text-white/60">
          나는 {SIDE_NAMES[mySide]} · {view.roundNumber}판째
          {view.draws > 0 ? ` · 비김 ${view.draws}` : ""}
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

      {/* 판은 정사각형. 휴대폰 가로는 판이 화면 높이를 채우고 나머지는 오른쪽에 */}
      <div
        className={cn(
          "relative aspect-square w-[min(100%,calc(100dvh-17rem))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-5 short-landscape:row-start-1 short-landscape:w-[calc(100dvh-1.5rem)]",
          // 미션 띠 자리만큼 줄여 판 아래가 화면 밖으로 밀리지 않게 한다.
          mission &&
            "w-[min(100%,calc(100dvh-21rem))] short-landscape:w-[calc(100dvh-5.5rem)]",
        )}
      >
        <ChessBoard
          board={view.position.board}
          flipped={mySide === "b"}
          legal={promotion ? [] : view.legal}
          selected={selected}
          onSelect={setSelected}
          onMove={onMove}
          lastMove={last}
          checkedKing={checkedKing}
          coordinates={coordinates}
        />
        {promotion && (
          <PromotionChooser
            side={mySide}
            onChoose={(p) => {
              setPromotion(null);
              submit({ type: "move", ...promotion, promotion: p });
            }}
            onCancel={() => setPromotion(null)}
          />
        )}
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <RoundOutcome
        outcome={outcome}
        status={notice ?? status}
        summary={`나 ${view.wins[me] ?? 0} : ${view.wins[1 - me] ?? 0} ${opponent}${result ? ` · ${resultDetail(result, me)}` : ""}`}
        className="short-landscape:col-start-2 short-landscape:row-start-3"
      />

      <p
        ref={list}
        title="기보"
        className="w-full max-w-xl overflow-x-auto whitespace-nowrap rounded-lg bg-white/5 px-2 py-1 font-mono text-white/70 text-xs short-landscape:col-start-2 short-landscape:row-start-4"
      >
        {view.played.length === 0
          ? "기보: 아직 둔 수가 없어요"
          : moveListText(view.played, view.played[0]?.side === "w")}
      </p>

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-5 short-landscape:content-start">
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
