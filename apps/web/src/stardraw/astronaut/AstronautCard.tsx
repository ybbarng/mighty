"use client";

import type { Clock } from "@mighty/fair-play";
import { toHex } from "@mighty/stardraw-core";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { Avatar, EGG_LABEL } from "./Avatar";
import type { Astronaut } from "./identity";
import { ART_H, ART_W, keyArt } from "./key-art";
import { PasskeyMark, Seal } from "./marks";
import { OWNER_CHECK_SECONDS } from "./owner-check";
import type { AddressFact } from "./place-facts";
import {
  CardSecurity,
  FoilPatch,
  Guilloche,
  HoloFilm,
  Kinegram,
} from "./security";

/** 발급 기관(지어낸 기관). 하늘의 별 따기는 카노푸스 우주국이 여는 추첨이라는 설정이다 */
export const AGENCY = "카노푸스 우주국장";

type Owner = "idle" | "checking" | "ok" | "fail";
/** 뒷면 공개 열쇠: 가림, 본인 확인 중, 보임 */
type Reveal = "hidden" | "checking" | "shown";

/** 이만큼 움직이지 않고 떼면 누른 것으로 본다(px) */
const TAP_SLOP = 8;
/** 가로로 카드 너비의 이만큼 넘게 밀고 떼면 그 방향으로 뒤집는다 */
const FLIP_RATIO = 0.35;
/** 가로로 카드 너비만큼 밀 때 도는 각(도). 뒤집는 문턱(35%)이 약 45도 */
const DRAG_DEG = 130;
/** 뒤집지 못하는 카드(뒷면 없음)의 좌우 최대 기울기(도) */
const TILT_Y = 32;
/** 위아래 최대 기울기(도). 이 축으로는 뒤집지 않는다 */
const TILT_X = 22;
/** 마우스를 올려만 둘 때의 기울기(도) */
const HOVER_Y = 9;
const HOVER_X = 6;
/** 카드 두께(cqw, 실제 ID-1 카드보다 조금 두껍게) */
const THICK = 1.4;

/**
 * 옆면 띠 조각들: 카드 둘레(둥근 모서리 포함)를 따라 두께 THICK의 띠를 한 바퀴 두른다.
 * 같은 모양 판을 여러 장 쌓으면 옆에서 볼 때 둥근 모서리끼리 어긋나 톱니가 보여서, 하나로 이어진 면으로 그린다.
 * 단위는 cqw(카드 너비 100). 각 조각은 가운데 (x, y), 길이 len, 접선이 세로에서 phi도 기운 띠.
 */
type EdgeSegment = { x: number; y: number; len: number; phi: number };
const EDGE: EdgeSegment[] = (() => {
  const w = 100;
  const h = w / 1.586;
  const r = 3.7;
  const perCorner = 6;
  const segs: EdgeSegment[] = [
    { x: 0, y: h / 2, len: h - 2 * r, phi: 0 },
    { x: w, y: h / 2, len: h - 2 * r, phi: 0 },
    { x: w / 2, y: 0, len: w - 2 * r, phi: 90 },
    { x: w / 2, y: h, len: w - 2 * r, phi: 90 },
  ];
  // 모서리 중심과 시작 각(도, x축에서 시계 방향 = 화면 아래쪽이 +y)
  const corners: [number, number, number][] = [
    [r, r, 180],
    [w - r, r, 270],
    [w - r, h - r, 0],
    [r, h - r, 90],
  ];
  const step = 90 / perCorner;
  // 조각 사이가 벌어지지 않게 조금 겹친다
  const len = 2 * r * Math.sin(((step / 2) * Math.PI) / 180) * 1.08;
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i < perCorner; i++) {
      const a = start + step * (i + 0.5);
      const rad = (a * Math.PI) / 180;
      // 원 위의 점에서 접선은 반지름에 수직: 세로에서 a도 기운 방향
      segs.push({
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad),
        len,
        phi: a,
      });
    }
  }
  return segs;
})();

