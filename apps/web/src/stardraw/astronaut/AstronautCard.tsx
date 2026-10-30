"use client";

import type { Clock } from "@mighty/fair-play";
import { toHex } from "@mighty/stardraw-core";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { Avatar, EGG_LABEL } from "./Avatar";
import type { Astronaut } from "./identity";
import { ART_H, ART_W, keyArt } from "./key-art";
import { PasskeyMark, Seal } from "./marks";
import { OWNER_CHECK_SECONDS } from "./owner-check";
import { CardSecurity, Kinegram } from "./security";

/** 등록 일자 칸: 장부에서 읽는 중, 아직 첫 응모 전, 등록 회차의 날짜 */
export type Registered =
  | { state: "loading" }
  | { state: "pending" }
  | { state: "done"; date: string; round: string };

/** 발급 기관(지어낸 기관). 하늘의 별 따기는 카노푸스 우주국이 여는 추첨이라는 설정이다 */
export const AGENCY = "카노푸스 우주국장";

type Owner = "idle" | "checking" | "ok" | "fail";
/** 뒷면 공개 열쇠: 가림, 본인 확인 중, 보임 */
type Reveal = "hidden" | "checking" | "shown";

/** 최대 기울기(도) */
const TILT = 12;
/** 이만큼 움직이지 않고 떼면 누른 것으로 본다(px) */
const TAP_SLOP = 8;
/** 가로로 카드 너비의 이만큼 넘게 밀고 떼면 뒤집는다 */
const FLIP_RATIO = 0.35;

/**
 * 우주인 등록증 앞면(docs/36 11-9). 실제 신분증처럼 칸을 나눈다: 성명, 등록번호, 주소(줄여 보이고 누르면 전체), 등록일.
 * - 마우스를 올리거나 끌면 좌우로 살짝 기울고 홀로그램 빛이 지나간다. 움직임 줄이기면 기울지 않는다.
 * - 누르면 주인 확인(`onCheck`): 통과하면 "본인 확인됨"과 지금 시각이 초 단위로 흐르고 홀로그램이 움직인다(캡처와 구분).
 *   30초 뒤 원래대로. 실패·취소면 조용히 "확인하지 못했습니다".
 *   "내 패스키가 이 카드 열쇠와 맞다"를 나에게 보여 주는 체험일 뿐, 남에게 보여 주는 증명이 아니다
 *   (가짜 페이지도 같은 표시를 흉내 낼 수 있다). 남에게 당첨을 증명하는 길은 당첨자 확인(별 세 개)이다.
 * - 뒷면(`pub`·`onReveal`이 있을 때): 옆으로 세게 밀거나 「뒷면 보기」로 뒤집는다. 공개 열쇠로 그린 별 무늬와 가린 공개 열쇠 줄.
 *   가린 줄을 누르면 본인 확인 뒤 공개 열쇠와 복사 단추를 보인다. 30초 뒤나 다시 뒤집으면 가린다.
 *   공개 열쇠는 비밀이 아니다(장부와 기기에 있다). 캡처·어깨너머로 장부 속 내 응모가 바로 찾히지 않게 하는 실수 방지다.
 *   앞면은 주인 확인, 뒷면은 열쇠 꺼내 보기로 역할을 나눈다. 앞면과 공유에는 공개 열쇠를 넣지 않는다.
 */
