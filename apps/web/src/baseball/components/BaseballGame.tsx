"use client";

import {
  type BaseballView,
  candidatesFor,
  cluesOf,
  commitmentOf,
  type RoundResult,
  timeControlOf,
} from "@mighty/baseball-engine";
import { useEffect, useState } from "react";

import { ChatBox } from "@/components/ChatBox";
import { GameClock } from "@/components/GameClock";
import { ResultBanner } from "@/components/ResultBanner";
import { RoundOutcome } from "@/components/RoundOutcome";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import type { ResultBanner as Banner } from "@/game/result-banner";
import { cn } from "@/lib/cn";

import { mySecret, randomSecret, type SecretBook } from "../secret";
import { baseballSession } from "../session";
import { BASEBALL_LEVELS, useBaseballSettings } from "../settings";
import { useBaseball } from "../store";
import { GuessLog, NumberBoxes, NumberPad } from "./parts";

/** 자리 표: 이름, 이긴 판 수, 맞힐 차례 표시, 시계 */
function PlayerPlate({
  view,
  seat,
  name,
}: {
  view: BaseballView;
  seat: number;
  name: string;
}) {
  const turn = view.phase === "play" && view.turn === seat;
  const control = timeControlOf(view.rules);
  const asked = cluesOf(view, seat).length;
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
      <span className="truncate font-semibold text-sm">{name}</span>
      {view.rules.mode === "duel" && view.starter === seat && (
        <span className="shrink-0 rounded bg-white/15 px-1 text-[10px]">
          선
        </span>
      )}
      {control && view.clocks?.[seat] && (
        <span className="ml-auto">
          <GameClock
            clock={view.clocks[seat]}
            control={control}
            running={turn}
          />
        </span>
      )}
      <span
        className={cn("shrink-0 text-sm text-white/70", !control && "ml-auto")}
      >
        {view.rules.mode === "puzzle"
          ? seat === 0
            ? `${asked}번`
            : "숨긴 수 🔒"
          : `${view.wins[seat] ?? 0}승`}
      </span>
    </div>
  );
}

function resultText(
  result: RoundResult,
  me: number,
  view: BaseballView,
): string {
  const puzzle = view.rules.mode === "puzzle";
  const mine = "seat" in result && result.seat === me;
  switch (result.kind) {
    case "hit":
      if (puzzle) return `${cluesOf(view, me).length}번 만에 맞혔어요!`;
      return mine ? "맞혔어요! 이겼어요" : "상대가 먼저 맞혀 졌어요";
    case "draw":
      return "둘 다 맞혀 비겼어요";
    case "resign":
      if (puzzle) return "그만두었어요";
      return mine ? "상대가 기권했어요" : "기권했어요";
    case "time":
      return mine ? "상대 시간이 다 돼 이겼어요!" : "시간이 다 돼 졌어요";
    case "cheat":
      if (result.seat === null)
        return "둘 다 답이 비밀과 맞지 않아 이긴 사람이 없어요";
      return mine
        ? "상대 답이 비밀과 맞지 않아 이겼어요"
        : "내 답이 비밀과 맞지 않아 졌어요";
    case "forfeit":
      return mine ? "상대가 답하지 않아 이겼어요" : "답하지 않아 졌어요";
  }
}

function bannerOf(result: RoundResult, me: number, view: BaseballView): Banner {
  const draw =
    result.kind === "draw" || (result.kind === "cheat" && result.seat === null);
  const won = !draw && "seat" in result && result.seat === me;
  const detail =
    result.kind === "hit"
      ? `${cluesOf(view, result.seat).length}번 만에 맞힘`
      : result.kind === "cheat"
        ? "거짓 답이 드러남"
        : result.kind === "time"
          ? won
            ? "상대 시간 끝"
            : "시간패"
          : result.kind === "resign"
            ? won
              ? "상대 기권"
              : "기권"
            : result.kind === "forfeit"
              ? "답하지 않음"
              : null;
  return { won, draw, detail };
}