/** 기울기·빛 상태(돌림판의 CSS 변수로 옮긴다) */
type Pose = { ry: number; rx: number; px: number; py: number; ht: number };
const REST: Pose = { ry: 0, rx: 0, px: 0.5, py: 0.5, ht: 0 };

/** 천체 이름 묶음: 이름 안에서 끊지 않고 › 뒤에서만 줄을 바꾼다(한 이름이 줄보다 길 때만 이름 안에서) */
function PathNames({
  names,
  lead,
}: {
  names: readonly string[];
  lead?: string;
}) {
  return names.map((n, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: 주소 차례가 곧 자리다(같은 이름이 두 번 나올 수 있다)
    <Fragment key={`${i}-${n}`}>
      <span className="inline-block max-w-full break-keep [overflow-wrap:anywhere]">
        {i === 0 ? lead : ""}
        {n}
        {i < names.length - 1 ? " ›" : ""}
      </span>{" "}
    </Fragment>
  ));
}

/**
 * 우주인 등록증(docs/36 11-9). 실제 신분증처럼 칸을 나눈다: 성명, 등록번호, 주소(줄여 보이고 누르면 전체), 왼쪽 아래 발급일.
 * - 카드는 두께가 있는 판 하나다: 앞면·뒷면을 옆면 층 사이에 띄워, 돌려도 가장자리 띠가 보인다.
 * - 끌기: 가로로 끌면 민 만큼 좌우로 돌고(홀로그램이 그 각도만큼 빛난다), 너비 35%를 넘겨 떼면 그 방향으로 뒤집힌다.
 *   세로로 끌면 위아래로만 기울고 뒤집히지 않는다. 떼면 제자리로. 마우스는 올려만 둬도 살짝 기운다.
 *   움직임 줄이기면 돌지 않고, 문턱을 넘겨 떼면 바로 바뀐다.
 * - 홀로그램(은박 패치·기요셰·무지개 필름·반짝이)은 가만히 있어도 천천히 일렁이고, 기울이면 강해진다.
 * - 누르면 주인 확인(`onCheck`): 통과하면 "이 기기에서 확인됨"과 지금 시각이 초 단위로 흐르고 홀로그램이 더 세게 흐른다(캡처와 구분).
 *   30초 뒤 원래대로. 실패·취소면 조용히 "확인하지 못했습니다".
 *   "내 패스키가 이 카드 열쇠와 맞다"를 나에게 보여 주는 체험일 뿐, 남에게 보여 주는 증명이 아니다
 *   (가짜 페이지도 같은 표시를 흉내 낼 수 있다). 남에게 당첨을 증명하는 길은 당첨자 확인(별 세 개)이다.
 * - 뒷면(`pub`·`onReveal`이 있을 때): 옆으로 밀거나 「뒷면 보기」로 뒤집는다. 공개 열쇠로 그린 별 무늬와 가린 공개 열쇠 줄.
 *   가린 줄을 누르면 본인 확인 뒤 공개 열쇠와 복사 단추를 보인다. 30초 뒤나 다시 뒤집으면 가린다.
 *   공개 열쇠는 비밀이 아니다(장부와 기기에 있다). 캡처·어깨너머로 장부 속 내 응모가 바로 찾히지 않게 하는 실수 방지다.
 *   앞면은 주인 확인, 뒷면은 열쇠 꺼내 보기로 역할을 나눈다. 앞면과 공유에는 공개 열쇠를 넣지 않는다.
 */