export function AstronautCard({
  astronaut: a,
  registered,
  clock,
  onCheck,
  forced,
  pub,
  onReveal,
}: {
  astronaut: Astronaut;
  registered: Registered;
  clock: Clock;
  onCheck?: (() => Promise<boolean>) | undefined;
  /** 바깥에서 정한 확인 상태(당첨자 확인 승인 때 등록증이 같은 움직임으로 확인되는 모습) */
  forced?: "checking" | "ok" | undefined;
  /** 뒷면에 둘 공개 열쇠(없으면 뒤집지 않는다) */
  pub?: Uint8Array | undefined;
  /** 뒷면 공개 열쇠를 꺼내기 전 본인 확인 */
  onReveal?: (() => Promise<boolean>) | undefined;
}) {
  const card = useRef<HTMLDivElement>(null);
  const press = useRef<{
    x: number;
    y: number;
    w: number;
    dx: number;
    moved: boolean;
  } | null>(null);
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

  // 꺼낸 공개 열쇠는 30초 뒤 다시 가린다
  useEffect(() => {
    if (reveal !== "shown") return;
    return clock.after(OWNER_CHECK_SECONDS * 1000, () => {
      setReveal("hidden");
      setKeyCopied(false);
    });
  }, [reveal, clock]);

  const flip = () => {
    if (!canFlip) return;
    flipTurn.current += 1;
    setFlipped((v) => !v);
    setReveal("hidden");
    setKeyCopied(false);
  };

  const revealKey = async () => {
    if (!onReveal || reveal !== "hidden") return;
    const turn = flipTurn.current;
    setReveal("checking");
    const ok = await onReveal();
    if (flipTurn.current !== turn) return;
    // 실패·취소면 조용히 그대로 가린다
    setReveal(ok ? "shown" : "hidden");
  };

  /** 가로로 충분히 밀고 뗐는가 */
  const swiped = (p: { w: number; dx: number; moved: boolean } | null) =>
    canFlip && p?.moved === true && Math.abs(p.dx) > p.w * FLIP_RATIO;

  const tilt = (ry: number, rx: number, hx: number) => {
    const el = card.current;
    if (!el || reduce.current) return;
    el.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
    el.style.setProperty("--hx", `${hx}%`);
    // 기울기 세기(0~1): 무지개 필름과 키네그램이 이 값으로 빛난다
    el.style.setProperty(
      "--ht",
      Math.min(1, Math.hypot(ry, rx) / TILT).toFixed(3),
    );
  };
  const settle = () => {
    const el = card.current;
    if (!el) return;
    delete el.dataset.tilting;
    el.style.transform = "";
    el.style.removeProperty("--hx");
    el.style.removeProperty("--ht");
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
      p.dx = dx;
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
        <div
          className="sd-idcard-flip relative"
          data-flipped={flipped ? "" : undefined}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: 카드 안에 다른 단추(주소·패스키 마크)가 있어 button으로 감쌀 수 없다 */}
          <div
            ref={card}
            role="button"
            tabIndex={0}
            aria-label={`우주인 등록증 ${a.name}. ${onCheck ? "누르면 본인 확인" : ""}`}
            data-idcard={a.number}
            data-owner={owner}
            inert={flipped}
            className={cn(
              "sd-idcard sd-idcard-face sd-idcard-sweep relative aspect-[1.586] w-full cursor-pointer select-none overflow-hidden rounded-[4.5cqw] text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
            )}
            onPointerDown={(e) => {
              press.current = {
                x: e.clientX,
                y: e.clientY,
                w: e.currentTarget.getBoundingClientRect().width,
                dx: 0,
                moved: false,
              };
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              const p = press.current;
              press.current = null;
              settle();
              if (swiped(p)) flip();
              else if (p && !p.moved) void check();
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
            <CardSecurity />

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

            <Kinegram />
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
          {canFlip && art && (
            // biome-ignore lint/a11y/useSemanticElements: 뒷면은 묶음일 뿐 입력 양식이 아니라 fieldset을 쓰지 않는다
            <div
              data-idcard-back
              inert={!flipped}
              aria-label="우주인 등록증 뒷면"
              role="group"
              className="sd-idcard sd-idcard-face sd-idcard-back absolute inset-0 select-none overflow-hidden rounded-[4.5cqw] text-white"
              onPointerDown={(e) => {
                press.current = {
                  x: e.clientX,
                  y: e.clientY,
                  w: e.currentTarget.getBoundingClientRect().width,
                  dx: 0,
                  moved: false,
                };
              }}
              onPointerMove={(e) => {
                const p = press.current;
                if (!p) return;
                p.dx = e.clientX - p.x;
                if (Math.abs(p.dx) > TAP_SLOP) p.moved = true;
              }}
              onPointerUp={() => {
                const p = press.current;
                press.current = null;
                if (swiped(p)) flip();
              }}
              onPointerCancel={() => {
                press.current = null;
              }}
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
              <div className="sd-idcard-holo" />

              <div className="absolute inset-x-[5cqw] top-[4cqw] flex items-start justify-between">
                <span className="text-[2.3cqw] text-sky-100/60 tracking-[0.28em]">
                  STARDRAW · PUBLIC KEY
                </span>
                <span className="text-[2.6cqw] text-sky-50/80">
                  카노푸스 우주국
                </span>
              </div>

              <div className="absolute inset-x-[5cqw] bottom-[5cqw] flex flex-col gap-[1.2cqw] rounded-[2.4cqw] border border-white/15 bg-slate-950/55 px-[3cqw] py-[2.4cqw]">
                <div className="flex items-center justify-between">
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
                {reveal === "shown" ? (
                  <code
                    data-public-key
                    className="break-all font-mono text-[2.25cqw] text-white/90 leading-snug"
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
                    className="flex items-center justify-between gap-[2cqw] rounded-[1.4cqw] bg-white/5 px-[2cqw] py-[1.2cqw] text-left hover:bg-white/10"
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
          )}
        </div>
      </div>

      {canFlip && (
        <button
          type="button"
          data-flip-card
          onClick={flip}
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
            ? "이 값으로 장부 속 내 응모를 찾을 수 있습니다"
            : reveal === "checking"
              ? "꺼내 보기 전에 본인 확인을 하고 있습니다"
              : "공개 열쇠는 꺼내 보기 전에 본인 확인을 합니다"
          : owner === "checking"
            ? "등록증을 확인하고 있습니다"
            : owner === "fail"
              ? "확인하지 못했습니다"
              : owner === "ok"
                ? "이 기기의 패스키가 이 등록증의 열쇠와 맞습니다"
                : onCheck
                  ? "등록증을 누르면 본인 확인"
                  : ""}
      </p>

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

      {!flipped && fullAddress && (
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
