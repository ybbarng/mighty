"use client";

import type { PlayerView, SeatRecord } from "@mighty/engine";

import { cn } from "@/lib/cn";

function rate(wins: number, losses: number): string {
  const total = wins + losses;
  return total === 0
    ? "—"
    : `${wins}/${losses} (${Math.round((wins * 100) / total)}%)`;
}

function totalOf(r: SeatRecord): [number, number] {
  return [
    r.declarerWins + r.friendWins + r.oppositionWins,
    r.declarerLosses + r.friendLosses + r.oppositionLosses,
  ];
}

/** 점수판: 이름, 돈, 등수, 이번 게임 전적(주공·프렌드·야당·전체 승/패). 원작 DScoreBoard와 같은 정보 */
export function Scoreboard({
  view,
  seatName,
  onClose,
}: {
  view: PlayerView;
  seatName: (seat: number) => string;
  onClose: () => void;
}) {
  const ranked = [...view.order].sort(
    (a, b) => (view.money[b] ?? 0) - (view.money[a] ?? 0),
  );
  const rankOf = (seat: number) =>
    view.order.filter((s) => (view.money[s] ?? 0) > (view.money[seat] ?? 0))
      .length + 1;
  return (
    <div
      className="fixed inset-0 z-[400] flex justify-end bg-black/50"
      onPointerDown={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto bg-felt-dark p-4 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">점수판 · {view.roundNumber}판</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            닫기
          </button>
        </div>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs opacity-60">
            <tr>
              <th className="py-1">등수</th>
              <th>이름</th>
              <th className="text-right">돈</th>
              <th className="text-right">주공</th>
              <th className="text-right">프렌드</th>
              <th className="text-right">야당</th>
              <th className="text-right">전체</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((seat) => {
              const r = view.records[seat] as SeatRecord;
              const [w, l] = totalOf(r);
              return (
                <tr
                  key={seat}
                  className={cn(
                    "border-white/10 border-t",
                    seat === view.seat && "font-bold text-amber-200",
                  )}
                >
                  <td className="py-1.5">{rankOf(seat)}</td>
                  <td>{seatName(seat)}</td>
                  <td className="text-right">{(view.money[seat] ?? 0) * 10}</td>
                  <td className="text-right text-xs">
                    {rate(r.declarerWins, r.declarerLosses)}
                  </td>
                  <td className="text-right text-xs">
                    {rate(r.friendWins, r.friendLosses)}
                  </td>
                  <td className="text-right text-xs">
                    {rate(r.oppositionWins, r.oppositionLosses)}
                  </td>
                  <td className="text-right text-xs">{rate(w, l)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs opacity-50">
          돈은 한 사람당 1000에서 시작합니다. 누군가 0이 되면 게임이 끝납니다.
          승/패 옆 숫자는 승률입니다.
        </p>
      </div>
    </div>
  );
}
