"use client";

import { cardOf } from "@mighty/hwatu";
import {
  type GameEvent,
  handValue,
  type NyrongppongView,
  type RoundResult,
  ranksOf,
  roundWinners,
  YAK_NAMES,
} from "@mighty/nyrongppong-engine";
import { useEffect, useRef, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { ResultBanner } from "@/components/ResultBanner";
import { type Outcome, RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import { botName } from "@/game/bot-names";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { useSettings } from "@/game/settings";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";
import { HwatuDeck } from "@/hwatu/components/HwatuLayout";
import { HwatuFairBar } from "@/hwatu/fair-bar";
import { cn } from "@/lib/cn";

import { NYRONGPPONG_LEVELS } from "../settings";
import { useNyrongppong } from "../store";

/** 나이롱뽕 화면 배경(화투 확인 화면과 같은 짙은 녹색 담요) */
export const NYRONGPPONG_BG =
  "bg-[radial-gradient(ellipse_at_top,#14532d_0%,#052e16_75%)]";

/** 휴대폰 가로처럼 낮고 넓은 화면인가(카드를 작게 그린다) */
function useShortLandscape(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(
      "(orientation: landscape) and (max-height: 600px)",
    );
    const update = () => setShort(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return short;
}

/** 뽕 응답 창에 남은 시간(ms). 화면을 받은 순간의 남은 시간에서 그 뒤 지난 시간을 뺀다 */
function useCallLeft(view: NyrongppongView | null, viewAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const open = view?.call !== null && view?.call !== undefined;
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [open]);
  if (!view?.call) return 0;
  return Math.max(0, view.call.left - (now - viewAt));
}

/** 판이 어떻게 끝났나(한 줄) */
export function endText(
  result: RoundResult,
  name: (seat: number) => string,
  bagaji: number,
): string {
  const end = result.end;
  switch (end.kind) {
    case "yak":
      return `${name(end.seat)} ${YAK_NAMES[end.yak.kind]}(${end.yak.value}점)`;
    case "out":
      return `${name(end.seat)} 박! ${name(end.from)} 바가지 +${bagaji}`;
    case "stop":
      return end.success
        ? `${name(end.seat)} 스톱 성공`
        : `${name(end.seat)} 스톱 실패(바가지 +30)`;
    case "deckOut":
      return "더미가 떨어졌어요";
  }
}

/**
 * 남의 손패 뒷면과 장수. 공통 `HwatuBacks`는 겹침이 커서 작은 자리 표에서는 한 장처럼 보여
 * 덜 겹쳐 펼친다(docs/30 9절, 화투 기초에 겹침 정도를 고르는 값을 바란다)
 */
function SeatBacks({ count, small }: { count: number; small: boolean }) {
  const width = small ? 14 : 18;
  return (
    <span
      role="img"
      aria-label={`뒷면 ${count}장`}
      className="flex items-end gap-1"
    >
      <span className="flex -space-x-2">
        {Array.from({ length: count }, (_, i) => (
          <HwatuCardView
            // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면은 순서가 곧 정체다
            key={i}
            faceDown
            width={width}
          />
        ))}
      </span>
      <span className="text-[10px] text-white/60 tabular-nums">{count}</span>
    </span>
  );
}

/** 남의 자리: 이름, 선 표시, 손패 뒷면, 뽕한 묶음, 합계 */
function SeatPlate({
  view,
  seat,
  name,
  shout,
  small,
}: {
  view: NyrongppongView;
  seat: number;
  name: string;
  /** 방금 뽕을 외쳤다 */
  shout: boolean;
  small: boolean;
}) {
  const turn =
    (view.phase === "draw" || view.phase === "discard") && view.turn === seat;
  const revealed = view.result?.hands[seat];
  return (
    <div
      data-seat={seat}
      data-turn={turn || undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 rounded-xl border px-2 py-1.5",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-black/20",
      )}
    >
      <div className="flex items-center gap-1 text-xs">
        <span className="truncate font-semibold">{name}</span>
        {view.dealer === seat && (
          <span className="shrink-0 rounded bg-rose-600 px-1 text-[10px]">
            선
          </span>
        )}
        <span className="ml-auto shrink-0 text-white/70 tabular-nums">
          {view.totals[seat] ?? 0}점
        </span>
      </div>
      <div className="flex min-h-7 items-end gap-1.5">
        {revealed ? (
          <div className="flex -space-x-2" data-revealed={seat}>
            {revealed.map((id) => (
              <HwatuCardView key={id} id={id} width={small ? 18 : 22} />
            ))}
          </div>
        ) : (
          <SeatBacks count={view.handCounts[seat] ?? 0} small={small} />
        )}
        {(view.melds[seat] ?? []).map((meld) => (
          <div key={meld[0]} className="flex -space-x-2" data-meld={seat}>
            {meld.map((id) => (
              <HwatuCardView key={id} id={id} width={small ? 14 : 18} />
            ))}
          </div>
        ))}
      </div>
      {shout && (
        <span className="pop-in absolute -top-3 right-1 rounded-full bg-rose-600 px-2 py-0.5 font-black text-sm shadow-lg">
          뽕!
        </span>
      )}
    </div>
  );
}

/** 판 끝 점수표: 자리마다 이번 판 점수·합계·남은 손패 */
function RoundTable({
  view,
  name,
}: {
  view: NyrongppongView;
  name: (seat: number) => string;
}) {
  const result = view.result;
  if (!result) return null;
  const ranks = ranksOf(view.totals);
  return (
    <table aria-label="점수표" className="w-full max-w-xl text-sm tabular-nums">
      <thead className="text-white/60 text-xs">
        <tr>
          <th className="text-left font-normal">자리</th>
          <th className="text-right font-normal">이번 판</th>
          <th className="text-right font-normal">합계</th>
        </tr>
      </thead>
      <tbody>
        {result.scores.map((score, seat) => (
          <tr
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={seat}
            className={cn(seat === view.mySeat && "font-bold text-amber-200")}
          >
            <td className="py-0.5">
              {ranks[seat]}등 {name(seat)}
            </td>
            <td className="text-right">{score}</td>
            <td className="text-right">{result.totals[seat]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 대국 화면 */
export function NyrongppongGame({
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
    viewAt,
  } = useNyrongppong();
  const submit = useNyrongppong((s) => s.submit);
  const undo = useNyrongppong((s) => s.undo);
  const canUndo = useNyrongppong((s) => s.canUndo());
  const clearNotice = useNyrongppong((s) => s.clearNotice);
  const botNames = useSettings((s) => s.botNames);
  const small = useShortLandscape();
  const [selected, setSelected] = useState<string | null>(null);
  const pointer = useRef<string>("mouse");
  const callLeft = useCallLeft(view, viewAt);
  // 방금 뽕한 자리(잠깐 "뽕!"을 띄운다)
  const [shout, setShout] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  useEffect(() => {
    const ppong = events.find(
      (e): e is Extract<GameEvent, { type: "ppong" }> => e.type === "ppong",
    );
    if (!ppong) return;
    setShout(ppong.seat);
    const id = setTimeout(() => setShout(null), 1600);
    return () => clearTimeout(id);
  }, [events]);

  // 손패가 바뀌면 고른 카드를 놓는다.
  const handKey = view?.hand.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: 손패가 바뀔 때만 푼다
  useEffect(() => setSelected(null), [handKey]);

  if (!view || !host) return null;
  const me = host.seat;
  const online = local === null;
  const n = view.rules.players;
  const levelName =
    NYRONGPPONG_LEVELS.find((l) => l.value === level)?.label ?? "";
  const name = (seat: number) =>
    seat === me
      ? "나"
      : online
        ? (seatNames?.[seat] ?? `자리 ${seat + 1}`)
        : botName(botNames, (seat - me + n) % n);
  const others = Array.from({ length: n - 1 }, (_, i) => (me + 1 + i) % n);
  const d = view.decision;
  const myDiscard = d?.kind === "discard";
  const top = view.pile.at(-1) ?? null;
  const result = view.result;
  const roundOver = view.phase === "roundEnd" || view.phase === "gameOver";

  const discard = (card: string) => {
    setSelected(null);
    submit({ type: "discard", card });
  };
  /** 마우스는 누르면 바로 버리고, 터치는 한 번 겨누고 다시 눌러 버린다 */
  const onCard = (card: string) => {
    const touch = pointer.current === "touch" || pointer.current === "pen";
    pointer.current = "mouse";
    if (!myDiscard) return;
    if (!touch || selected === card) discard(card);
    else setSelected(card);
  };

  let status: string;
  if (result) {
    const scores = result.scores;
    status =
      view.phase === "gameOver"
        ? view.retired
          ? "게임을 끝냈어요"
          : `게임 끝 — ${ranksOf(view.totals)[me]}등 (합계 ${view.totals[me]}점)`
        : roundWinners(scores).includes(me)
          ? `이번 판 1등! (${scores[me]}점)`
          : `이번 판 ${scores[me]}점`;
  } else if (d?.kind === "call")
    status = `뽕할 수 있어요! ${Math.ceil(callLeft / 1000)}초`;
  else if (d?.kind === "draw")
    // 암호화방은 뽕한 적이 있으면 늘 묻는다(방장이 손패 합을 모른다). 스톱할 수 없으면 가져오기만.
    status = d.canStop
      ? `스톱할 수 있어요(합 ${handValue(view.hand)}). 스톱하거나 한 장 가져오세요`
      : `합 ${handValue(view.hand)}라 스톱할 수 없어요. 한 장 가져오세요`;
  else if (myDiscard)
    status = d.yak
      ? `약이 됐어요: ${YAK_NAMES[d.yak.kind]}! 내거나 한 장 버리세요`
      : view.hand.length % 3 === 0 &&
          view.drawn === null &&
          view.melds[me]?.length
        ? "뽕! 한 장 더 버리세요"
        : "버릴 카드를 누르세요";
  else if (view.phase === "call") status = "뽕 응답을 기다리는 중…";
  else status = online ? `${name(view.turn)} 차례` : `${name(view.turn)} 차례…`;

  // 판이 막 끝난 장면이면 모든 게임처럼 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find(
    (e): e is Extract<GameEvent, { type: "roundEnded" }> =>
      e.type === "roundEnded",
  );
  const winners = ended ? roundWinners(ended.result.scores) : [];
  const banner: Banner | null =
    ended && !mission
      ? {
          won: winners.includes(me),
          draw: winners.includes(me) && winners.length > 1,
          detail: endText(ended.result, name, view.rules.bagaji),
        }
      : null;
  const roundWinnersNow = result ? roundWinners(result.scores) : [];
  const outcome: Outcome | null = !result
    ? null
    : roundWinnersNow.includes(me)
      ? roundWinnersNow.length > 1
        ? "draw"
        : "win"
      : "loss";

  const handWidth = small ? 40 : 54;
  const callOpen = view.call !== null;

  return (
    <main
      data-game="nyrongppong"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-2 overflow-x-hidden px-3 py-2 text-white",
        NYRONGPPONG_BG,
        "short-landscape:grid short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] short-landscape:content-start short-landscape:items-start short-landscape:gap-x-4",
        mission && "pt-16",
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-xl items-center gap-2 text-sm short-landscape:col-span-2 short-landscape:max-w-none">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 나이롱뽕
        </button>
        <span className="ml-auto truncate text-white/60 text-xs">
          {view.roundNumber}/{view.rules.rounds}판
          {online ? "" : ` · 컴퓨터(${levelName})`} · 뽕{" "}
          {view.rules.callSeconds}초
        </span>
      </header>

      {online && <HwatuFairBar me={me} over={view.phase === "gameOver"} />}
      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      {/* 왼쪽(가로 화면) 또는 위: 상대들과 가운데 더미·버린 패 */}
      <div className="flex w-full max-w-xl flex-col gap-2 short-landscape:col-start-1">
        <section
          aria-label="상대"
          className={cn(
            "grid w-full gap-1.5",
            others.length === 1
              ? "grid-cols-1"
              : others.length === 2
                ? "grid-cols-2"
                : others.length === 3
                  ? "grid-cols-3"
                  : "grid-cols-2",
          )}
        >
          {others.map((seat) => (
            <SeatPlate
              key={seat}
              view={view}
              seat={seat}
              name={name(seat)}
              shout={shout === seat}
              small={small || others.length >= 3}
            />
          ))}
        </section>

        <section
          aria-label="가운데"
          className="relative flex items-center justify-center gap-6 rounded-2xl bg-black/15 py-2"
        >
          <HwatuDeck count={view.deckCount} width={small ? 32 : 40} />
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "relative rounded-lg",
                callOpen &&
                  "ring-4 ring-rose-500 ring-offset-2 ring-offset-transparent",
              )}
            >
              {top ? (
                <HwatuCardView
                  id={top}
                  width={small ? 40 : 52}
                  className="pile-top"
                />
              ) : (
                <div
                  className="rounded-md border border-white/20 border-dashed"
                  style={{
                    width: small ? 40 : 52,
                    height: ((small ? 40 : 52) * 8) / 5,
                  }}
                />
              )}
            </div>
            <span className="text-white/70 text-xs">
              버린 패 {view.pile.length}장
            </span>
          </div>
          <ResultBanner banner={banner} seq={view.roundNumber} />
        </section>
      </div>

      {/* 오른쪽(가로 화면) 또는 아래: 상태, 내 패, 단추 */}
      <div className="flex w-full max-w-xl flex-col items-center gap-2 short-landscape:col-start-2 short-landscape:row-start-2">
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={
            result ? endText(result, name, view.rules.bagaji) : undefined
          }
        />

        {d?.kind === "call" && view.call && (
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => submit({ type: "call" })}
              className="ppong-button relative flex-1 overflow-hidden rounded-2xl bg-rose-600 py-3 font-black text-3xl shadow-[0_0_24px_rgba(244,63,94,0.7)] hover:bg-rose-500"
            >
              뽕!
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-1.5 bg-amber-300"
                style={{
                  width: `${(callLeft / (view.rules.callSeconds * 1000)) * 100}%`,
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => submit({ type: "pass" })}
              className="rounded-2xl bg-white/10 px-4 py-4 text-sm"
            >
              넘기기
            </button>
          </div>
        )}

        {(view.melds[me]?.length ?? 0) > 0 && (
          <div
            data-meld={me}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-white/60 text-xs">뽕</span>
            {(view.melds[me] ?? []).map((meld) => (
              <div key={meld[0]} className="flex -space-x-3">
                {meld.map((id) => (
                  <HwatuCardView key={id} id={id} width={small ? 22 : 28} />
                ))}
              </div>
            ))}
          </div>
        )}

        <section
          aria-label="내 손패"
          onPointerDownCapture={(e) => {
            pointer.current = e.pointerType;
          }}
          className="flex flex-wrap justify-center gap-1"
        >
          {(roundOver && result ? (result.hands[me] ?? []) : view.hand).map(
            (id) => (
              <HwatuCardView
                key={id}
                id={id}
                width={handWidth}
                selected={selected === id}
                highlight={
                  view.drawn === id ||
                  (d?.kind === "call" &&
                    view.call !== null &&
                    cardOf(id).month === cardOf(view.call.card).month)
                }
                {...(myDiscard ? { onClick: () => onCard(id) } : {})}
              />
            ),
          )}
        </section>
        <p className="text-white/60 text-xs">
          손패 합 {handValue(view.hand)}
          {view.drawn ? ` · 가져온 카드: ${cardOf(view.drawn).name}` : ""}
        </p>

        {roundOver && <RoundTable view={view} name={name} />}

        <div className="flex flex-wrap justify-center gap-2">
          {d?.kind === "draw" && (
            <>
              {d.canStop && (
                <button
                  type="button"
                  onClick={() => submit({ type: "stop" })}
                  className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
                >
                  스톱
                </button>
              )}
              <button
                type="button"
                onClick={() => submit({ type: "draw" })}
                className="rounded-xl bg-white/15 px-4 py-2"
              >
                한 장 가져오기
              </button>
            </>
          )}
          {myDiscard && d.yak && (
            <button
              type="button"
              onClick={() => submit({ type: "declare" })}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              약 내기: {YAK_NAMES[d.yak.kind]}({d.yak.value}점)
            </button>
          )}
          {myDiscard && selected && (
            <button
              type="button"
              onClick={() => discard(selected)}
              className="rounded-xl bg-white/15 px-4 py-2"
            >
              {cardOf(selected).name} 버리기
            </button>
          )}
          {!online && !mission && !roundOver && (
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => undo()}
              className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
            >
              무르기
            </button>
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
          {view.phase === "gameOver" && !mission && (
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
      </div>

      {online && (
        <div className="w-full max-w-xl short-landscape:col-start-1">
          <ChatBox mySeat={me} />
        </div>
      )}
    </main>
  );
}
