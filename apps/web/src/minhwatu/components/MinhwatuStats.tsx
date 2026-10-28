"use client";

import { YAK_NAMES, type YakId } from "@mighty/minhwatu-engine";

import type { StatsBook } from "@/stats/records";
import { Card, Counts, pct, StatTile, TrendLine } from "@/stats/widgets";

import { summarizeMinhwatu } from "../stats";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

/** 내 기록의 민화투 탭: 판 평균 점수·1등·약 */
export function MinhwatuStats({ book }: { book: StatsBook }) {
  const s = summarizeMinhwatu(book.rounds, book.games);
  if (s.rounds === 0)
    return (
      <Card title="아직 기록이 없습니다">
        <p className="text-sm text-white/70">
          민화투를 한 판 끝까지 치면 여기에 쌓입니다. 혼자 하기와 친구와 하기를
          모두 기록하고, 배우기는 기록하지 않습니다.
        </p>
      </Card>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="판 평균 점수"
          value={signed(s.average)}
          sub={`${s.rounds}판`}
        />
        <StatTile
          label="판 1등"
          value={pct(s.firsts, s.rounds)}
          sub={`${s.firsts}판`}
        />
        <StatTile
          label="게임 1등"
          value={pct(s.wins, s.games)}
          sub={`${s.wins}승 / ${s.games}게임`}
        />
        <StatTile
          label="평균 카드 점수"
          value={s.averageCards.toFixed(0)}
          sub={`가장 높은 판 ${s.best ?? 0}점`}
        />
      </div>
      <Card title="이룬 약">
        <Counts
          items={(Object.keys(YAK_NAMES) as YakId[]).map((id) => ({
            label: YAK_NAMES[id],
            value: s.yaks[id] ?? 0,
          }))}
        />
      </Card>
      <Card title={`최근 ${s.recent.length}판 점수`}>
        <TrendLine values={s.recent} unit="점" label="판 점수" />
      </Card>
    </>
  );
}