export function AstronautCard({
  astronaut: a,
  issued,
  clock,
  onCheck,
  forced,
  pub,
  onReveal,
  affiliation,
}: {
  astronaut: Astronaut;
  /** 발급일 "2026. 10. 30."(읽는 중이면 null) */
  issued: string | null;
  clock: Clock;
  onCheck?: (() => Promise<boolean>) | undefined;
  /** 바깥에서 정한 확인 상태(당첨자 확인 승인 때 등록증이 같은 움직임으로 확인되는 모습) */
  forced?: "checking" | "ok" | undefined;
  /** 뒷면에 둘 공개 열쇠(없으면 뒤집지 않는다) */
  pub?: Uint8Array | undefined;
  /** 뒷면 공개 열쇠를 꺼내기 전 본인 확인 */
  onReveal?: (() => Promise<boolean>) | undefined;
  /**
   * 소속 배지(docs/36 11-13): 이 기기에 있는 상품 자격 증서의 도장을 장부의 기간 열쇠로 확인했을 때만,
   * 내 기기의 내 등록증에만 그린다. 꾸밈이고 남에게 보이는 증명이 아니다
   */
  affiliation?: { name: string; method: string } | null | undefined;
}) {
  /** 돌림판(앞뒷면과 옆면 층을 함께 돌린다) */
  const turn = useRef<HTMLDivElement>(null);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    w: number;
    h: number;
    /** 문턱을 넘어 끌기로 잡았는가(아니면 누르기) */
    dragging: boolean;
    target: EventTarget | null;
  } | null>(null);
  /** 끌고 난 뒤의 click은 안쪽 단추에 보내지 않는다 */
  const dragged = useRef(false);
  const pose = useRef<Pose>(REST);
  const frame = useRef(0);
  /** 쌓인 뒤집기 각(180의 배수). 왼쪽으로 밀면 줄고 오른쪽이면 는다 */
  const base = useRef(0);
  const canFlip = pub !== undefined && onReveal !== undefined;
  const [flipped, setFlipped] = useState(false);
  const [reveal, setReveal] = useState<Reveal>("hidden");
  const [keyCopied, setKeyCopied] = useState(false);
  /** 뒤집을 때마다 늘려, 뒤집기 전에 시작한 본인 확인이 끝나도 열쇠를 꺼내지 않게 한다 */
  const flipTurn = useRef(0);
  const art = useMemo(() => (pub ? keyArt(pub) : null), [pub]);
  const hex = useMemo(() => (pub ? toHex(pub) : ""), [pub]);
  const [inner, setOwner] = useState<Owner>("idle");
  const owner: Owner = forced ?? inner;
  const [now, setNow] = useState(() => clock.now());
  const [fullAddress, setFullAddress] = useState(false);
  const [aboutMark, setAboutMark] = useState(false);
  const [aboutBadge, setAboutBadge] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => cancelAnimationFrame(frame.current);
  }, []);

  // 본인 확인이 이어지는 동안 1초마다 시각을 새로 쓰고, 30초 뒤 원래대로
  useEffect(() => {
    if (owner !== "ok" && owner !== "fail") return;
    if (owner === "fail") return clock.after(4000, () => setOwner("idle"));
    const until = clock.now() + OWNER_CHECK_SECONDS * 1000;
    let stop: () => void = () => {};
    const tick = () => {
      const t = clock.now();
      setNow(t);
      if (t >= until) {
        setOwner("idle");
        return;
      }
      stop = clock.after(1000 - (t % 1000), tick);
    };
    tick();
    return () => stop();
  }, [owner, clock]);

  // 꺼낸 공개 열쇠는 30초 뒤 다시 가린다
  useEffect(() => {
    if (reveal !== "shown") return;
    return clock.after(OWNER_CHECK_SECONDS * 1000, () => {
      setReveal("hidden");
      setKeyCopied(false);
    });
  }, [reveal, clock]);

  /** 지금 자세를 돌림판의 CSS 변수로(각도·빛 위치·세기). 변수 하나하나가 transform과 홀로그램을 움직인다 */
  const apply = () => {
    frame.current = 0;
    const el = turn.current;
    if (!el) return;
    const p = pose.current;
    el.style.setProperty("--ang", (base.current + p.ry).toFixed(2));
    el.style.setProperty("--rx", p.rx.toFixed(2));
    el.style.setProperty("--px", p.px.toFixed(3));
    el.style.setProperty("--py", p.py.toFixed(3));
    el.style.setProperty("--ht", p.ht.toFixed(3));
  };
  /** 포인터가 화면 주사율보다 자주 와도 한 장면에 한 번만 쓴다 */
  const schedule = (p: Pose) => {
    pose.current = p;
    if (!frame.current) frame.current = requestAnimationFrame(apply);
  };
  /** 손을 떼면 제자리(또는 뒤집힌 자리)로 부드럽게 */
  const settle = () => {
    cancelAnimationFrame(frame.current);
    pose.current = REST;
    const el = turn.current;
    if (el) delete el.dataset.dragging;
    apply();
  };

  /** dir: 1이면 오른쪽으로, -1이면 왼쪽으로 뒤집는다 */
  const flip = (dir: 1 | -1 = 1) => {
    if (!canFlip) return;
    base.current += dir * 180;
    flipTurn.current += 1;
    setFlipped((Math.round(base.current / 180) & 1) === 1);
    setReveal("hidden");
    setKeyCopied(false);
    settle();
  };

  const revealKey = async () => {
    if (!onReveal || reveal !== "hidden") return;
    const t = flipTurn.current;
    setReveal("checking");
    const ok = await onReveal();
    if (flipTurn.current !== t) return;
    // 실패·취소면 조용히 그대로 가린다
    setReveal(ok ? "shown" : "hidden");
  };

  const check = async () => {
    if (!onCheck || owner === "checking") return;
    setOwner("checking");
    setOwner((await onCheck()) ? "ok" : "fail");
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    dragged.current = false;
    press.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: r.left,
      top: r.top,
      w: r.width,
      h: r.height,
      dragging: false,
      target: e.target,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = turn.current;
    if (!el) return;
    const p = press.current;
    if (p && p.id === e.pointerId) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.dragging) {
        if (Math.hypot(dx, dy) <= TAP_SLOP) return;
        // 문턱을 넘으면 끌기로 잡는다: 카드 밖으로 나가도 따라오고, 안쪽 단추는 눌리지 않는다
        p.dragging = true;
        dragged.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (reduce.current) return;
      el.dataset.dragging = "";
      const ry = canFlip
        ? Math.max(-180, Math.min(180, (dx / p.w) * DRAG_DEG))
        : TILT_Y * Math.tanh(((dx / p.w) * DRAG_DEG) / TILT_Y);
      // 위아래는 끝으로 갈수록 덜 기우는 고무줄처럼, 최대 TILT_X도
      const rx = TILT_X * Math.tanh(((-dy / p.h) * 50) / TILT_X);
      schedule({
        ry,
        rx,
        px: Math.max(0, Math.min(1, (e.clientX - p.left) / p.w)),
        py: Math.max(0, Math.min(1, (e.clientY - p.top) / p.h)),
        ht: Math.min(1, Math.max(Math.abs(ry), Math.abs(rx) * 1.3) / 22),
      });
      return;
    }
    // 마우스를 올려만 둘 때: 살짝 기울고 빛이 포인터를 따라온다
    if (e.pointerType !== "mouse" || reduce.current || press.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    el.dataset.dragging = "";
    schedule({
      ry: (x - 0.5) * 2 * HOVER_Y,
      rx: -(y - 0.5) * 2 * HOVER_X,
      px: x,
      py: y,
      ht: Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 1.6),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (p.dragging) {
      const dx = e.clientX - p.x;
      if (canFlip && Math.abs(dx) > p.w * FLIP_RATIO) flip(dx > 0 ? 1 : -1);
      else settle();
      return;
    }
    settle();
    // 안쪽 단추(주소·패스키 표시·열쇠 꺼내기)는 그 단추의 click이 맡는다
    const t = p.target as Element | null;
    if (t?.closest?.("button, a")) return;
    if (!flipped) void check();
  };

  const regDate = issued ?? "…";
  const time = new Date(now);
  const hms = [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

  return (
    <div className="flex flex-col items-center gap-2">
      {/* 카드 너비가 cqw의 기준(카드 자신의 container-type은 자기 모서리에 쓰이지 않고, 없으면 화면 너비가 기준이 된다) */}
      <div
        data-idcard-stage
        className="sd-idcard-stage w-full max-w-md [container-type:inline-size] [perspective:1100px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          settle();
        }}
        onPointerLeave={() => {
          if (!press.current) settle();
        }}
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div
          ref={turn}
          className="sd-idcard-flip relative"
          data-flipped={flipped ? "" : undefined}
        >
          {/* 옆면: 카드 둘레를 한 바퀴 두른 띠. 돌리면 가장자리로 보인다 */}
          {EDGE.map((s, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 조각
              key={i}
              aria-hidden="true"
              className="sd-idcard-edge"
              style={{
                left: `${(s.x - THICK / 2).toFixed(3)}cqw`,
                top: `${(s.y - s.len / 2).toFixed(3)}cqw`,
                width: `${THICK}cqw`,
                height: `${s.len.toFixed(3)}cqw`,
                transform: `rotateZ(${s.phi.toFixed(2)}deg) rotateY(90deg)`,
              }}
            />
          ))}
          {/* biome-ignore lint/a11y/useSemanticElements: 카드 안에 다른 단추(주소·패스키 마크)가 있어 button으로 감쌀 수 없다 */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`우주인 등록증 ${a.name}. ${onCheck ? "누르면 본인 확인" : ""}`}
            data-idcard={a.number}
            data-owner={owner}
            inert={flipped}
            className={cn(
              "sd-idcard sd-idcard-face sd-idcard-front relative aspect-[1.586] w-full cursor-pointer select-none overflow-hidden rounded-[3.7cqw] text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
              flipped && "pointer-events-none",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void check();
              }
            }}
          >
            <CardSecurity />
            <Guilloche />

            {/* 머리 */}
            <div className="absolute inset-x-[5cqw] top-[4.4cqw] flex items-center justify-between">
              <span className="font-black text-[6cqw] leading-none tracking-[0.06em]">
                우주인 등록증
              </span>
              {affiliation && (
                <button
                  type="button"
                  aria-label={`${affiliation.name} 소속: 무엇인가요?`}
                  aria-expanded={aboutBadge}
                  data-affiliation-badge={affiliation.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAboutBadge((v) => !v);
                    setAboutMark(false);
                  }}
                  className="ml-auto mr-[1.6cqw] flex items-center gap-[1cqw] rounded-full border border-amber-200/45 bg-amber-200/15 px-[2cqw] py-[0.8cqw] text-[2.4cqw] text-amber-50"
                >
                  <ClusterMark className="size-[3.6cqw]" />
                  {affiliation.name} 소속
                </button>
              )}
              <button
                type="button"
                aria-label="패스키 표시: 무엇인가요?"
                aria-expanded={aboutMark}
                data-passkey-badge
                onClick={(e) => {
                  e.stopPropagation();
                  setAboutMark((v) => !v);
                }}
                className="flex items-center gap-[1cqw] rounded-full border border-sky-200/35 bg-sky-200/10 px-[2cqw] py-[0.8cqw] text-[2.4cqw] text-sky-100"
              >
                <PasskeyMark className="size-[3.6cqw]" />
                패스키
              </button>
            </div>

            {/* 사진 */}
            <div className="absolute top-[14.5cqw] right-[5cqw] w-[23cqw]">
              <Avatar
                face={a.face}
                egg={a.egg}
                label={
                  a.egg
                    ? `프로필 사진: ${EGG_LABEL[a.egg]}`
                    : "프로필 사진: 외계인"
                }
                className="block h-auto w-full rounded-[1.6cqw] border border-white/25"
              />
              {a.egg && (
                <span
                  data-egg={a.egg}
                  className="-bottom-[1.6cqw] absolute inset-x-0 z-10 mx-auto w-max rounded-full bg-amber-300 px-[1.6cqw] py-[0.3cqw] font-bold text-[2cqw] text-slate-950"
                >
                  ★ 드문 사진
                </span>
              )}
            </div>

            {/* 고스트 이미지: 같은 얼굴을 흐리고 작게 한 번 더 */}
            <div
              data-ghost
              aria-hidden="true"
              className="absolute right-[41cqw] bottom-[3.5cqw] w-[8cqw] opacity-25 mix-blend-luminosity grayscale"
            >
              <Avatar
                face={a.face}
                egg={a.egg}
                label=""
                className="block h-auto w-full rounded-[1cqw]"
              />
            </div>

            {/* 칸 */}
            <dl className="absolute top-[15cqw] right-[31cqw] left-[5cqw] grid grid-cols-[auto_1fr] items-baseline gap-x-[3cqw] gap-y-[2cqw]">
              <dt className="text-[2.6cqw] text-sky-100/55">성명</dt>
              <dd className="font-bold text-[5.6cqw] leading-none tracking-[0.12em]">
                {a.name}
              </dd>
              <dt className="text-[2.6cqw] text-sky-100/55">등록번호</dt>
              <dd
                className="font-mono text-[3.4cqw] tabular-nums tracking-wider"
                data-astronaut-number
              >
                {a.number}
              </dd>
              <dt className="text-[2.6cqw] text-sky-100/55">주소</dt>
              <dd>
                <button
                  type="button"
                  aria-expanded={fullAddress}
                  aria-label={`주소: ${a.short.join(", ")}. 누르면 주소 안내`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullAddress((v) => !v);
                  }}
                  className="line-clamp-2 text-left text-[2.9cqw] leading-snug underline decoration-white/25 decoration-dotted underline-offset-2"
                >
                  <PathNames
                    names={a.short}
                    lead={a.otherGalaxy ? "… › " : ""}
                  />
                </button>
              </dd>
            </dl>

            <Kinegram />
            <FoilPatch className="top-[36.5cqw] left-[66cqw] size-[13.5cqw]" />

            {/* 발급일(왼쪽 아래)과 발급 기관·직인(오른쪽 아래) */}
            <span
              data-issue-date
              className="absolute bottom-[4.2cqw] left-[5cqw] text-[3.1cqw] text-sky-50/90 tabular-nums tracking-[0.04em]"
            >
              {regDate}
            </span>
            <div className="absolute right-[5cqw] bottom-[3.6cqw] left-[5cqw] flex items-end justify-end gap-[2cqw]">
              <span className="mr-[14cqw] text-right text-[2.6cqw] text-sky-50/85 leading-tight">
                {AGENCY}
              </span>
              <Seal className="-right-[1cqw] absolute bottom-[-1.5cqw] size-[13cqw] opacity-95" />
            </div>

            <HoloFilm />

            {owner === "ok" && (
              <div
                role="status"
                data-owner-ok
                className="absolute bottom-[9.6cqw] left-[5cqw] flex items-center gap-[1.4cqw] rounded-full bg-emerald-400/90 px-[2.6cqw] py-[0.8cqw] font-bold text-[2.8cqw] text-emerald-950 shadow-lg"
              >
                ✓ 이 기기에서 확인됨
                <span className="font-mono tabular-nums" data-owner-time>
                  {hms}
                </span>
              </div>
            )}
            <div aria-hidden="true" className="sd-idcard-shade" />
          </div>
          {canFlip && art && (
            // biome-ignore lint/a11y/useSemanticElements: 뒷면은 묶음일 뿐 입력 양식이 아니라 fieldset을 쓰지 않는다
            <div
              data-idcard-back
              inert={!flipped}
              aria-label="우주인 등록증 뒷면"
              role="group"
              className={cn(
                "sd-idcard sd-idcard-face sd-idcard-back absolute inset-0 select-none overflow-hidden rounded-[3.7cqw] text-white",
                !flipped && "pointer-events-none",
              )}
            >
              {/* 공개 열쇠에서 정해지는 별 무늬 */}
              <svg
                viewBox={`0 0 ${ART_W} ${ART_H}`}
                className="absolute inset-0 size-full"
                aria-hidden="true"
                data-key-art
              >
                <defs>
                  <linearGradient id={`sd-key-${a.number}`} x1="0" x2="1">
                    <stop offset="0" stopColor={`hsl(${art.hue} 90% 75%)`} />
                    <stop
                      offset="1"
                      stopColor={`hsl(${(art.hue + 120) % 360} 90% 75%)`}
                    />
                  </linearGradient>
                </defs>
                {art.lines.map(([p, q]) => {
                  const s = art.stars[p];
                  const t = art.stars[q];
                  if (!s || !t) return null;
                  return (
                    <line
                      key={`${p}-${q}`}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={`url(#sd-key-${a.number})`}
                      strokeWidth="0.5"
                      strokeOpacity="0.7"
                    />
                  );
                })}
                {art.stars.map((s, i) => (
                  <circle
                    // biome-ignore lint/suspicious/noArrayIndexKey: 별은 차례가 곧 id다
                    key={i}
                    cx={s.x}
                    cy={s.y}
                    r={s.r}
                    fill={i < 7 ? `url(#sd-key-${a.number})` : "white"}
                    opacity={s.o}
                  />
                ))}
              </svg>
              <HoloFilm />

              <span className="absolute top-[4.4cqw] left-[5cqw] text-[2.8cqw] text-sky-50/80 tracking-[0.08em]">
                카노푸스 우주국
              </span>

              <div className="absolute inset-x-[5cqw] bottom-[5cqw] flex flex-col gap-[1cqw] rounded-[2.4cqw] border border-white/15 bg-slate-950/85 px-[3cqw] py-[2.2cqw]">
                <div className="flex h-[4.6cqw] items-center justify-between">
                  <span className="text-[2.6cqw] text-sky-100/60">
                    공개 열쇠
                  </span>
                  {reveal === "shown" && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(hex)
                          .then(() => setKeyCopied(true))
                          .catch(() => {});
                      }}
                      className="rounded-[1.4cqw] border border-white/25 px-[2cqw] py-[0.6cqw] text-[2.6cqw] text-white/85 hover:bg-white/10"
                    >
                      {keyCopied ? "복사했어요" : "복사"}
                    </button>
                  )}
                </div>
                {/* 가린 줄과 꺼낸 값이 같은 높이(130자 세 줄)를 차지해, 꺼내도 상자 높이가 변하지 않는다 */}
                <div className="h-[9.6cqw]" data-key-slot>
                  {reveal === "shown" ? (
                    <code
                      data-public-key
                      className="block break-all font-mono text-[2.25cqw] text-white/90 leading-[3.2cqw]"
                    >
                      {hex}
                    </code>
                  ) : (
                    <button
                      type="button"
                      data-key-mask
                      aria-label="공개 열쇠 꺼내 보기(본인 확인)"
                      disabled={reveal === "checking"}
                      onClick={() => void revealKey()}
                      className="flex size-full items-center justify-between gap-[2cqw] rounded-[1.4cqw] bg-white/5 px-[2cqw] text-left hover:bg-white/10"
                    >
                      <span className="font-mono text-[3.2cqw] text-white/70 tracking-[0.2em]">
                        ●●●● ●●●● ●●●● ●●●●
                      </span>
                      <span className="shrink-0 text-[2.5cqw] text-sky-100/80">
                        {reveal === "checking"
                          ? "확인하는 중…"
                          : "눌러서 꺼내 보기"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
              <div aria-hidden="true" className="sd-idcard-shade" />
            </div>
          )}
        </div>
      </div>

      {canFlip && (
        <button
          type="button"
          data-flip-card
          onClick={() => flip(1)}
          className="rounded-full border border-white/15 px-3 py-1 text-white/70 text-xs hover:bg-white/10"
        >
          {flipped ? "앞면 보기" : "뒷면 보기"}
        </button>
      )}

      <p
        className="min-h-5 break-keep text-center text-white/60 text-xs"
        aria-live="polite"
      >
        {flipped
          ? reveal === "shown"
            ? "공개 기록에서 내 응모권을 찾는 값입니다"
            : reveal === "checking"
              ? "꺼내 보기 전에 본인 확인을 하고 있습니다"
              : ""
          : owner === "checking"
            ? "등록증을 확인하고 있습니다"
            : owner === "fail"
              ? "확인하지 못했습니다"
              : owner === "ok"
                ? "이 기기의 패스키가 이 등록증의 열쇠와 맞습니다"
                : ""}
      </p>

      {!flipped && aboutBadge && affiliation && (
        <p className="break-keep text-center text-amber-100/85 text-xs">
          {affiliation.method}으로 받은 상품 자격이 이 기기에 있습니다. 우주국도
          누구의 자격인지 모릅니다 ·{" "}
          <a href="/stardraw/qualify" className="underline underline-offset-2">
            자세히
          </a>
        </p>
      )}

      {!flipped && (aboutMark || (owner === "ok" && !forced)) && (
        <p className="break-keep text-center text-sky-100/85 text-xs">
          {owner === "ok"
            ? "나에게 보여 주는 확인이에요. 남에게 당첨을 증명할 때는 당첨자 확인을 씁니다"
            : "이 등록증은 이 기기의 패스키로 지켜집니다"}{" "}
          ·{" "}
          <a
            href="/stardraw/about#passkey"
            className="underline underline-offset-2"
          >
            자세히
          </a>
        </p>
      )}

      {!flipped && fullAddress && <AddressGuide astronaut={a} />}
    </div>
  );
}

