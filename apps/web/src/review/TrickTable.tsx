import { CardChip } from "./CardChip";

export interface TrickRow {
  leader: number;
  plays: { seat: number; card: string }[];
  winner: number;
}

/** 턴 표: 행 = 턴, 열 = 자리. 선은 테두리, 먹은 사람은 금색 테두리 */
export function TrickTable({
  tricks,
  seats,
  name,
  mark,
}: {
  tricks: readonly TrickRow[];
  seats: readonly number[];
  name: (seat: number) => string;
  /** 칸에 덧붙일 표시(마이티·조커 등) */
  mark?: (card: string) => string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-center text-xs">
        <thead className="text-white/60">
          <tr>
            <th className="px-1 py-1 text-left font-normal">턴</th>
            {seats.map((s) => (
              <th key={s} className="px-1 py-1 font-normal">
                <span className="block max-w-16 truncate">{name(s)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tricks.map((t, i) => (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: 턴 순서가 곧 정체다
              key={i}
              className="border-white/10 border-t"
            >
              <td className="px-1 py-1 text-left text-white/60">{i + 1}</td>
              {seats.map((s) => {
                const play = t.plays.find((p) => p.seat === s);
                const extra = play && mark?.(play.card);
                return (
                  <td key={s} className="px-1 py-1">
                    {play ? (
                      <span
                        className={
                          s === t.leader
                            ? "inline-flex flex-col items-center rounded border border-white/40 px-0.5"
                            : "inline-flex flex-col items-center"
                        }
                      >
                        <CardChip card={play.card} strong={s === t.winner} />
                        {extra && (
                          <span className="text-[9px] text-amber-200">
                            {extra}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-white/30">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-white/45">
        흰 테두리 = 선, 금색 테두리 = 그 턴을 먹은 카드
      </p>
    </div>
  );
}
