"use client";

import type { MatchState } from "@mighty/engine";
import type { MatchState as HeartsState } from "@mighty/hearts-engine";
import { useEffect, useMemo, useState } from "react";

import { botName } from "@/game/bot-names";
import type { GameKit } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";
import { useSettings } from "@/game/settings";
import { heartsKit } from "@/hearts/kit";

import {
  deleteArchive,
  type GameArchive,
  listArchives,
  loadArchive,
} from "./archive";
import { HeartsRound } from "./HeartsRound";
import { MightyRound } from "./MightyRounds";
import { ReplayView } from "./ReplayView";
import { replayArchive } from "./replay";
import { roundSpans } from "./rounds";

type AnyKit = GameKit<unknown, unknown, unknown, unknown, unknown, unknown>;

const GAME_NAME: Record<string, string> = {
  mighty: "♠ 마이티",
  hearts: "♥ 하트",
};

function when(at: number): string {
  return new Date(at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 복기: 이 기기에 남긴 게임 목록 → 판마다 한눈에 보기(주공·공약·돈·턴 표) → 다시 보기(게임 화면으로 한 걸음씩).
 * 주소 `?id=`가 있으면 그 게임을 연다
 */
export function ReviewPage() {
  const [list, setList] = useState<GameArchive[] | null>(null);
  const [archive, setArchive] = useState<GameArchive | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id)
      void loadArchive(id).then((a) => {
        if (a) setArchive(a);
        else setMissing(true);
      });
    void listArchives().then(setList);
  }, []);

  if (archive)
    return (
      <ArchiveView
        archive={archive}
        onBack={() => {
          setArchive(null);
          window.history.replaceState(null, "", "/review");
        }}
      />
    );

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">지난 게임 복기</h1>
          <a
            href="/profile"
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
          >
            ← 내 기록
          </a>
        </div>
        {missing && (
          <p className="text-sm text-rose-300">
            그 게임 기록이 이 기기에 없습니다.
          </p>
        )}
        <p className="text-sm text-white/60">
          판이 끝날 때마다 이 기기에 남깁니다(최근 50게임). 혼자 하기와 친구와
          하기(방장)를 남기고, 배우기는 남기지 않습니다.
        </p>
        {list === null ? null : list.length === 0 ? (
          <p className="rounded-2xl bg-black/35 p-4 text-sm text-white/70">
            아직 남긴 게임이 없습니다. 한 판을 끝까지 두면 여기에 생깁니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-2xl bg-black/35 px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    setArchive(a);
                    window.history.replaceState(
                      null,
                      "",
                      `/review?id=${encodeURIComponent(a.id)}`,
                    );
                  }}
                  className="flex min-w-0 flex-1 flex-col text-left"
                >
                  <span className="font-semibold">
                    {GAME_NAME[a.game] ?? a.game} ·{" "}
                    {a.mode === "solo" ? "혼자" : "친구와"}
                  </span>
                  <span className="text-white/60 text-xs">
                    {when(a.startedAt)} · {a.rounds}판
                    {a.over ? " · 끝남" : " · 하던 중"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void deleteArchive(a.id).then(() =>
                      setList((l) => l?.filter((x) => x.id !== a.id) ?? null),
                    )
                  }
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                >
                  지우기
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ArchiveView({
  archive,
  onBack,
}: {
  archive: GameArchive;
  onBack: () => void;
}) {
  const botNames = useSettings((s) => s.botNames);
  const hearts = archive.game === "hearts";
  const kit = (hearts ? heartsKit : mightyKit) as unknown as AnyKit;
  const replayed = useMemo(() => replayArchive(kit, archive), [kit, archive]);
  const spans = useMemo(
    () =>
      roundSpans(
        replayed.events as { type: string }[][],
        (i) => (replayed.states[i] as { roundNumber: number }).roundNumber,
      ),
    [replayed],
  );
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const name = (seat: number) =>
    seat === archive.seat
      ? "나"
      : (archive.seatNames?.[seat] ?? botName(botNames, seat));

  if (replayAt !== null)
    return (
      <ReplayView
        game={archive.game}
        replayed={replayed}
        seat={archive.seat}
        seatNames={archive.seatNames}
        spans={spans}
        startIndex={replayAt}
        name={name}
        onExit={() => setReplayAt(null)}
      />
    );

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
          >
            ← 목록
          </button>
          <button
            type="button"
            onClick={() => setReplayAt(0)}
            className="rounded-lg bg-amber-300 px-3 py-1 font-semibold text-black text-sm"
          >
            ▶ 처음부터 다시 보기
          </button>
        </div>
        <h1 className="font-black text-xl">
          {GAME_NAME[archive.game] ?? archive.game} ·{" "}
          {archive.mode === "solo" ? "혼자" : "친구와"} ·{" "}
          {when(archive.startedAt)}
        </h1>
        {replayed.error && (
          <p className="text-sm text-rose-300">{replayed.error}</p>
        )}
        {[...spans]
          .reverse()
          .map((span) =>
            hearts ? (
              <HeartsRound
                key={span.start}
                span={span}
                states={replayed.states as HeartsState[]}
                seat={archive.seat}
                name={name}
                onReplay={setReplayAt}
              />
            ) : (
              <MightyRound
                key={span.start}
                span={span}
                states={replayed.states as MatchState[]}
                seat={archive.seat}
                name={name}
                onReplay={setReplayAt}
              />
            ),
          )}
      </div>
    </main>
  );
}
