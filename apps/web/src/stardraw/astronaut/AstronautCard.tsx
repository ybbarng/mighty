"use client";

import type { Clock } from "@mighty/fair-play";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { Avatar, EGG_LABEL } from "./Avatar";
import type { Astronaut } from "./identity";
import { PasskeyMark, Seal } from "./marks";
import { OWNER_CHECK_SECONDS } from "./owner-check";

/** 등록 일자 칸: 장부에서 읽는 중, 아직 첫 응모 전, 등록 회차의 날짜 */
export type Registered =
  | { state: "loading" }
  | { state: "pending" }
  | { state: "done"; date: string; round: string };

/** 발급 기관(지어낸 기관). 하늘의 별 따기는 카노푸스 우주국이 여는 추첨이라는 설정이다 */
export const AGENCY = "카노푸스 우주국장";

type Owner = "idle" | "checking" | "ok" | "fail";

/** 최대 기울기(도) */
const TILT = 12;
/** 이만큼 움직이지 않고 떼면 누른 것으로 본다(px) */
const TAP_SLOP = 8;

/**
 * 우주인 등록증 앞면(docs/36 11-9). 실제 신분증처럼 칸을 나눈다: 성명, 등록번호, 주소(줄여 보이고 누르면 전체), 등록일.
 * - 마우스를 올리거나 끌면 좌우로 살짝 기울고 홀로그램 빛이 지나간다. 움직임 줄이기면 기울지 않는다.
 * - 누르면 주인 확인(`onCheck`): 통과하면 "본인 확인됨"과 지금 시각이 초 단위로 흐르고 홀로그램이 움직인다(캡처와 구분).
 *   30초 뒤 원래대로. 실패·취소면 조용히 "확인하지 못했습니다".
 *   "내 패스키가 이 카드 열쇠와 맞다"를 나에게 보여 주는 체험일 뿐, 남에게 보여 주는 증명이 아니다
 *   (가짜 페이지도 같은 표시를 흉내 낼 수 있다). 남에게 당첨을 증명하는 길은 당첨자 확인(별 세 개)이다.
 */
