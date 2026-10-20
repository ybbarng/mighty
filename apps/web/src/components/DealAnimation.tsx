"use client";

import { useEffect, useState } from "react";

import { dealPlan, SHUFFLE_MS } from "@/game/timing";
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

type Stage = "stack" | "split" | "merge" | "split2" | "merge2" | "deal";

/** 판 시작 연출: 가운데 덱을 두 번 섞고 선부터 한 장씩 나눠 준다 */
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

  useEffect(() => {
    const step = SHUFFLE_MS / 4;
    const plan: [Stage, number][] = [
      ["split", startDelay],
      ["merge", startDelay + step],
      ["split2", startDelay + step * 2],
      ["merge2", startDelay + step * 3],
      ["deal", startDelay + SHUFFLE_MS],
    ];
    const timers = plan.map(([s, at]) => setTimeout(() => setStage(s), at));
    return () => timers.forEach(clearTimeout);
  }, [startDelay]);

  const count = total + kittyCount;
  const split = stage === "split" || stage === "split2";
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const dealt = stage === "deal" && i < total;
        // 덱 맨 위부터 나눠 주므로 위에 쌓인 카드(번호가 큰 쪽)를 먼저 보낸다.
        const order = total - 1 - i;
        const flight = flights[order];
        const half = i % 2 === 0 ? -1 : 1;
        const stack = Math.min(i, 20) * 0.4;
        const at = dealt
          ? {
              ...(targets[flight?.player ?? 0] as Point),
              scale: 0.55,
              opacity: 0.9,
            }
          : {
              x: center.x + (split ? half * card.w * 0.62 : 0),
              y: center.y - stack,
              scale: 1,
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
            z={dealt ? 50 + order : 10 + i}
            delay={dealt ? (flight?.delay ?? 0) : 0}
          />
        );
      })}
    </>
  );
}
