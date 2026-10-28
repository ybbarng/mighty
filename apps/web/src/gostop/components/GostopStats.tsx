"use client";

import { BAK_NAMES, type Bak } from "@mighty/gostop-engine";

import type { StatsBook } from "@/stats/records";
import { Card, pct, RateBar, ResultStrip, StatTile } from "@/stats/widgets";

import { summarizeGostop } from "../kit";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

/** 내 기록의 고스톱 탭(`stats/ProfilePage.tsx`가 탭을 더해 그린다) */
export function GostopStats({ book }: { book: StatsBook }) {
  const s = summarizeGostop(book.rounds);
  if (s.rounds === 0)
    return (
      <Card title="아직 기록이 없습니다">
        <p className="text-sm text-white/70">
          고스톱을 한 판 끝까지 치면 여기에 쌓입니다. 혼자 하기와 친구와 하기를
          모두 기록하고, 배우기는 기록하지 않습니다.
        </p>
      </Card>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="판 승률"
          value={pct(s.wins, s.rounds)}
          sub={`${s.wins}승 ${s.losses}패 · 나가리 ${s.nagari}`}
        />
        <StatTile
          label="판마다 점수"
          value={signed(s.average)}
          sub="이긴 판 +, 진 판 −"
        />
        <StatTile label="가장 크게 이긴 판" value={`${s.best}점`} />
        <StatTile
          label="고 부른 판"
          value={s.went.n}
          sub={`그중 이김 ${s.went.won}판`}
        />
      </div>
      <Card title="고를 불렀을 때">
        <RateBar label="고 성공" won={s.went.won} n={s.went.n} />
      </Card>
      <Card title="진 판에서 쓴 박">
        <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
          {(Object.keys(s.baks) as Bak[]).map((b) => (
            <li key={b} className="rounded-lg bg-white/5 px-3 py-2">
              {BAK_NAMES[b]} <b className="tabular-nums">{s.baks[b]}</b>번
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`최근 ${s.recent.length}판`}>
        <ResultStrip
          title="최근 판 결과"
          results={s.recent.filter((r) => r !== 0).map((r) => ({ won: r > 0 }))}
        />
      </Card>
    </>
  );
}
