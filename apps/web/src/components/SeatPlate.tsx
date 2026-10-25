"use client";

import type { Card } from "@mighty/engine";
import { cardLabel } from "@/game/terms";
import { PLATE_COMPACT_H, type Rect } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { SuitText } from "./SuitText";

import { Term } from "./TermHint";

interface SeatPlateProps {
  rect: Rect;
  name: string;
  handCount: number;
  points: Card[] | null;
  pointCount: number;
  money: number;
  declarer: boolean;
  friend: boolean;
  ruling: boolean;
  active: boolean;
  leader: boolean;
  dead: boolean;
  /** 온라인 대전에서 연결이 끊겨 컴퓨터가 대신 두는 중 */
  offline?: boolean;
  /** 멘탈 포커 판: 컴퓨터가 대신할 수 없어 돌아오기를 기다린다 */
  waiting?: boolean;
  /** 내 기기가 이 자리의 부정을 찾았다 */
  accused?: boolean;
  bubble: string | null;
  /** 포기했거나 다른 사람에게 밀린 공약 */
  bubbleDim?: boolean;
  compact: boolean;
  /** 내 자리: 손패가 보이므로 장수를 빼고, 자리가 모자라면 한 줄로 줄인다 */
  mine?: boolean;
}

/** 이보다 낮으면 한 줄로 줄인 판 */
const SLIM_H = 36;

function isRed(card: Card): boolean {
  return card.startsWith("H") || card.startsWith("D");
}

/** 자리 판. 장수·딴 점수 카드·상태를 보여 준다. 다른 사람 손패 뒷면은 GameTable이 판 뒤에 펼친다. */
export function SeatPlate(props: SeatPlateProps) {
  const { rect } = props;
  // 낮은 화면에서는 점수 카드 줄을 접어 한 줄로 보여 준다.
  const compact = rect.h < PLATE_COMPACT_H;
  // 내 자리 판을 줄였을 때는 이름·표시·점수 장수·돈을 한 줄에 놓는다.
  const slim = rect.h < SLIM_H;
  return (
    <div
      className={cn(
        "absolute flex flex-col justify-between overflow-visible rounded-xl border px-2 py-1 text-xs shadow-lg backdrop-blur-sm transition-[box-shadow,background-color,opacity] duration-300",
        props.ruling
          ? "border-amber-300/70 bg-amber-950/70"
          : "border-white/15 bg-black/45",
        props.active &&
          "shadow-[0_0_0_2px_#fde68a,0_0_20px_2px_rgba(253,230,138,0.55)]",
        props.dead && "opacity-40",
        props.accused &&
          "border-rose-400 shadow-[0_0_0_2px_#fb7185,0_0_22px_4px_rgba(244,63,94,0.6)]",
      )}
      // 손패 뒷면(z 1~13)보다 위, 카드 무대(손패 10~, 바닥 100~)와는 겹치지 않는다.
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: 20,
      }}
    >
      <div className={cn("flex items-center gap-1", slim && "h-full")}>
        <span className="min-w-[3.5em] truncate font-semibold">
          {props.name}
        </span>
        {props.declarer && (
          <Term
            id="declarer"
            className="shrink-0 whitespace-nowrap rounded bg-amber-400 px-1 text-[10px] text-black no-underline"
          >
            주공
          </Term>
        )}
        {props.friend && (
          <Term
            id="friend"
            className="shrink-0 whitespace-nowrap rounded bg-sky-300 px-1 text-[10px] text-black no-underline"
          >
            프렌드
          </Term>
        )}
        {props.leader && (
          <Term
            id="lead"
            className="shrink-0 whitespace-nowrap rounded bg-white/20 px-1 text-[10px] no-underline"
          >
            선
          </Term>
        )}
        {slim ? (
          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] tabular-nums opacity-70">
            {props.pointCount > 0 ? `점수 ${props.pointCount}장 · ` : ""}
            {props.money * 10}
          </span>
        ) : (
          !props.mine && (
            <span
              className="ml-auto shrink-0 whitespace-nowrap tabular-nums opacity-80"
              title="남은 손패"
            >
              {props.dead ? "탈락" : `${props.handCount}장`}
            </span>
          )
        )}
      </div>
      {props.accused ? (
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-bold text-[10px] shadow"
          title="이 자리에서 규칙 위반이나 조작을 찾았습니다"
        >
          ⚠ 부정 감지
        </div>
      ) : (
        props.offline && (
          <div
            className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-[10px] shadow"
            title={
              props.waiting
                ? "연결이 끊겼습니다. 이 사람 카드는 이 사람만 열 수 있어 돌아오기를 기다립니다"
                : "연결이 끊겨 컴퓨터가 대신 둡니다"
            }
          >
            {props.waiting
              ? "연결 끊김 · 기다리는 중"
              : "연결 끊김 · 컴퓨터가 대신"}
          </div>
        )
      )}
      {slim ? null : compact ? (
        <div className="flex items-center justify-between text-[10px] tabular-nums opacity-70">
          <span>
            {props.pointCount > 0 ? `점수 ${props.pointCount}장` : ""}
          </span>
          <span>{props.money * 10}</span>
        </div>
      ) : (
        <>
          <div className="flex h-4 flex-nowrap items-center gap-0.5 overflow-hidden">
            {props.points === null || props.compact
              ? props.pointCount > 0 && (
                  <span className="opacity-80">점수 {props.pointCount}장</span>
                )
              : props.points.map((card) => (
                  <span
                    key={card}
                    className={cn(
                      "rounded bg-white px-0.5 text-[10px] leading-4 font-semibold",
                      isRed(card) ? "text-red-600" : "text-black",
                    )}
                  >
                    <SuitText text={cardLabel(card)} />
                  </span>
                ))}
          </div>
          <div className="text-[10px] tabular-nums opacity-60">
            {props.money * 10}
          </div>
        </>
      )}
      {props.bubble && (
        <div
          className={cn(
            "absolute -bottom-3 left-1/2 -translate-x-1/2 translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-xs shadow transition-opacity",
            props.bubbleDim
              ? "bg-white/60 text-black/60"
              : "bg-white text-black",
          )}
        >
          <SuitText text={props.bubble} />
        </div>
      )}
    </div>
  );
}