/** 판 끝: 두 사람 비밀과 엔진이 다시 계산한 결과 */
function RevealPanel({
  view,
  me,
  opponent,
  book,
}: {
  view: BaseballView;
  me: number;
  opponent: string;
  book: SecretBook;
}) {
  const digits = view.rules.digits;
  const rows = [me, 1 - me]
    .filter((seat) => view.commits[seat] !== null)
    .map((seat) => {
      const r = view.reveals[seat];
      const known =
        r?.secret ?? (seat === me ? mySecret(view, book)?.secret : undefined);
      const problem = !r
        ? "아직 공개하지 않았어요"
        : !r.matches
          ? "처음 약속과 다른 수를 공개했어요"
          : r.wrongAt !== null
            ? `${view.guesses.filter((g, i) => i <= (r.wrongAt as number) && g.seat !== seat).length}번째 답이 이 수와 맞지 않아요`
            : null;
      return { seat, known, problem, ok: r !== null && problem === null };
    });
  if (rows.length === 0) return null;
  return (
    <div className="flex w-full max-w-xl flex-col gap-1.5 rounded-xl border border-white/10 bg-black/40 p-3 short-landscape:col-start-2">
      {rows.map((row) => (
        <div
          key={row.seat}
          data-reveal={row.seat}
          className="flex items-center gap-2 text-sm"
        >
          <span className="w-16 shrink-0 truncate text-white/70">
            {row.seat === me
              ? "내 수"
              : view.rules.mode === "puzzle"
                ? "정답"
                : `${opponent}`}
          </span>
          <NumberBoxes
            value={row.known ?? ""}
            digits={digits}
            size="sm"
            tone={row.problem && view.reveals[row.seat] ? "bad" : "lit"}
          />
          <span
            className={cn(
              "text-xs",
              row.ok ? "text-emerald-300" : "text-rose-300",
            )}
          >
            {row.ok ? "약속·답 모두 맞음 ✓" : row.problem}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 대국 화면 */
export function BaseballGame({
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
    secrets,
  } = useBaseball();
  const submit = useBaseball((s) => s.submit);
  const chooseSecret = useBaseball((s) => s.chooseSecret);
  const undo = useBaseball((s) => s.undo);
  const canUndo = useBaseball((s) => s.canUndo());
  const clearNotice = useBaseball((s) => s.clearNotice);
  const showHints = useBaseballSettings((s) => s.showHints);
  const [entry, setEntry] = useState("");

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 2200);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 할 일이 바뀌면(물음을 냈다, 비밀을 정했다) 넣던 수를 비운다.
  const decisionKind = view?.decision?.kind ?? null;
  const round = view?.roundNumber;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 할 일·판이 바뀔 때만 비운다
  useEffect(() => setEntry(""), [decisionKind, round]);

  if (!view || !host) return null;
  const me = host.seat;
  const opp = 1 - me;
  const digits = view.rules.digits;
  const puzzle = view.rules.mode === "puzzle";
  const levelName = BASEBALL_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[opp] ?? "상대")
    : `컴퓨터(${levelName})`;
  const decision = view.decision;
  const secret = mySecret(view, secrets);
  const keptOwn =
    secret !== null &&
    secrets[view.roundNumber] !== undefined &&
    commitmentOf(
      secrets[view.roundNumber]?.secret ?? "",
      secrets[view.roundNumber]?.salt ?? "",
    ) === view.commits[me];
  const myGuesses = view.guesses
    .map((g, i) => [i, g] as [number, typeof g])
    .filter(([, g]) => g.seat === me);
  const theirGuesses = view.guesses
    .map((g, i) => [i, g] as [number, typeof g])
    .filter(([, g]) => g.seat === opp);
  const candidates =
    view.phase === "play" || view.phase === "answer"
      ? candidatesFor(view.rules, cluesOf(view, me)).length
      : null;
  const result = view.result;

  let status: string;
  if (result) status = resultText(result, me, view);
  else if (view.phase === "setup")
    status =
      decision?.kind === "commit"
        ? "내 비밀 수를 정하세요. 상대가 이 수를 맞혀야 해요"
        : `${opponent} 쪽에서 비밀 수를 정하는 중…`;
  else if (view.phase === "play")
    status =
      decision?.kind === "guess"
        ? view.solved[opp] && !puzzle
          ? "마지막 기회! 상대가 이미 맞혔어요. 맞히면 비겨요"
          : puzzle
            ? "내 차례 — 컴퓨터 수를 맞혀 보세요"
            : "내 차례 — 상대 수를 맞혀 보세요"
        : online
          ? `${opponent}의 차례`
          : "컴퓨터가 생각하는 중…";
  else if (view.phase === "answer")
    status =
      decision?.kind === "answer"
        ? secret
          ? "답하는 중…"
          : "내 비밀 수를 이 기기에서 찾을 수 없어 답하지 못해요"
        : `${opponent}의 답을 기다리는 중…`;
  else status = "비밀 수를 공개하고 답을 확인하는 중…";

  // 판이 막 끝난 장면이면 가운데에 크게 띄운다(미션은 결과 창이 따로 있다).
  const ended = events.find((e) => e.type === "roundEnded");
  const banner: Banner | null =
    ended?.type === "roundEnded" && !mission
      ? bannerOf(ended.result, me, view)
      : null;
  const outcome =
    result === null
      ? null
      : result.kind === "draw" ||
          (result.kind === "cheat" && result.seat === null)
        ? "draw"
        : result.seat === me
          ? "win"
          : "loss";
  const gameOver = view.phase === "gameOver";
  const roundOver = view.phase === "roundEnd" || gameOver;
  // 온라인: 상대 연결이 끊겼는데 상대 답·공개·비밀 정하기를 기다리면 끝낼 수 있게 한다.
  const waitingOffline =
    online &&
    offlineSeats.includes(opp) &&
    decision === null &&
    (view.phase === "setup" ||
      view.phase === "answer" ||
      view.phase === "reveal");
  const hostRoom = baseballSession.host;
  const wrongMine = view.reveals[me]?.wrongAt ?? null;
  const wrongTheirs = view.reveals[opp]?.wrongAt ?? null;

  return (
    <main
      data-game="baseball"
      className={cn(
        "relative flex min-h-dvh flex-col items-center gap-3 bg-[radial-gradient(ellipse_at_top,#14532d_0%,#052e16_55%,#020617_100%)] px-4 py-3 text-white short-landscape:grid short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] short-landscape:content-start short-landscape:items-start short-landscape:justify-center short-landscape:gap-x-5",
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
          ← 숫자야구
        </button>
        <span className="ml-auto text-white/60">
          {digits}자리{view.rules.zero ? "·0 씀" : ""}
          {puzzle ? " · 퍼즐" : ` · ${view.roundNumber}판째`}
        </span>
      </header>

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
      {waitingOffline && (
        <div
          role="alert"
          className="flex w-full max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl bg-rose-800/80 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          <span>
            {opponent}님 연결이 끊겼어요. 비밀 수는 그 기기에만 있어 컴퓨터가
            대신 답할 수 없어요.
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

      {/* 왼쪽(가로)·위(세로): 자리 표와 기록 */}
      <div className="flex w-full max-w-xl flex-col gap-2 short-landscape:col-start-1 short-landscape:row-start-2 short-landscape:row-span-4 short-landscape:max-w-none">
        <div className="flex gap-2">
          <PlayerPlate view={view} seat={me} name="나" />
          <PlayerPlate view={view} seat={opp} name={opponent} />
        </div>
        {!puzzle && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-black/30 px-3 py-1.5 text-sm">
            <span className="text-white/70">내 비밀 수</span>
            {secret ? (
              <NumberBoxes value={secret.secret} digits={digits} size="sm" />
            ) : (
              <span className="text-white/40">
                {view.commits[me] ? "이 기기에 없음" : "아직 정하지 않음"}
              </span>
            )}
            {secret && !keptOwn && (
              <span className="text-amber-200 text-xs">
                연결이 끊긴 사이 컴퓨터가 정한 수예요(방장 기기도 알 수 있어요)
              </span>
            )}
            {view.commits[opp] && !roundOver && (
              <span className="ml-auto text-white/50 text-xs">
                상대 수는 잠겨 있어요 🔒
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <GuessLog
            title={puzzle ? "내 물음" : "내 물음 → 상대 답"}
            entries={myGuesses}
            digits={digits}
            wrongAt={wrongTheirs}
            empty="아직 묻지 않았어요"
            seat={me}
          />
          {!puzzle && (
            <GuessLog
              title={`${opponent}의 물음 → 내 답`}
              entries={theirGuesses}
              digits={digits}
              wrongAt={wrongMine}
              empty="아직 묻지 않았어요"
              seat={opp}
            />
          )}
        </div>
        {showHints && candidates !== null && (
          <p
            data-candidates={candidates}
            className="px-1 text-white/60 text-xs"
          >
            지금까지 답과 맞는 후보 {candidates}개
          </p>
        )}
      </div>

      {/* 오른쪽(가로)·아래(세로): 입력, 상태, 단추 */}
      {decision?.kind === "commit" && (
        <div className="flex w-full max-w-xl flex-col items-center gap-2 short-landscape:col-start-2 short-landscape:row-start-2">
          <NumberPad
            value={entry}
            onChange={setEntry}
            onSubmit={() => chooseSecret(entry)}
            digits={digits}
            zero={view.rules.zero}
            submitLabel="이 수로 정하기"
            disabled={false}
            extra={
              <button
                type="button"
                onClick={() => setEntry(randomSecret(view.rules))}
                className="flex-1 rounded-xl bg-white/10 py-2 text-sm"
              >
                무작위
              </button>
            }
          />
          <p className="text-center text-white/50 text-xs">
            비밀 수는 이 기기에만 남고, 상대에게는 잠긴 약속만 갑니다
          </p>
        </div>
      )}
      {decision?.kind === "guess" && (
        <div className="w-full max-w-xl short-landscape:col-start-2 short-landscape:row-start-2">
          <NumberPad
            value={entry}
            onChange={setEntry}
            onSubmit={() => {
              const result = submit({ type: "guess", guess: entry });
              if (result.ok) setEntry("");
            }}
            digits={digits}
            zero={view.rules.zero}
            submitLabel="물어보기"
            disabled={false}
          />
        </div>
      )}

      {roundOver && (
        <RevealPanel view={view} me={me} opponent={opponent} book={secrets} />
      )}

      <div className="relative w-full max-w-xl short-landscape:col-start-2">
        <RoundOutcome
          outcome={outcome}
          status={notice ?? status}
          summary={
            puzzle
              ? `${cluesOf(view, me).length}번 물음`
              : `나 ${view.wins[me] ?? 0} : ${view.wins[opp] ?? 0} ${opponent}${view.rules.winsToFinish > 1 ? ` · ${view.rules.winsToFinish}승 먼저` : ""}`
          }
        />
        <ResultBanner banner={banner} seq={view.roundNumber} />
      </div>

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2">
        {(view.phase === "play" ||
          view.phase === "answer" ||
          view.phase === "setup") && (
          <>
            {!online && !mission && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setEntry("");
                  undo();
                }}
                className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
              >
                무르기
              </button>
            )}
            <button
              type="button"
              onClick={() => submit({ type: "resign" })}
              className="rounded-xl bg-white/10 px-4 py-2"
            >
              {puzzle ? "그만두고 답 보기" : "기권"}
            </button>
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
