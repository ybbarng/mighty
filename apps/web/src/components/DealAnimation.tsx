"use client";

import { useEffect, useState } from "react";

import { dealPlan, FLIGHT_MS, SETTLE_MS, SHUFFLE_MS } from "@/game/timing";
import type { Point, Size } from "@/layout/compute-layout";

import { PlayingCard } from "./PlayingCard";

interface DealAnimationProps {
  center: Point;
  card: Size;
  /** 선부터 차례로, 카드를 받을 곳 */
  targets: Point[];
  handSize: number;
  kittyCount: number;
  /** 다른 연출(딜미스 알림 등)이 끝난 뒤 시작한다 */
  startDelay: number;
}

type Stage =
  | "stack"
  | "split"
  | "merge"
  | "split2"
  | "merge2"
  | "deal"
  | "settle";

/** 판 시작 연출: 가운데 덱을 두 번 섞고 선부터 2·3·3·2장 묶음으로 나눠 준다 */
export function DealAnimation({
  center,
  card,
  targets,
  handSize,
  kittyCount,
  startDelay,
}: DealAnimationProps) {
  const [stage, setStage] = useState<Stage>("stack");
  const total = handSize * targets.length;
  const { flights } = dealPlan(handSize, targets.length);
  const lastFlight = flights.at(-1)?.delay ?? 0;

  useEffect(() => {
    const step = SHUFFLE_MS / 4;
    const plan: [Stage, number][] = [
      ["split", startDelay],
      ["merge", startDelay + step],
      ["split2", startDelay + step * 2],
      ["merge2", startDelay + step * 3],
      ["deal", startDelay + SHUFFLE_MS],
      ["settle", startDelay + SHUFFLE_MS + lastFlight + FLIGHT_MS],
    ];
    const timers = plan.map(([s, at]) => setTimeout(() => setStage(s), at));
    return () => timers.forEach(clearTimeout);
  }, [startDelay, lastFlight]);

  const count = total + kittyCount;
  const split = stage === "split" || stage === "split2";
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        // 아래부터 쌓는다. 키티는 맨 아래에 남고, 나눠 줄 카드는 맨 위부터 나간다.
        const isKitty = i < kittyCount;
        const order = count - 1 - i;
        const flight = isKitty ? undefined : flights[order];
        const dealing = stage === "deal" || stage === "settle";
        const dealt = dealing && !isKitty;
        const half = i % 2 === 0 ? -1 : 1;
        const stack = i * 0.35;
        const at = dealt
          ? {
              ...(targets[flight?.player ?? 0] as Point),
              scale: 0.55,
              opacity: 0.9,
            }
          : {
              x: center.x + (split ? half * card.w * 0.62 : 0),
              y: center.y - stack,
              // 다 나눈 뒤 남은 키티는 제자리에서 흐려진다.
              scale: stage === "settle" ? 0.85 : 1,
              opacity: stage === "settle" ? 0 : 1,
            };
        return (
          <PlayingCard
            // biome-ignore lint/suspicious/noArrayIndexKey: 덱 연출용 뒷면 카드는 순서가 곧 정체다
            key={i}
            card={null}
            width={card.w}
            height={card.h}
            at={at}
            rotate={split ? half * 6 : 0}
            z={dealt ? 100 + order : 10 + i}
            delay={dealt ? (flight?.delay ?? 0) : 0}
            duration={dealt ? FLIGHT_MS : stage === "settle" ? SETTLE_MS : 400}
          />
        );
      })}
    </>
  );
}
