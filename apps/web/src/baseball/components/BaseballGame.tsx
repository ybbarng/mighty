"use client";

import {
  type BaseballView,
  candidatesFor,
  cluesOf,
  commitmentOf,
  type RoundResult,
} from "@mighty/baseball-engine";
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

import { scoreText } from "../kit";
import { mySecret, randomSecret, type SecretBook } from "../secret";
import { baseballSession } from "../session";
import { BASEBALL_LEVELS, useBaseballSettings } from "../settings";
import { useBaseball } from "../store";
import { type DigitMemo, GuessLog, NumberBoxes, NumberPad } from "./parts";
import { Infield, PitchCall, Scoreboard, usePitchCalls } from "./scoreboard";

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
    <div className="flex w-full max-w-xl flex-col gap-1.5 rounded-xl border border-white/10 bg-black/40 p-3 split:col-start-2">
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

/** 휴대폰 세로에서 기록 탭 이름: 회 수와 마지막 답 */
function tabLabel(
  title: string,
  entries: [number, BaseballView["guesses"][number]][],
  digits: number,
): string {
  const last = entries.at(-1)?.[1];
  if (!last) return title;
  const answer =
    last.strikes === null || last.balls === null
      ? "…"
      : scoreText(last.strikes, last.balls, digits);
  return `${title} ${entries.length} · ${answer}`;
}

