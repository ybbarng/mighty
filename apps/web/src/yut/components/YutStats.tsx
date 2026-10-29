"use client";

import type { StatsBook } from "@/stats/records";
import { Card, pct, ResultStrip, StatTile } from "@/stats/widgets";

import { summarizeYut } from "../kit";

/** 내 기록(/profile)의 윷놀이 탭. ProfilePage가 `tab === "yut"`일 때 그린다 */
export function YutStats({ book }: { book: StatsBook }) {
  const s = summarizeYut(book.rounds);
  if (s.rounds === 0)
    return (
      <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/60">
        아직 끝낸 윷놀이 판이 없습니다. 한 판 하고 오세요.
      </p>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="승률"
          value={pct(s.wins, s.rounds)}
          sub={`${s.wins}승 ${s.losses}패${s.draws > 0 ? ` ${s.draws}무` : ""}`}
        />
        <StatTile
          label="한 판에 잡은 말"
          value={s.averageCaptures.toFixed(1)}
          sub={`잡힌 말 ${s.averageCaptured.toFixed(1)}`}
        />
        <StatTile
          label="윷 비율"
          value={pct(s.yuts, s.throws)}
          sub={`던지기 ${s.throws}번 중 ${s.yuts}번`}
        />
        <StatTile
          label="모 비율"
          value={pct(s.mos, s.throws)}
          sub={`${s.mos}번`}
        />
      </div>
      <Card title={`최근 ${s.recent.length}판`}>
        <ResultStrip
          title="최근 판 결과(이긴 편 없는 판은 뺀다)"
          results={s.recent.filter((r) => r !== 0).map((r) => ({ won: r > 0 }))}
        />
      </Card>
    </>
  );
}
