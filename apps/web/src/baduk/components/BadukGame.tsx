"use client";

import {
  areaOwners,
  type BadukView,
  countArea,
  pointName,
  STONE_NAMES,
  seatToMove,
  stoneOfSeat,
  timeControlOf,
} from "@mighty/baduk-engine";
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

import { countText } from "../kit";
import { BADUK_LEVELS } from "../settings";
import { useBaduk } from "../store";
import { BadukBoard } from "./BadukBoard";

/** 돌 그림(판 위 돌과 같은 빛과 그림자) */
export function StoneDot({
  black,
  className,
}: {
  black: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "size-5 shrink-0 rounded-full shadow-[1px_2px_2px_rgba(0,0,0,0.5)]",
        className,
      )}
      style={{
        background: black
          ? "radial-gradient(circle at 36% 32%, #6b6b6b, #2a2a2a 35%, #050505)"
          : "radial-gradient(circle at 36% 32%, #ffffff, #f1f0ec 55%, #b9b6ae)",
      }}
    />
  );
}

/** 자리 표: 돌 색, 이름, 따낸 돌, 이긴 판 수, 시계, 차례 표시 */
function PlayerPlate({
  view,
  seat,
  name,
}: {
  view: BadukView;
  seat: number;
  name: string;
}) {
  const stone = stoneOfSeat(view, seat);
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
      <StoneDot black={stone === 1} />
      <span className="truncate font-semibold text-sm">{name}</span>
      <span className="ml-auto whitespace-nowrap text-white/70 text-xs">
        따냄 {view.prisoners[stone]} · {view.wins[seat] ?? 0}승
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
export function BadukGame({
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
  } = useBaduk();
  const submit = useBaduk((s) => s.submit);
  const undo = useBaduk((s) => s.undo);
  const canUndo = useBaduk((s) => s.canUndo());
  const clearNotice = useBaduk((s) => s.clearNotice);
  const [aim, setAim] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const played = view?.played.length ?? 0;

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 수가 오가면 겨눈 자리를 푼다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 둔 수가 늘 때만 푼다
  useEffect(() => setAim(null), [played]);

  if (!view || !host) return null;
  const me = host.seat;
  const size = view.rules.size;
  const myStone = stoneOfSeat(view, me);
  const myTurn = view.decision?.kind === "move";
  const levelName = BADUK_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const last = view.played.at(-1);
  const lastMove = last && "at" in last ? last.at : null;
  const opponentPassed = view.phase === "play" && view.passes > 0;

  let status: string;
  if (view.phase === "play")
    status = myTurn
      ? aim !== null
        ? `${pointName(aim, size)}: 한 번 더 누르면 둔다`
        : opponentPassed
          ? "상대가 쉬었어요 — 나도 쉬면 판 위 그대로 세요"
          : "내 차례 — 판을 눌러 두세요"
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (result?.seat === me)
    status =
      result.kind === "score"
        ? "세어 보니 이겼어요!"
        : result.kind === "resign"
          ? "상대가 기권했어요"
          : "상대 시간이 다 돼 이겼어요!";
  else
    status =
      result?.kind === "score"
        ? "세어 보니 졌어요"
        : result?.kind === "resign"
          ? "기권했어요"
          : "시간이 다 돼 졌어요";

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const detailOf = (r: NonNullable<BadukView["result"]>) =>
    r.kind === "score"
      ? countText(r.count)
      : r.kind === "resign"
        ? r.seat === me
          ? "상대 기권"
          : "기권"
        : r.seat === me
          ? "상대 시간 끝"
          : "시간패";
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? { won: ended.result.seat === me, detail: detailOf(ended.result) }
      : null;
  const outcome: Outcome | null =
    result === null ? null : result.seat === me ? "win" : "loss";

  // 판 끝 세기 결과나 "세어 보기"를 누르면 자리 주인을 판에 보인다.
  const showOwners =
    (result?.kind === "score" && view.phase !== "play") ||
    (counting && view.phase === "play");
  const owners = showOwners ? areaOwners(view.board) : null;
  const liveCount = counting ? countArea(view.board, view.rules.komi) : null;

  const gameOver = view.phase === "gameOver";
  const summaryParts = [
    `나 ${view.wins[me] ?? 0} : ${view.wins[1 - me] ?? 0} ${opponent}`,
  ];
  if (result?.kind === "score") summaryParts.push(countText(result.count));
  else if (liveCount) summaryParts.push(`지금 세면 ${countText(liveCount)}`);

  return (
    <main
      data-game="baduk"
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
          ← 바둑
        </button>
        <span className="ml-auto text-white/60">
          나는 {STONE_NAMES[myStone]} · {size}줄 · 덤 {view.rules.komi} ·{" "}
          {view.roundNumber}판째
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

      {/* 휴대폰 가로는 판이 화면 높이를 채우고 나머지는 오른쪽에 */}
      <div
        className={cn(
          "relative aspect-square w-[min(100%,calc(100dvh-15rem))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-4 short-landscape:row-start-1 short-landscape:w-[calc(100dvh-1.5rem)]",
          // 미션 띠 자리만큼 줄여 판 아래가 화면 밖으로 밀리지 않게 한다.
          mission &&
            "w-[min(100%,calc(100dvh-19rem))] short-landscape:w-[calc(100dvh-5.5rem)]",
        )}
      >
        <BadukBoard
          board={view.board}
          size={size}
          myStone={myStone}
          canPlay={myTurn}
          legal={view.legal}
          lastMove={lastMove}
          aim={aim}
          onAim={setAim}
          onPlace={(at) => submit({ type: "place", at })}
          owners={owners}
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <RoundOutcome
        outcome={outcome}
        status={notice ?? status}
        summary={summaryParts.join(" · ")}
        className="short-landscape:col-start-2 short-landscape:row-start-3"
      />

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-4 short-landscape:content-start">
        {view.phase === "play" && (
          <>
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
            {myTurn && (
              <button
                type="button"
                onClick={() => submit({ type: "pass" })}
                className={cn(
                  "rounded-xl px-4 py-2",
                  opponentPassed
                    ? "bg-amber-300 font-semibold text-black"
                    : "bg-white/10",
                )}
              >
                쉬기
              </button>
            )}
            <button
              type="button"
              aria-pressed={counting}
              onClick={() => setCounting((c) => !c)}
              className={cn(
                "rounded-xl px-4 py-2",
                counting ? "bg-white text-black" : "bg-white/10",
              )}
            >
              세어 보기
            </button>
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
