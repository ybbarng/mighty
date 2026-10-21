"use client";

import { useEffect, useState } from "react";

import { dealPlan, FLIGHT_MS, SHUFFLE_MS } from "@/game/timing";
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
  /** 한 사람에게 주는 묶음 크기(없으면 마이티 2·3·3·2) */
  pattern?: readonly number[];
  /**
   * 섞는 연출 시간. 멘탈 포커처럼 실제로 섞는 동안 이미 섞는 연출(`ShuffleLoop`)을 보였으면
   * 최소 시간(`SHUFFLE_MS`)에서 남은 만큼만 섞고 바로 나눠 준다
   */
  shuffleMs?: number;
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
  pattern,
  shuffleMs = SHUFFLE_MS,
}: DealAnimationProps) {
  const [stage, setStage] = useState<Stage>("stack");
  const total = handSize * targets.length;
  const { flights } = dealPlan(handSize, targets.length, pattern);
  const lastFlight = flights.at(-1)?.delay ?? 0;

  useEffect(() => {
    const step = shuffleMs / 4;
    const shuffles: [Stage, number][] =
      shuffleMs > 0
        ? [
            ["split", startDelay],
            ["merge", startDelay + step],
            ["split2", startDelay + step * 2],
            ["merge2", startDelay + step * 3],
          ]
        : [];
    const plan: [Stage, number][] = [
      ...shuffles,
      ["deal", startDelay + shuffleMs],
      ["settle", startDelay + shuffleMs + lastFlight + FLIGHT_MS],
    ];
    const timers = plan.map(([s, at]) => setTimeout(() => setStage(s), at));
    return () => timers.forEach(clearTimeout);
  }, [startDelay, lastFlight, shuffleMs]);

  const count = total + kittyCount;
  const split = stage === "split" || stage === "split2";
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        // 아래부터 쌓는다. 바닥 카드는 맨 아래에 남고, 나눠 줄 카드는 맨 위부터 나간다.
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
              // 다 나눈 뒤 남은 바닥 카드는 덱 자리에 그대로 둔다(게임 화면이 이어받는다).
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
            // 덱에서는 맨 위 카드가 맨 위에 보이고 먼저 나간다.
            z={dealt ? 100 + (total - order) : 10 + i}
            delay={dealt ? (flight?.delay ?? 0) : 0}
            duration={dealt ? FLIGHT_MS : 400}
          />
        );
      })}
    </>
  );
}

/**
 * 멘탈 포커: 모두가 실제로 섞는 동안 가운데 덱이 갈라졌다 합쳐지기를 되풀이한다.
 * 섞기가 끝나면 나눠 주기 연출(`DealAnimation`)이 이어받는다
 */
export function ShuffleLoop({
  center,
  card,
  count,
}: {
  center: Point;
  card: Size;
  count: number;
}) {
  const [split, setSplit] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setSplit((s) => !s), SHUFFLE_MS / 4);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const half = i % 2 === 0 ? -1 : 1;
        return (
          <PlayingCard
            // biome-ignore lint/suspicious/noArrayIndexKey: 덱 연출용 뒷면 카드는 순서가 곧 정체다
            key={i}
            card={null}
            width={card.w}
            height={card.h}
            at={{
              x: center.x + (split ? half * card.w * 0.62 : 0),
              y: center.y - i * 0.35,
              scale: 1,
            }}
            rotate={split ? half * 6 : 0}
            z={10 + i}
            delay={0}
            duration={400}
          />
        );
      })}
    </>
  );
}
