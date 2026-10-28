"use client";

import type { StatsBook } from "@/stats/records";
import { Card, pct, RateBar, ResultStrip, StatTile } from "@/stats/widgets";

import { summarizeChess } from "../kit";

/** 내 기록(/profile)의 체스 탭. ProfilePage가 `tab === "chess"`일 때 그린다 */
export function ChessStats({ book }: { book: StatsBook }) {
  const s = summarizeChess(book.rounds);
  if (s.rounds === 0)
    return (
      <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/60">
        아직 끝낸 체스 판이 없습니다. 한 판 두고 오세요.
      </p>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="판 승률"
          value={pct(s.wins, s.rounds)}
          sub={`${s.wins}승 ${s.draws}무 ${s.losses}패`}
        />
        <StatTile
          label="평균 수"
          value={(s.averageMoves / 2).toFixed(0)}
          sub="판마다 백·흑 한 번씩을 한 수로"
        />
        <StatTile
          label="체크메이트로 이김"
          value={s.byCheckmate}
          sub={`시간승 ${s.byTime}판`}
        />
        <StatTile label="기권승" value={s.byResign} sub="상대가 기권한 판" />
      </div>
      <Card title="색별 승률">
        <RateBar label="백(먼저)" won={s.white.won} n={s.white.n} />
        <RateBar label="흑" won={s.black.won} n={s.black.n} />
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