/** 대국 화면: 위(가로는 왼쪽)에 전광판과 두 팀 기록, 아래(가로는 오른쪽)에 타석과 숫자 패드 */
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
  const [memo, setMemo] = useState<DigitMemo>({});
  const [tab, setTab] = useState<"mine" | "theirs">("mine");
  const calls = usePitchCalls(view, host?.seat ?? 0);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 2200);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // 판이 바뀌거나 비밀 정하기가 끝나면 넣던 수와 메모를 비운다.
  // 상대 차례에도 다음에 물을 수를 미리 넣어 둘 수 있게, 묻기 차례가 바뀌어도 비우지 않는다.
  const round = view?.roundNumber;
  const setup = view?.phase === "setup";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 판·비밀 정하기가 바뀔 때만 비운다
  useEffect(() => setEntry(""), [round, setup]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 판이 바뀔 때만 비운다
  useEffect(() => setMemo({}), [round]);

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
    showHints && (view.phase === "play" || view.phase === "answer")
      ? candidatesFor(view.rules, cluesOf(view, me)).length
      : null;
  const result = view.result;
  const playing = view.phase === "play" || view.phase === "answer";

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
  const batting = playing ? view.turn : null;
  const myTurn = decision?.kind === "guess";

  const names = [] as string[];
  names[me] = "나";
  names[opp] = puzzle ? "컴퓨터" : opponent;
  // 선이 원정(초 공격), 후공이 홈(말 공격)
  const badgeOf = (seat: number) =>
    puzzle ? undefined : seat === view.starter ? "원정·초" : "홈·말";

  const secretLine = puzzle ? null : (
    <span className="flex items-center gap-1.5">
      <span className="text-white/60">내 비밀 수</span>
      {secret ? (
        <NumberBoxes value={secret.secret} digits={digits} size="sm" />
      ) : (
        <span className="text-white/40">
          {view.commits[me] ? "이 기기에 없음" : "아직 정하지 않음"}
        </span>
      )}
    </span>
  );
  const secretNote = (
    <>
      {secret && !keptOwn && (
        <span className="basis-full text-amber-200 text-xs">
          연결이 끊긴 사이 컴퓨터가 정한 수예요(방장 기기도 알 수 있어요)
        </span>
      )}
      {!puzzle && view.commits[opp] && !roundOver && candidates === null && (
        <span className="ml-auto text-white/50">상대 수는 잠겨 있어요 🔒</span>
      )}
    </>
  );

  const myLog = (
    <GuessLog
      title={puzzle ? "내 물음" : "내 공격 · 내 물음"}
      entries={myGuesses}
      digits={digits}
      wrongAt={wrongTheirs}
      empty="아직 묻지 않았어요"
      seat={me}
      side="mine"
      batting={batting === me}
      badge={badgeOf(me)}
      className={cn(
        "max-h-52 split:max-h-[max(8rem,calc(100dvh-15.5rem))]",
        !puzzle && tab !== "mine" && "max-sm:hidden",
      )}
    />
  );
  const theirLog = puzzle ? null : (
    <GuessLog
      title={`${opponent} 공격`}
      entries={theirGuesses}
      digits={digits}
      wrongAt={wrongMine}
      empty="아직 묻지 않았어요"
      seat={opp}
      side="theirs"
      batting={batting === opp}
      badge={badgeOf(opp)}
      className={cn(
        "max-h-52 split:max-h-[max(8rem,calc(100dvh-15.5rem))]",
        tab !== "theirs" && "max-sm:hidden",
      )}
    />
  );
  // 기록은 원정(선)이 왼쪽, 홈이 오른쪽
  const logs =
    !puzzle && view.starter === opp ? [theirLog, myLog] : [myLog, theirLog];

  const showPad = decision?.kind === "commit" || playing;

  return (
    <main
      data-game="baseball"
      className={cn(
        "ballpark relative isolate flex min-h-dvh flex-col items-center gap-3 overflow-x-clip px-4 py-3 text-white split:grid split:grid-cols-[minmax(0,40rem)_minmax(0,21rem)] split:content-start split:items-start split:justify-center split:gap-x-5 lg:gap-x-8 lg:py-5",
        mission && "pt-16",
      )}
    >
      <Infield className="absolute bottom-0 left-1/2 -z-10 w-[min(46rem,150vw)] max-w-none -translate-x-1/2 opacity-30 split:w-[min(60rem,100vw)] split:opacity-25" />
      {mission && <MissionOverlay mission={mission} top={8} />}
      <header className="flex w-full max-w-xl items-center gap-2 text-sm split:col-span-2 split:max-w-none">
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
          {!puzzle && view.rules.winsToFinish > 1
            ? ` · ${view.rules.winsToFinish}승 먼저`
            : ""}
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

      {/* 위(세로)·왼쪽(가로): 전광판과 두 팀 기록 */}
      <div className="flex w-full max-w-xl flex-col gap-2 split:col-start-1 split:row-span-6 split:row-start-2 split:max-w-none">
        <Scoreboard
          view={view}
          me={me}
          names={names}
          secret={secretLine}
          secretNote={secretNote}
          candidates={candidates}
        />
        {!puzzle && !setup && (
          <div
            role="tablist"
            aria-label="기록"
            className="grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1 text-xs sm:hidden"
          >
            {(
              [
                ["mine", tabLabel("내 공격", myGuesses, digits)],
                ["theirs", tabLabel("상대 공격", theirGuesses, digits)],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "truncate rounded-lg px-2 py-1.5",
                  tab === k
                    ? "bg-white font-semibold text-black"
                    : "text-white/70",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!setup && <div className="flex gap-2">{logs}</div>}
      </div>

      {/* 아래(세로)·오른쪽(가로): 타석과 숫자 패드, 상태, 단추 */}
      {showPad && (
        <div className="flex w-full max-w-xl flex-col items-center gap-2 split:col-start-2 split:row-start-2">
          {decision?.kind === "commit" ? (
            <>
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
                    className="flex-1 rounded-xl border border-white/10 bg-black/35 py-2 text-sm"
                  >
                    무작위
                  </button>
                }
              />
              <p className="text-center text-white/50 text-xs">
                비밀 수는 이 기기에만 남고, 상대에게는 잠긴 약속만 갑니다
              </p>
            </>
          ) : (
            <NumberPad
              value={entry}
              onChange={setEntry}
              onSubmit={() => {
                if (!myTurn) return;
                const result = submit({ type: "guess", guess: entry });
                if (result.ok) setEntry("");
              }}
              digits={digits}
              zero={view.rules.zero}
              submitLabel={myTurn ? "물어보기" : "상대 차례…"}
              disabled={false}
              submitDisabled={!myTurn}
              memo={memo}
              onMemo={setMemo}
            />
          )}
        </div>
      )}

      {roundOver && (
        <RevealPanel view={view} me={me} opponent={opponent} book={secrets} />
      )}

      <div className="relative w-full max-w-xl split:col-start-2">
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

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 split:col-start-2">
        {(playing || view.phase === "setup") && (
          <>
            {!online && !mission && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setEntry("");
                  undo();
                }}
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

      {calls.current && (
        <PitchCall
          key={calls.current.id}
          call={calls.current}
          busy={calls.busy}
          onDone={calls.next}
        />
      )}
    </main>
  );
}
