"use client";

import { cn } from "@/lib/cn";

/**
 * 종이 점수판. 대학 때 손으로 적던 것처럼 판마다 한 줄씩 적고 맨 아래에 합계를 둔다.
 * 문 슛한 판은 표시한다.
 */
export function ScoreSheet({
  names,
  history,
  scores,
  endScore,
  mySeat,
  onClose,
}: {
  names: string[];
  history: number[][];
  scores: number[];
  endScore: number;
  mySeat: number;
  onClose: () => void;
}) {
  const low = Math.min(...scores);
  return (
    <div
      className="fixed inset-0 z-[450] flex items-center justify-center bg-black/50 p-4"
      onPointerDown={onClose}
    >
      <div
        role="dialog"
        aria-label="점수판"
        className="pop-in flex max-h-[85dvh] w-full max-w-sm flex-col gap-3 rounded-xl bg-[#fbf6e9] p-5 text-stone-800 shadow-2xl"
        style={{
          backgroundImage:
            "repeating-linear-gradient(transparent 0 27px, rgba(70,110,180,0.18) 27px 28px)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-card-serif)] font-bold text-lg">
            점수판
          </h2>
          <span className="text-xs opacity-70">{endScore}점이 넘으면 끝</span>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full table-fixed text-center font-[family-name:var(--font-card-serif)] tabular-nums">
            <thead>
              <tr className="border-stone-500 border-b-2">
                <th className="w-8 text-xs font-normal">판</th>
                {names.map((name, seat) => (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: 자리 순서가 곧 정체다
                    key={seat}
                    className={cn(
                      "truncate px-1 py-1 text-sm",
                      seat === mySeat && "text-red-700",
                    )}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((points, round) => {
                const moon = points.filter((p) => p >= 26).length === 3;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 판 번호가 곧 정체다
                  <tr key={round} className="h-7">
                    <td className="text-xs opacity-60">
                      {round + 1}
                      {moon ? "🌙" : ""}
                    </td>
                    {points.map((p, seat) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: 자리 순서가 곧 정체다
                        key={seat}
                        className={cn(p === 0 && "opacity-40")}
                      >
                        {p}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr className="h-7">
                  <td colSpan={5} className="text-sm opacity-50">
                    아직 끝난 판이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-stone-500 border-t-2 font-bold">
                <td className="text-xs font-normal">합</td>
                {scores.map((score, seat) => (
                  <td
                    // biome-ignore lint/suspicious/noArrayIndexKey: 자리 순서가 곧 정체다
                    key={seat}
                    className={cn(
                      "py-1",
                      score === low && history.length > 0 && "text-emerald-700",
                      score >= endScore && "text-red-700",
                    )}
                  >
                    {score}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-stone-800 py-2 text-sm text-white"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
