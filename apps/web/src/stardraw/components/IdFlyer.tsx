"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { AstronautCard, BlankAstronautCard } from "../astronaut/AstronautCard";
import { astronautOf } from "../astronaut/identity";
import { EASE, EASE_OUT, FX } from "../fx-timing";
import type { Services } from "../services";
import { useIssued } from "./AstronautPanel";

/** 등록증 자리: 아래에 숨음 / 아래에서 살짝 올라와 내밀기를 기다림 / 내밀어 조금 올라감 / 가운데 떠 있음 */
export type CardSpot = "hidden" | "peek" | "lift" | "up";

/**
 * 신분증 제시 화면(입장·응모). Apple Pay의 카드 제시처럼 한 번에 하나씩: 위쪽 문구 → 인증 → 등록증이 아래에서 올라옴 →
 * 확인 표시 → (입장은 인사로 바뀌어 머묾) → 등록증이 아래로 내려감. 움직이는 것은 등록증뿐이고 문구는 고정 자리에서
 * 바뀐다. 차례와 시간은 부르는 쪽이 정한다(fx-timing의 FX). 화면 전체를 덮는 오버레이 층이라 탭바·메뉴가 가려지고
 * 뒤 화면은 조작되지 않는다. 응모처럼 이미 오버레이가 떠 있으면 `backdrop={false}`로 얹는다.
 * 움직임 줄이기면 부르는 쪽에서 아예 그리지 않는다
 */
export function IdFlyer({
  services,
  pub,
  card,
  checked = false,
  text,
  closing = false,
  backdrop = true,
  press,
  blank = false,
}: {
  /** 아직 누구인지 모를 때(pub 없음) 실루엣 카드로 기다린다 */
  blank?: boolean;
  /**
   * 사람이 할 일이 있을 때만: 등록증 자체가 단추다(「신분증 제출」). 위로 밀어 올리거나 한 번 누르면(Enter·Space·↑도)
   * `onPress`를 그 동작 안에서 바로 부른다(패스키 창은 누름 직후에만 열리는 브라우저가 있다). 작은 「취소」로 돌아간다.
   * 기다리기만 하면 되는 때는 없다
   */
  press?:
    | { label: string; onPress: () => void; onCancel: () => void }
    | undefined;
  services: Services;
  /** 아직 누구인지 모르면(인증 전) null: 등록증 없이 문구만 */
  pub: Uint8Array | null;
  card: CardSpot;
  /** 인증이 끝나 확인 표시를 그린다 */
  checked?: boolean;
  /** 위쪽 고정 자리 문구(바뀌면 부드럽게 바뀐다) */
  text?: ReactNode;
  /** 걷히는 중 */
  closing?: boolean;
  backdrop?: boolean;
}) {
  // 떠 있는 동안 뒤 화면은 스크롤되지 않는다
  useEffect(() => {
    if (!backdrop) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [backdrop]);
  const up = card === "up";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="우주인 등록증"
      data-id-flyer={up ? "shown" : "away"}
      className="sd-stage-pad fixed inset-0 z-[75] flex flex-col items-center"
      style={{
        opacity: closing ? 0 : 1,
        transition: `opacity ${FX.stageOut}ms ${EASE_OUT}`,
      }}
    >
      {backdrop && (
        <div
          aria-hidden="true"
          className="sd-stage-in absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(22,30,56,0.95),rgba(5,9,18,0.97))] backdrop-blur-md"
        />
      )}
      {text && (
        <p
          key={String(typeof text === "string" ? text : "")}
          aria-live="polite"
          className="sd-text-in relative min-h-14 break-keep px-6 text-center font-bold text-amber-100 text-lg"
        >
          {text}
        </p>
      )}
      <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-5">
        {(pub || blank) && (
          <FlyingCard
            services={services}
            pub={pub}
            spot={card}
            onPress={press?.onPress}
            label={press?.label}
          />
        )}
        <CheckMark shown={checked} />
      </div>
      {/* 자리를 차지하지 않게 아래에 띄운다(사라질 때 등록증이 밀리지 않게) */}
      {press && (
        <button
          type="button"
          onClick={press.onCancel}
          className="sd-text-in absolute left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white"
          style={{
            bottom: "max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
          }}
        >
          취소
        </button>
      )}
    </div>
  );
}

/** 조금이라도 끌었으면(이만큼 넘게) 누르기로 보지 않는다 */
const TAP_SLOP = 8;

/**
 * 움직이는 등록증. `onPress`가 있으면 등록증이 단추다(내 앞의 물건을 위로 내밀기: 밀어 올리거나 한 번 누르기).
 * 끄는 동안 손을 따라오고, 일정 거리·속도를 넘기거나 누르면 `onPress`를 그 동작 안에서 바로 부른다. 못 미치면 제자리
 */
