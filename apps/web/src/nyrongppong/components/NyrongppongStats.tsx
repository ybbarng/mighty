"use client";

import type { StatsBook } from "@/stats/records";
import { Card, pct, ResultStrip, StatTile } from "@/stats/widgets";

import { summarizeNyrongppong } from "../kit";

/** 내 기록의 나이롱뽕 탭(ProfilePage가 탭으로 붙인다) */
export function NyrongppongStats({ book }: { book: StatsBook }) {
  const s = summarizeNyrongppong(book.rounds, book.games);
  if (s.rounds === 0)
    return (
      <Card title="아직 기록이 없습니다">
        <p className="text-sm text-white/70">
          나이롱뽕을 한 판 끝까지 하면 여기에 쌓입니다. 혼자 하기와 친구와
          하기를 모두 기록하고, 배우기는 기록하지 않습니다.
        </p>
      </Card>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="판 1등"
          value={pct(s.wins, s.rounds)}
          sub={`${s.rounds}판 가운데 ${s.wins}판`}
        />
        <StatTile
          label="게임 1등"
          value={pct(s.gameWins, s.games)}
          sub={`${s.games}게임 가운데 ${s.gameWins}번`}
        />
        <StatTile
          label="판 평균 점수"
          value={s.averageScore.toFixed(1)}
          sub="낮을수록 좋다"
        />
        <StatTile
          label="판 평균 뽕"
          value={s.averagePpongs.toFixed(1)}
          sub={`바가지 ${s.bagaji}번`}
        />
      </div>
      <Card title="내가 끝낸 판">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="약" value={s.byYak} />
          <StatTile label="박" value={s.byOut} />
          <StatTile label="스톱 성공" value={s.byStop} />
        </div>
      </Card>
      <Card title={`최근 ${s.recent.length}판`}>
        <ResultStrip
          title="최근 판 결과"
          results={s.recent.map((r) => ({ won: r > 0 }))}
        />
      </Card>
    </>
  );
}