export function AstronautCard({
  astronaut: a,
  registered,
  clock,
  onCheck,
  forced,
}: {
  astronaut: Astronaut;
  registered: Registered;
  clock: Clock;
  onCheck?: (() => Promise<boolean>) | undefined;
  /** 바깥에서 정한 확인 상태(당첨자 확인 승인 때 등록증이 같은 움직임으로 확인되는 모습) */
  forced?: "checking" | "ok" | undefined;
}) {
  const card = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [inner, setOwner] = useState<Owner>("idle");
  const owner: Owner = forced ?? inner;
  const [now, setNow] = useState(() => clock.now());
  const [fullAddress, setFullAddress] = useState(false);
  const [aboutMark, setAboutMark] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
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

  const tilt = (ry: number, rx: number, hx: number) => {
    const el = card.current;
    if (!el || reduce.current) return;
    el.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
    el.style.setProperty("--hx", `${hx}%`);
  };
  const settle = () => {
    const el = card.current;
    if (!el) return;
    delete el.dataset.tilting;
    el.style.transform = "";
    el.style.removeProperty("--hx");
  };

  const check = async () => {
    if (!onCheck || owner === "checking") return;
    setOwner("checking");
    setOwner((await onCheck()) ? "ok" : "fail");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = card.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = press.current;
    if (p) {
      // 끌기: 가로로 끈 만큼 기운다(세로는 화면 넘기기에 맡긴다)
      const dx = e.clientX - p.x;
      if (Math.abs(dx) > TAP_SLOP || Math.abs(e.clientY - p.y) > TAP_SLOP)
        p.moved = true;
      el.dataset.tilting = "";
      const k = Math.max(-1, Math.min(1, dx / (r.width / 2)));
      tilt(k * TILT, 0, 50 - k * 40);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.dataset.tilting = "";
    tilt(x * TILT * 2, -y * TILT, 50 - x * 80);
  };

  const regText =
    registered.state === "done"
      ? `${registered.date} · ${registered.round}`
      : registered.state === "pending"
        ? "첫 응모 때 기록"
        : "…";
  const time = new Date(now);
  const hms = [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full max-w-md [perspective:900px]">
        {/* biome-ignore lint/a11y/useSemanticElements: 카드 안에 다른 단추(주소·패스키 마크)가 있어 button으로 감쌀 수 없다 */}
        <div
          ref={card}
          role="button"
          tabIndex={0}
          aria-label={`우주인 등록증 ${a.name}. ${onCheck ? "누르면 본인 확인" : ""}`}
          data-idcard={a.number}
          data-owner={owner}
          className={cn(
            "sd-idcard sd-idcard-sweep relative aspect-[1.586] w-full cursor-pointer select-none overflow-hidden rounded-[4.5cqw] text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
          )}
          onPointerDown={(e) => {
            press.current = { x: e.clientX, y: e.clientY, moved: false };
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            const p = press.current;
            press.current = null;
            settle();
            if (p && !p.moved) void check();
          }}
          onPointerCancel={() => {
            press.current = null;
            settle();
          }}
          onPointerLeave={() => {
            if (!press.current) settle();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void check();
            }
          }}
        >
          {/* 머리 */}
          <div className="absolute inset-x-[5cqw] top-[4cqw] flex items-start justify-between">
            <div className="flex flex-col leading-none">
              <span className="font-black text-[6cqw] tracking-[0.06em]">
                우주인 등록증
              </span>
              <span className="mt-[1.2cqw] text-[2.3cqw] text-sky-100/60 tracking-[0.28em]">
                STARDRAW · ASTRONAUT ID
              </span>
            </div>
            <button
              type="button"
              aria-label="패스키 표시: 무엇인가요?"
              aria-expanded={aboutMark}
              data-passkey-badge
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
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
          <div className="absolute top-[17cqw] right-[5cqw] w-[23cqw]">
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
                className="-bottom-[1.6cqw] absolute inset-x-0 mx-auto w-max rounded-full bg-amber-300 px-[1.6cqw] py-[0.3cqw] font-bold text-[2cqw] text-slate-950"
              >
                ★ 드문 사진
              </span>
            )}
          </div>

          {/* 칸 */}
          <dl className="absolute top-[17cqw] right-[31cqw] left-[5cqw] grid grid-cols-[auto_1fr] items-baseline gap-x-[3cqw] gap-y-[1.6cqw]">
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
                aria-label={`주소: ${a.short.join(", ")}. 누르면 전체 주소`}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullAddress((v) => !v);
                }}
                className="line-clamp-2 break-keep text-left text-[2.9cqw] leading-snug underline decoration-white/25 decoration-dotted underline-offset-2"
              >
                {a.otherGalaxy ? "… › " : ""}
                {a.short.join(" › ")}
              </button>
            </dd>
            <dt className="text-[2.6cqw] text-sky-100/55">등록일</dt>
            <dd className="text-[3cqw] tabular-nums" data-registered>
              {regText}
            </dd>
          </dl>

          {/* 발급 */}
          <div className="absolute right-[5cqw] bottom-[3.6cqw] left-[5cqw] flex items-end justify-end gap-[2cqw]">
            <span className="mr-[14cqw] text-right text-[2.6cqw] text-sky-50/85 leading-tight">
              {AGENCY}
            </span>
            <Seal className="-right-[1cqw] absolute bottom-[-1.5cqw] size-[13cqw] opacity-95" />
          </div>

          <div className="sd-idcard-holo" />

          {owner === "ok" && (
            <div
              role="status"
              data-owner-ok
              className="absolute bottom-[4cqw] left-[5cqw] flex items-center gap-[1.4cqw] rounded-full bg-emerald-400/90 px-[2.6cqw] py-[0.8cqw] font-bold text-[2.8cqw] text-emerald-950 shadow-lg"
            >
              ✓ 이 기기에서 확인됨
              <span className="font-mono tabular-nums" data-owner-time>
                {hms}
              </span>
            </div>
          )}
        </div>
      </div>

      <p
        className="min-h-5 text-center text-white/60 text-xs"
        aria-live="polite"
      >
        {owner === "checking"
          ? "등록증을 확인하고 있습니다"
          : owner === "fail"
            ? "확인하지 못했습니다"
            : owner === "ok"
              ? "이 기기의 패스키가 이 등록증의 열쇠와 맞습니다"
              : onCheck
                ? "등록증을 누르면 본인 확인"
                : ""}
      </p>

      {(aboutMark || (owner === "ok" && !forced)) && (
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

      {fullAddress && (
        <p
          data-full-address
          className="break-keep text-center text-white/80 text-xs leading-relaxed"
        >
          {a.address.join(" › ")}
          {a.ly !== undefined && (
            <span className="block text-white/55">
              지구에서 약 {a.ly.toLocaleString("ko-KR")}광년
            </span>
          )}
        </p>
      )}
    </div>
  );
}