function FlyingCard({
  services,
  pub,
  spot,
  onPress,
  label,
}: {
  services: Services;
  /** 없으면 실루엣 카드(누구인지 모를 때). 확인되면 같은 자리에서 실제 등록증으로 바뀐다 */
  pub: Uint8Array | null;
  spot: CardSpot;
  onPress?: (() => void) | undefined;
  label?: string | undefined;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; lastY: number; lastT: number } | null>(
    null,
  );
  const pressable = !!onPress && spot === "peek";
  /** 실루엣으로 기다렸으면 확인된 등록증은 칸마다 채워지며 나타난다 */
  const sawBlank = useRef(!pub);
  if (!pub) sawBlank.current = true;
  const transform =
    drag !== null
      ? `translateY(calc(var(--peek) + ${drag}px)) scale(0.98)`
      : spot === "up"
        ? "translateY(0) scale(1)"
        : spot === "lift"
          ? "translateY(calc(var(--peek) - 56px)) scale(1)"
          : spot === "peek"
            ? "translateY(var(--peek)) scale(0.98)"
            : "translateY(110vh) scale(0.96)";
  const transition =
    drag !== null
      ? "none"
      : spot === "hidden"
        ? `transform ${FX.idOut}ms ${EASE_OUT}`
        : spot === "lift"
          ? `transform ${FX.idLift}ms ${EASE}`
          : `transform ${FX.idIn}ms ${EASE}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 등록증 그림 전체를 끌어 올리는 덩어리라 button으로 감싸지 않는다
    <div
      role="button"
      aria-label={label ?? "우주인 등록증"}
      aria-disabled={!pressable}
      tabIndex={pressable ? 0 : -1}
      data-id-card-press={pressable || undefined}
      data-id-card
      onPointerDown={(e) => {
        if (!pressable) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        start.current = { y: e.clientY, lastY: e.clientY, lastT: e.timeStamp };
        setDrag(0);
      }}
      onPointerMove={(e) => {
        const st = start.current;
        if (!st) return;
        st.lastY = e.clientY;
        st.lastT = e.timeStamp;
        const dy = e.clientY - st.y;
        setDrag(dy < 0 ? dy : dy * 0.2);
      }}
      onPointerUp={(e) => {
        const st = start.current;
        start.current = null;
        setDrag(null);
        if (!st) return;
        const dy = e.clientY - st.y;
        const v = (e.clientY - st.lastY) / Math.max(1, e.timeStamp - st.lastT);
        if (
          Math.abs(dy) <= TAP_SLOP ||
          -dy > FX.swipeDistance ||
          v < -FX.swipeVelocity
        )
          onPress?.();
      }}
      onPointerCancel={() => {
        start.current = null;
        setDrag(null);
      }}
      onKeyDown={(e) => {
        if (pressable && ["Enter", " ", "ArrowUp"].includes(e.key)) {
          e.preventDefault();
          onPress?.();
        }
      }}
      className={cn(
        "relative w-[min(20rem,86vw)] touch-none select-none rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.55)] outline-none [--peek:22vh]",
        // 초점 테두리는 내밀기를 기다릴 때만(낸 뒤에는 남지 않게)
        pressable && "focus-visible:ring-2 focus-visible:ring-amber-200/70",
        // 떠오름은 지우지 않고 멈춘다(지우면 그만큼 튀어 보인다)
        "sd-sheet-hint",
        pressable
          ? drag === null
            ? "cursor-grab"
            : "cursor-grabbing"
          : "pointer-events-none",
      )}
      style={{
        transform,
        transition,
        animationPlayState: pressable && drag === null ? "running" : "paused",
      }}
    >
      <div className="pointer-events-none">
        {pub ? (
          <div className={cn(sawBlank.current && "sd-id-fill")}>
            <RealCard services={services} pub={pub} />
          </div>
        ) : (
          <BlankAstronautCard />
        )}
      </div>
    </div>
  );
}

function RealCard({ services, pub }: { services: Services; pub: Uint8Array }) {
  const a = useMemo(() => astronautOf(pub), [pub]);
  const issued = useIssued(services, pub);
  return <AstronautCard astronaut={a} issued={issued} clock={services.clock} />;
}

/** 확인 표시: 원이 그려지고 체크가 그어진다(Apple Pay의 완료 표시처럼) */
function CheckMark({ shown }: { shown: boolean }) {
  return (
    <svg
      viewBox="0 0 52 52"
      aria-hidden="true"
      data-id-check={shown || undefined}
      className={cn(
        // 보이지 않을 때도 자리를 차지해 아래로 내려가 기다리는 등록증과 겹친다: 누름을 받지 않는다
        "sd-check pointer-events-none size-12",
        shown && "sd-check-on",
      )}
      style={{ ["--check-ms" as string]: `${FX.idCheck}ms` }}
    >
      <circle
        cx="26"
        cy="26"
        r="23"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="2.5"
        pathLength={1}
        className="sd-check-circle"
      />
      <path
        d="M15 27 l7 7 l15 -16"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="sd-check-tick"
      />
    </svg>
  );
}
