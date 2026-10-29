"use client";

import type { StatsBook } from "@/stats/records";
import { Card, pct, RateBar, ResultStrip, StatTile } from "@/stats/widgets";

import { summarizeBaseball } from "../kit";

/** 내 기록(/profile)의 숫자야구 탭. ProfilePage가 `tab === "baseball"`일 때 그린다 */
export function BaseballStats({ book }: { book: StatsBook }) {
  const s = summarizeBaseball(book.rounds);
  if (s.rounds === 0)
    return (
      <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/60">
        아직 끝낸 숫자야구 판이 없습니다. 한 판 하고 오세요.
      </p>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="판 승률"
          value={pct(s.wins, s.rounds)}
          sub={`${s.wins}승 ${s.losses}패 ${s.draws}무`}
        />
        <StatTile
          label="맞힌 평균 물음"
          value={s.averageGuesses === 0 ? "-" : s.averageGuesses.toFixed(1)}
          sub="서로 맞히기에서 맞힌 판"
        />
        <StatTile
          label="퍼즐 평균"
          value={s.puzzle.solved === 0 ? "-" : s.puzzle.average.toFixed(1)}
          sub={
            s.puzzle.best === null
              ? `${s.puzzle.n}판`
              : `가장 적게 ${s.puzzle.best}번 · ${s.puzzle.solved}/${s.puzzle.n}판 풂`
          }
        />
        <StatTile
          label="거짓 답 잡음"
          value={s.byCheat}
          sub="상대 답이 비밀과 달라 이긴 판"
        />
      </div>
      <Card title="선·후공 승률(서로 맞히기)">
        <RateBar label="먼저 물음" won={s.first.won} n={s.first.n} />
        <RateBar label="나중에 물음" won={s.second.won} n={s.second.n} />
      </Card>
      <Card title={`최근 ${s.recent.length}판`}>
        <ResultStrip
          title="최근 판 결과(비긴 판은 뺀다)"
          results={s.recent.filter((r) => r !== 0).map((r) => ({ won: r > 0 }))}
        />
      </Card>
    </>
  );
}