/**
 * 주소 안내(주소를 누르면 카드 아래에 펼친다): 전체 주소 한 줄, 그 천체의 설명, 그리고 바깥쪽 단계마다 접어 둔 설명.
 * 가까운 단계부터 멀어지는 차례로(그 천체 › … › 우리 우주) 읽게 한다. 설명은 place-facts.ts(글이 길어 펼칠 때 불러온다)
 */
function AddressGuide({ astronaut: a }: { astronaut: Astronaut }) {
  const [facts, setFacts] = useState<AddressFact[]>([]);
  useEffect(() => {
    let alive = true;
    void import("./place-facts").then((m) => {
      if (alive) setFacts(m.addressFacts(a.address, a.placeId));
    });
    return () => {
      alive = false;
    };
  }, [a.address, a.placeId]);
  const home = facts[facts.length - 1];
  const outer = facts.slice(0, -1).reverse();
  return (
    <section
      aria-label="주소 안내"
      data-address-guide
      className="flex w-full max-w-md flex-col gap-2.5 text-left"
    >
      <p
        data-full-address
        className="text-center text-white/80 text-xs leading-relaxed"
      >
        <PathNames names={a.address} />
        {a.ly !== undefined && (
          <span className="block text-white/55">
            지구에서 약 {a.ly.toLocaleString("ko-KR")}광년
          </span>
        )}
      </p>
      {home && (
        <div
          data-address-home
          className="rounded-xl border border-sky-200/25 bg-sky-200/10 px-4 py-3"
        >
          <h3 className="break-keep font-bold text-sky-50 text-sm">
            {home.name}
          </h3>
          <p className="mt-1 break-keep text-sky-50/85 text-xs leading-relaxed">
            {home.text}
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {outer.map((f, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 주소 차례가 곧 자리다(같은 이름이 두 번 나올 수 있다)
          <li key={`${i}-${f.name}`}>
            <details className="group rounded-lg bg-white/5 px-3 py-2">
              <summary className="cursor-pointer list-none break-keep text-white/80 text-xs [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block text-white/40 transition-transform group-open:rotate-90"
                >
                  ›
                </span>
                {f.name}
              </summary>
              <p className="mt-1.5 break-keep text-white/65 text-xs leading-relaxed">
                {f.text}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 산개 성단(벌집 성단 M44) 무늬: 별 몇 개를 모아 그린다 */
function ClusterMark({ className }: { className?: string }) {
  const stars: [number, number, number][] = [
    [8, 6, 1.6],
    [13, 9, 1.2],
    [5, 11, 1.1],
    [10, 13, 1.5],
    [15, 14, 0.9],
    [6, 16, 0.9],
  ];
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {stars.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="currentColor" />
      ))}
    </svg>
  );
}
