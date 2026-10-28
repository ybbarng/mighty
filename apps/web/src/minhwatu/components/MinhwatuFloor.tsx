"use client";

import { groupByMonth } from "@mighty/hwatu";

import { HwatuCardView } from "@/hwatu/components/HwatuCard";

/**
 * 바닥 패. 공통 `HwatuFloor`와 같이 같은 달끼리 겹쳐 묶되, 겹침을 카드 너비에 맞춘다(너비의 45%).
 * 공통 조각은 겹침이 28px로 정해져 있어 휴대폰 가로처럼 카드가 작으면 아래 카드를 누를 수 없다.
 * 고를 수 있는 카드는 위로 올려 누르기 쉽게 한다. 공통 조각이 고쳐지면 그것으로 바꾼다(docs/29 9절)
 */
export function MinhwatuFloor({
  ids,
  highlight,
  onPick,
  width = 48,
}: {
  ids: readonly string[];
  highlight?: (id: string) => boolean;
  onPick?: (id: string) => void;
  width?: number;
}) {
  const groups = [...groupByMonth(ids).entries()];
  const overlap = Math.round(width * 0.45);
  return (
    <section
      aria-label="바닥"
      className="flex flex-wrap items-start justify-center gap-2"
    >
      {groups.length === 0 && (
        <p className="py-6 text-sm text-white/50">바닥이 비었어요</p>
      )}
      {groups.map(([month, cards]) => (
        <div key={month} data-month={month} className="flex">
          {cards.map((id, i) => {
            const on = highlight?.(id) ?? false;
            return (
              <span
                key={id}
                className="relative inline-flex"
                style={{
                  marginLeft: i === 0 ? 0 : -overlap,
                  zIndex: on ? 10 : i,
                }}
              >
                <HwatuCardView
                  id={id}
                  width={width}
                  highlight={on}
                  {...(onPick && on ? { onClick: () => onPick(id) } : {})}
                />
              </span>
            );
          })}
        </div>
      ))}
    </section>
  );
}
