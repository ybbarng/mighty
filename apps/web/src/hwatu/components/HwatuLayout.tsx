"use client";

import { groupByMonth, sortCards, splitCaptured } from "@mighty/hwatu";

import { cn } from "@/lib/cn";

import { HwatuCardView } from "./HwatuCard";

/*
 * 화투 판의 공통 화면 조각(docs/27): 손패, 바닥, 먹은 패, 더미.
 * 고스톱·민화투·나이롱뽕이 함께 쓴다. 판 배치(누가 어디 앉나)는 게임마다 정한다
 */

/**
 * 손패. 달 순서로 정리해 보인다. 낼 수 있는 카드만 누를 수 있고(나머지는 흐리게), 고른 카드는 살짝 뜬다.
 * 좁은 화면에서는 겹쳐 놓는다(`overlap`)
 */
export function HwatuHand({
  ids,
  playable,
  selected = null,
  onSelect,
  width = 52,
  overlap = false,
  sorted = true,
}: {
  ids: readonly string[];
  /** 낼 수 있는 카드(없으면 모두) */
  playable?: (id: string) => boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  width?: number;
  /** 카드를 겹쳐 놓아 한 줄에 많이 보인다 */
  overlap?: boolean;
  /** 달 순서로 정리해 보인다 */
  sorted?: boolean;
}) {
  const list = sorted ? sortCards(ids) : [...ids];
  return (
    <section
      aria-label="손패"
      className={cn(
        "flex flex-wrap justify-center",
        overlap ? "-space-x-3" : "gap-1",
      )}
    >
      {list.map((id) => {
        const can = playable ? playable(id) : true;
        return (
          <HwatuCardView
            key={id}
            id={id}
            width={width}
            selected={selected === id}
            dim={!can}
            {...(onSelect && can ? { onClick: () => onSelect(id) } : {})}
          />
        );
      })}
    </section>
  );
}

/** 상대 손패: 뒷면만, 장수만 보인다 */
export function HwatuBacks({
  count,
  width = 28,
}: {
  count: number;
  width?: number;
}) {
  return (
    <div role="img" aria-label={`뒷면 ${count}장`} className="flex -space-x-4">
      {Array.from({ length: count }, (_, i) => (
        <HwatuCardView
          // biome-ignore lint/suspicious/noArrayIndexKey: 뒷면은 순서가 곧 정체다
          key={i}
          faceDown
          width={width}
        />
      ))}
    </div>
  );
}

/**
 * 바닥 패. 같은 달끼리 겹쳐 한 묶음으로 보인다(짝 맞추기가 한눈에 보이게).
 * `highlightMonth`의 묶음은 테두리로 강조한다(고른 손패와 짝이 맞는 곳)
 */
export function HwatuFloor({
  ids,
  highlight,
  onPick,
  width = 48,
}: {
  ids: readonly string[];
  /** 강조할 카드(짝이 맞는 바닥 카드) */
  highlight?: (id: string) => boolean;
  /** 바닥 카드를 고른다(같은 달이 둘일 때 어느 것을 먹을지) */
  onPick?: (id: string) => void;
  width?: number;
}) {
  const groups = [...groupByMonth(ids).entries()];
  return (
    <section
      aria-label="바닥"
      className="flex flex-wrap items-start justify-center gap-2"
    >
      {groups.length === 0 && (
        <p className="py-6 text-sm text-white/50">바닥이 비었어요</p>
      )}
      {groups.map(([month, cards]) => (
        <div key={month} data-month={month} className="flex -space-x-7">
          {cards.map((id) => {
            const on = highlight?.(id) ?? false;
            return (
              <HwatuCardView
                key={id}
                id={id}
                width={width}
                highlight={on}
                {...(onPick && on ? { onClick: () => onPick(id) } : {})}
              />
            );
          })}
        </div>
      ))}
    </section>
  );
}

/** 더미: 뒷면 한 장과 남은 장수 */
export function HwatuDeck({
  count,
  width = 44,
}: {
  count: number;
  width?: number;
}) {
  return (
    <div
      role="img"
      className="flex flex-col items-center gap-1"
      aria-label={`더미 ${count}장`}
    >
      {count > 0 ? (
        <HwatuCardView faceDown width={width} />
      ) : (
        <div
          className="rounded-md border border-white/20 border-dashed"
          style={{ width, height: (width * 8) / 5 }}
        />
      )}
      <span className="text-white/70 text-xs tabular-nums">{count}장</span>
    </div>
  );
}

/**
 * 먹은 패. 광·열끗·띠·피로 나눠 겹쳐 보이고 장수를 단다(피는 쌍피를 2로 센다).
 * 점수 계산은 게임마다 다르므로 여기서는 보이기만 한다
 */
export function HwatuCaptured({
  ids,
  width = 30,
  label,
}: {
  ids: readonly string[];
  width?: number;
  /** 누구의 먹은 패인가(화면 읽기 프로그램용) */
  label: string;
}) {
  const split = splitCaptured(ids);
  const groups = [
    { key: "광", cards: split.gwang, count: split.gwang.length },
    { key: "열끗", cards: split.animal, count: split.animal.length },
    { key: "띠", cards: split.ribbon, count: split.ribbon.length },
    { key: "피", cards: split.pi, count: split.piCount },
  ];
  return (
    <section
      aria-label={`${label} 먹은 패`}
      className="flex flex-wrap items-end gap-2"
    >
      {groups.map((g) => (
        <div
          key={g.key}
          data-captured={g.key}
          className="flex flex-col items-start gap-0.5"
        >
          <span className="text-[10px] text-white/70">
            {g.key} {g.count}
          </span>
          <div className="flex -space-x-5">
            {g.cards.length === 0 ? (
              <div
                className="rounded border border-white/15 border-dashed"
                style={{ width, height: (width * 8) / 5 }}
              />
            ) : (
              g.cards.map((id) => (
                <HwatuCardView key={id} id={id} width={width} />
              ))
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
