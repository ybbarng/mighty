"use client";

import {
  cardOf,
  type HwatuCard,
  type Month,
  RIBBON_NAMES,
} from "@mighty/hwatu";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/*
 * 화투 카드 그림(docs/27). 전통 화투 그림을 옮기지 않고 직접 그린 단순한 그림이다.
 * 휴대폰에서도 빨리 알아보게 달 숫자를 크게 쓰고, 종류(광·띠·열끗·쌍피)는 눈에 띄는 표시로 구분한다.
 * 그림 상자 60×96(화투 비율 5:8)
 */

const W = 60;
const H = 96;
const INK = "#2b1d14";
const PAPER = "#fbf5e6";
const RED = "#c2272d";

/** 달마다의 그림(가운데 영역 y 18~84) */
function Motif({ card }: { card: HwatuCard }): ReactNode {
  const isGwang = card.kind === "gwang";
  switch (card.month as Month) {
    case 1: // 송학: 소나무(광은 붉은 해와 학)
      return (
        <g>
          {isGwang && <circle cx={42} cy={30} r={9} fill={RED} />}
          <rect x={27} y={62} width={6} height={18} fill="#6b4226" />
          {[0, 1, 2].map((i) => (
            <polygon
              key={i}
              points={`${30 - 16 + i * 3},${66 - i * 13} 30,${44 - i * 13} ${30 + 16 - i * 3},${66 - i * 13}`}
              fill={i === 1 ? "#2f7d3a" : "#1f6a2c"}
            />
          ))}
          {isGwang && (
            <g>
              <ellipse
                cx={20}
                cy={74}
                rx={8}
                ry={4}
                fill="#ffffff"
                stroke={INK}
                strokeWidth={0.6}
              />
              <circle cx={13} cy={70} r={2.2} fill={RED} />
            </g>
          )}
        </g>
      );
    case 2: // 매조: 매화 가지
      return (
        <g>
          <path
            d="M8 78 Q28 58 52 30"
            stroke="#5b3a1e"
            strokeWidth={3}
            fill="none"
          />
          {[
            [16, 66],
            [28, 54],
            [40, 42],
            [50, 32],
            [22, 46],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <circle
                  key={a}
                  cx={(x as number) + 3.2 * Math.cos((a * Math.PI) / 180)}
                  cy={(y as number) + 3.2 * Math.sin((a * Math.PI) / 180)}
                  r={2.4}
                  fill="#e2475a"
                />
              ))}
              <circle cx={x} cy={y} r={1.2} fill="#f5d36b" />
            </g>
          ))}
        </g>
      );
    case 3: // 벚꽃(광은 장막)
      return (
        <g>
          {[
            [18, 34],
            [32, 28],
            [44, 38],
            [24, 48],
            [38, 52],
            [16, 60],
            [46, 62],
          ].map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={7}
              fill="#f3a6b8"
              stroke="#e17f97"
              strokeWidth={0.6}
            />
          ))}
          {isGwang && (
            <path
              d="M6 72 Q30 64 54 72 L54 84 L6 84 Z"
              fill={RED}
              stroke={INK}
              strokeWidth={0.6}
            />
          )}
        </g>
      );
    case 4: // 흑싸리: 늘어진 검은 송이
      return (
        <g>
          <path
            d="M8 22 Q30 30 52 22"
            stroke="#3a2b2b"
            strokeWidth={2}
            fill="none"
          />
          {[14, 24, 34, 44].map((x, i) =>
            [0, 1, 2, 3].map((k) => (
              <ellipse
                key={`${x}-${k}`}
                cx={x + (k % 2)}
                cy={30 + k * 8 + (i % 2) * 4}
                rx={3}
                ry={4}
                fill="#2d2433"
              />
            )),
          )}
        </g>
      );
    case 5: // 난초(창포): 파란 꽃잎과 긴 잎
      return (
        <g>
          {[18, 30, 42].map((x) => (
            <path
              key={x}
              d={`M${x} 84 Q${x - 4} 56 ${x + 2} 30`}
              stroke="#2f7d3a"
              strokeWidth={2}
              fill="none"
            />
          ))}
          {[
            [20, 36],
            [36, 30],
            [44, 48],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <ellipse cx={x} cy={y} rx={4} ry={7} fill="#4f5fb8" />
              <ellipse
                cx={(x as number) - 5}
                cy={(y as number) + 4}
                rx={3}
                ry={5}
                fill="#6a78cf"
                transform={`rotate(-30 ${(x as number) - 5} ${(y as number) + 4})`}
              />
            </g>
          ))}
        </g>
      );
    case 6: // 모란: 큰 붉은 꽃
      return (
        <g>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <ellipse
              key={a}
              cx={30 + 9 * Math.cos((a * Math.PI) / 180)}
              cy={46 + 9 * Math.sin((a * Math.PI) / 180)}
              rx={8}
              ry={6}
              fill="#d7263d"
              transform={`rotate(${a} ${30 + 9 * Math.cos((a * Math.PI) / 180)} ${46 + 9 * Math.sin((a * Math.PI) / 180)})`}
            />
          ))}
          <circle cx={30} cy={46} r={6} fill="#a3172b" />
          <path d="M12 76 Q22 62 30 70 Q38 62 48 76" fill="#2f7d3a" />
        </g>
      );
    case 7: // 홍싸리: 붉은 작은 잎이 달린 휜 가지
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${10 + i * 6} 84 Q${30} ${50 - i * 10} ${50 - i * 4} ${28 + i * 6}`}
              stroke="#6b4226"
              strokeWidth={1.4}
              fill="none"
            />
          ))}
          {Array.from({ length: 14 }, (_, k) => (
            <ellipse
              // biome-ignore lint/suspicious/noArrayIndexKey: 잎 순서가 곧 정체다
              key={k}
              cx={14 + ((k * 7) % 34)}
              cy={30 + ((k * 11) % 46)}
              rx={2.6}
              ry={1.6}
              fill="#c2272d"
            />
          ))}
        </g>
      );
    case 8: // 공산: 붉은 하늘과 검은 산(광은 보름달)
      return (
        <g>
          <rect
            x={4}
            y={18}
            width={52}
            height={40}
            fill={isGwang ? "#d64a3a" : "#e7d3b3"}
          />
          {isGwang && <circle cx={30} cy={36} r={12} fill="#fbf0c8" />}
          <path
            d="M4 84 L4 56 Q18 40 30 52 Q42 40 56 56 L56 84 Z"
            fill="#1d1a19"
          />
          {[14, 22, 38, 46].map((x) => (
            <path
              key={x}
              d={`M${x} 60 L${x + 2} 46`}
              stroke="#d9c39a"
              strokeWidth={1}
            />
          ))}
        </g>
      );
    case 9: // 국화: 노란 꽃
      return (
        <g>
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k * 30 * Math.PI) / 180;
            return (
              <ellipse
                // biome-ignore lint/suspicious/noArrayIndexKey: 꽃잎 순서가 곧 정체다
                key={k}
                cx={30 + 10 * Math.cos(a)}
                cy={44 + 10 * Math.sin(a)}
                rx={6}
                ry={2.6}
                fill="#f2b632"
                transform={`rotate(${k * 30} ${30 + 10 * Math.cos(a)} ${44 + 10 * Math.sin(a)})`}
              />
            );
          })}
          <circle cx={30} cy={44} r={5} fill="#d9861c" />
          <path d="M30 56 L30 84" stroke="#2f7d3a" strokeWidth={2} />
        </g>
      );
    case 10: // 단풍: 붉은 단풍잎
      return (
        <g>
          {[
            [18, 32],
            [40, 30],
            [28, 52],
            [44, 64],
            [14, 68],
          ].map(([x, y]) => (
            <polygon
              key={`${x}-${y}`}
              points={Array.from({ length: 10 }, (_, k) => {
                const r = k % 2 === 0 ? 8 : 3.4;
                const a = (k * 36 - 90) * (Math.PI / 180);
                return `${(x as number) + r * Math.cos(a)},${(y as number) + r * Math.sin(a)}`;
              }).join(" ")}
              fill="#d2412a"
            />
          ))}
        </g>
      );
    case 11: // 오동: 큰 잎(광은 봉황)
      return (
        <g>
          {[
            [18, 60],
            [42, 64],
            [30, 74],
          ].map(([x, y]) => (
            <ellipse
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              rx={12}
              ry={9}
              fill="#2a3a2a"
            />
          ))}
          {isGwang ? (
            <g>
              <ellipse cx={30} cy={36} rx={10} ry={6} fill="#e0a92a" />
              <path
                d="M38 34 Q50 20 54 30"
                stroke={RED}
                strokeWidth={2.4}
                fill="none"
              />
              <circle cx={22} cy={32} r={3} fill={RED} />
            </g>
          ) : (
            <path
              d="M30 22 L30 50 M22 30 L38 30"
              stroke="#6b5a3a"
              strokeWidth={2}
            />
          )}
        </g>
      );
    case 12: // 비: 버들과 비(광은 우산 쓴 사람)
      return (
        <g>
          {[10, 18, 26, 34, 42, 50].map((x) => (
            <path
              key={x}
              d={`M${x} 18 Q${x + 2} 50 ${x - 2} 84`}
              stroke="#3c6b3c"
              strokeWidth={1.4}
              fill="none"
            />
          ))}
          {isGwang && (
            <g>
              <path
                d="M16 52 Q30 36 44 52 Z"
                fill="#c8302e"
                stroke={INK}
                strokeWidth={0.6}
              />
              <path d="M30 52 L30 72" stroke={INK} strokeWidth={1.6} />
              <rect
                x={24}
                y={66}
                width={12}
                height={16}
                rx={2}
                fill="#3a3a6a"
              />
            </g>
          )}
        </g>
      );
  }
}

/** 카드 종류 표시: 광 배지, 띠, 열끗 이름, 쌍피 ×2 */
function KindMark({ card }: { card: HwatuCard }): ReactNode {
  if (card.kind === "gwang")
    return (
      <g>
        <circle
          cx={50}
          cy={11}
          r={8}
          fill={RED}
          stroke="#fff"
          strokeWidth={1}
        />
        <text
          x={50}
          y={11.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fontWeight={800}
          fill="#fff"
        >
          光
        </text>
      </g>
    );
  if (card.kind === "ribbon") {
    const color = card.ribbon === "blue" ? "#2453a6" : RED;
    return (
      <g>
        <rect
          x={20}
          y={30}
          width={20}
          height={44}
          rx={2}
          fill={color}
          stroke={INK}
          strokeWidth={0.6}
        />
        {card.ribbon !== "plain" && (
          <text
            x={30}
            y={52}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8.5}
            fontWeight={800}
            fill="#fff"
            style={{ writingMode: "vertical-rl" }}
          >
            {RIBBON_NAMES[card.ribbon ?? "plain"]}
          </text>
        )}
      </g>
    );
  }
  if (card.kind === "animal")
    return (
      <g>
        <rect x={9} y={82} width={42} height={11} rx={5.5} fill={INK} />
        <text
          x={30}
          y={87.8}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={7.5}
          fontWeight={700}
          fill="#fff"
        >
          {card.name.split(" ")[1]}
          {card.bird ? " · 새" : ""}
        </text>
      </g>
    );
  if (card.piValue === 2)
    return (
      <g>
        <rect x={38} y={4} width={18} height={12} rx={6} fill={INK} />
        <text
          x={47}
          y={10.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight={800}
          fill="#fff"
        >
          ×2
        </text>
      </g>
    );
  return null;
}

/** 카드 뒷면: 붉은 바탕에 마름모 무늬 */
function Back(): ReactNode {
  return (
    <g>
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={5}
        fill="#b3202a"
        stroke="#5a0d12"
        strokeWidth={1.5}
      />
      <rect
        x={6}
        y={6}
        width={W - 12}
        height={H - 12}
        rx={3}
        fill="none"
        stroke="#e8b04a"
        strokeWidth={1}
      />
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 3 }, (_, col) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: 무늬 자리가 곧 정체다
            key={`${row}-${col}`}
            x={15 + col * 15 - 3}
            y={16 + row * 16 - 3}
            width={6}
            height={6}
            fill="#e8b04a"
            transform={`rotate(45 ${15 + col * 15} ${16 + row * 16})`}
          />
        )),
      )}
    </g>
  );
}

/**
 * 화투 카드 한 장. `id`가 없거나 `faceDown`이면 뒷면.
 * 크기는 `width`(px), 높이는 화투 비율(5:8)로 정해진다. 누를 수 있으면 단추로 그린다
 */
export function HwatuCardView({
  id,
  faceDown = false,
  width = 56,
  selected = false,
  dim = false,
  highlight = false,
  onClick,
  className,
}: {
  id?: string;
  faceDown?: boolean;
  width?: number;
  /** 고른 카드(위로 살짝 뜬다) */
  selected?: boolean;
  /** 지금 낼 수 없는 카드(흐리게) */
  dim?: boolean;
  /** 짝이 맞는 바닥 카드 등(테두리 강조) */
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const card = id && !faceDown ? cardOf(id) : null;
  const svg = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={(width * H) / W}
      aria-hidden="true"
      className="block"
    >
      {card ? (
        <g>
          <rect
            x={1}
            y={1}
            width={W - 2}
            height={H - 2}
            rx={5}
            fill={PAPER}
            stroke={INK}
            strokeWidth={1.5}
          />
          <Motif card={card} />
          <KindMark card={card} />
          <text x={6} y={13} fontSize={13} fontWeight={900} fill={RED}>
            {card.month}
          </text>
        </g>
      ) : (
        <Back />
      )}
    </svg>
  );
  const label = card ? card.name : "뒷면 화투";
  const classes = cn(
    "relative shrink-0 rounded-md shadow-[1px_2px_4px_rgba(0,0,0,0.45)] transition",
    selected && "-translate-y-2 ring-2 ring-amber-300",
    // 휴대폰에서도 잘 보이게 두꺼운 테두리, 빛, 살짝 뜨기
    highlight &&
      "-translate-y-1 shadow-[0_0_14px_rgba(125,211,252,0.85)] ring-[3px] ring-sky-300",
    dim && "opacity-45",
    className,
  );
  return onClick ? (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-card={id}
      onClick={onClick}
      className={classes}
    >
      {svg}
    </button>
  ) : (
    <span
      role="img"
      aria-label={label}
      data-card={card ? id : undefined}
      className={cn(classes, "inline-block")}
    >
      {svg}
    </span>
  );
}
