import {
  type Card,
  isJoker,
  type Rank,
  rankOf,
  type Suit,
  suitOf,
} from "@mighty/engine";
import { memo, type ReactNode } from "react";

import { SPADE_PATH } from "../brand/brand";
import { CourtFigure } from "./court";
import { SuitShape } from "./suits";
import { type CardTheme, CLASSIC } from "./themes";

/** 카드 그림의 크기. 비율은 5:7 */
export const CARD_W = 250;
export const CARD_H = 350;

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

const L = 88;
const C = 125;
const R = 162;
const TOP = 88;
const BOTTOM = 262;
const MID = 175;
const Q1 = 146;
const Q3 = 204;

/** 숫자 카드의 무늬 자리 [x, y]. 가운데보다 아래는 거꾸로 그린다(전통 배치) */
const PIPS: Partial<Record<Rank, [number, number][]>> = {
  "2": [
    [C, TOP],
    [C, BOTTOM],
  ],
  "3": [
    [C, TOP],
    [C, MID],
    [C, BOTTOM],
  ],
  "4": [
    [L, TOP],
    [R, TOP],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  "5": [
    [L, TOP],
    [R, TOP],
    [C, MID],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  "6": [
    [L, TOP],
    [R, TOP],
    [L, MID],
    [R, MID],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  "7": [
    [L, TOP],
    [R, TOP],
    [C, (TOP + MID) / 2],
    [L, MID],
    [R, MID],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  "8": [
    [L, TOP],
    [R, TOP],
    [C, (TOP + MID) / 2],
    [L, MID],
    [R, MID],
    [C, (MID + BOTTOM) / 2],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  "9": [
    [L, TOP],
    [R, TOP],
    [L, Q1],
    [R, Q1],
    [C, MID],
    [L, Q3],
    [R, Q3],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
  "10": [
    [L, TOP],
    [R, TOP],
    [C, (TOP + Q1) / 2],
    [L, Q1],
    [R, Q1],
    [L, Q3],
    [R, Q3],
    [C, (Q3 + BOTTOM) / 2],
    [L, BOTTOM],
    [R, BOTTOM],
  ],
};

/** 모서리 숫자와 무늬. 겹친 손패에서 보이는 부분이라 크게 그린다 */
function Corner({
  rank,
  suit,
  color,
  large = false,
}: {
  rank: string;
  suit: Suit;
  color: string;
  large?: boolean;
}) {
  const scale = large ? 1.4 : 1;
  return (
    <g>
      <text
        x={34 * scale}
        y={58 * scale}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={(rank === "10" ? 46 : 54) * scale}
        letterSpacing={rank === "10" ? -4 * scale : 0}
        fill={color}
      >
        {rank}
      </text>
      <SuitShape
        suit={suit}
        x={34 * scale}
        y={86 * scale}
        size={34 * scale}
        fill={color}
      />
    </g>
  );
}

/** 왕관(K), 작은 왕관(Q), 깃털(J) */
function FaceOrnament({
  rank,
  color,
}: {
  rank: "J" | "Q" | "K";
  color: string;
}) {
  if (rank === "K") {
    return (
      <path
        d="M95 112 L105 84 L118 102 L125 78 L132 102 L145 84 L155 112 Z"
        fill={color}
      />
    );
  }
  if (rank === "Q") {
    return (
      <g fill={color}>
        <path d="M100 112 L108 92 L118 104 L125 88 L132 104 L142 92 L150 112 Z" />
        <circle cx={108} cy={88} r={5} />
        <circle cx={125} cy={83} r={5} />
        <circle cx={142} cy={88} r={5} />
      </g>
    );
  }
  return (
    <path
      d="M112 112 C110 96 118 84 136 78 C130 88 132 98 138 112 Z"
      fill={color}
    />
  );
}

function Face({
  rank,
  suit,
  color,
  tint,
}: {
  rank: "J" | "Q" | "K";
  suit: Suit;
  color: string;
  tint: string;
}) {
  return (
    <g>
      <rect
        x={62}
        y={66}
        width={126}
        height={218}
        rx={14}
        fill={tint}
        stroke={color}
        strokeWidth={3}
      />
      <FaceOrnament rank={rank} color={color} />
      <text
        x={C}
        y={212}
        textAnchor="middle"
        fontFamily={SERIF}
        fontWeight={700}
        fontSize={104}
        fill={color}
      >
        {rank}
      </text>
      <SuitShape suit={suit} x={C} y={252} size={30} fill={color} />
    </g>
  );
}

function Joker({ theme }: { theme: CardTheme }) {
  const { field, disc, star } = theme.joker;
  const letters = [..."JOKER"];
  return (
    <g>
      <rect
        x={10}
        y={10}
        width={CARD_W - 20}
        height={CARD_H - 20}
        rx={14}
        fill={field}
      />
      {letters.map((ch, i) => (
        <text
          key={ch}
          x={34}
          y={44 + i * 30}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={28}
          fill={disc}
        >
          {ch}
        </text>
      ))}
      <circle
        cx={C}
        cy={MID}
        r={76}
        fill={disc}
        stroke={star}
        strokeWidth={5}
      />
      <path
        d="M125 112 L139 152 L182 153 L148 179 L160 221 L125 196 L90 221 L102 179 L68 153 L111 152 Z"
        fill={star}
      />
    </g>
  );
}

function Back({ theme }: { theme: CardTheme }) {
  const { base, stripe, accent, pattern = "diamond" } = theme.back;
  const id = `back-${theme.id}-${base.slice(1)}-${pattern}`;
  return (
    <g>
      <defs>
        {pattern === "diamond" && (
          <pattern
            id={id}
            width={20}
            height={20}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={20} height={20} fill={base} />
            <rect width={10} height={10} fill={stripe} />
          </pattern>
        )}
        {pattern === "stripe" && (
          <pattern
            id={id}
            width={16}
            height={16}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-30)"
          >
            <rect width={16} height={16} fill={base} />
            <rect width={6} height={16} fill={stripe} />
          </pattern>
        )}
        {pattern === "dots" && (
          <pattern id={id} width={18} height={18} patternUnits="userSpaceOnUse">
            <rect width={18} height={18} fill={base} />
            <circle cx={9} cy={9} r={3.5} fill={stripe} />
          </pattern>
        )}
        {pattern === "spades" && (
          <pattern id={id} width={36} height={36} patternUnits="userSpaceOnUse">
            <rect width={36} height={36} fill={base} />
            <path
              d={SPADE_PATH}
              transform="translate(1 1) scale(0.16)"
              fill={stripe}
            />
            <path
              d={SPADE_PATH}
              transform="translate(19 19) scale(0.16)"
              fill={stripe}
            />
          </pattern>
        )}
      </defs>
      <rect
        x={12}
        y={12}
        width={226}
        height={326}
        rx={14}
        fill={`url(#${id})`}
        stroke={accent}
        strokeWidth={4}
      />
      <circle
        cx={C}
        cy={MID}
        r={46}
        fill={base}
        stroke={accent}
        strokeWidth={4}
      />
      <text
        x={C}
        y={MID + 20}
        textAnchor="middle"
        fontFamily={FONT}
        fontWeight={900}
        fontSize={58}
        fill={accent}
      >
        M
      </text>
    </g>
  );
}

/** 카드 한 장의 그림. `card`가 `null`이면 뒷면 */
export const CardArt = memo(function CardArt({
  card,
  theme = CLASSIC,
}: {
  card: Card | null;
  theme?: CardTheme;
}) {
  let body: ReactNode;
  if (card === null) {
    body = <Back theme={theme} />;
  } else if (isJoker(card)) {
    body = <Joker theme={theme} />;
  } else {
    const suit = suitOf(card);
    const rank = rankOf(card);
    const faces = theme.faces;
    const isFace = rank === "J" || rank === "Q" || rank === "K";
    if (isFace && faces?.kind === "image") {
      // 카드 한 장 전체가 그림 파일이다(모서리 숫자까지 들어 있다).
      return (
        <svg
          viewBox={`0 0 ${CARD_W} ${CARD_H}`}
          className="block h-full w-full"
          aria-hidden="true"
        >
          <rect
            x={1}
            y={1}
            width={CARD_W - 2}
            height={CARD_H - 2}
            rx={16}
            fill={theme.paper}
          />
          <image
            href={faces.href(suit, rank)}
            x={0}
            y={0}
            width={CARD_W}
            height={CARD_H}
            preserveAspectRatio="none"
          />
        </svg>
      );
    }
    const color = theme.suitColor[suit];
    const large = theme.largeIndex ?? false;
    body = (
      <g>
        <Corner rank={rank} suit={suit} color={color} large={large} />
        <g transform={`rotate(180 ${C} ${MID})`}>
          <Corner rank={rank} suit={suit} color={color} large={large} />
        </g>
        {/* 큰 글자 테마는 모서리와 겹치지 않게 가운데 그림을 줄인다. */}
        <g
          transform={
            large
              ? `translate(${C} ${MID}) scale(0.7) translate(${-C} ${-MID})`
              : undefined
          }
        >
          {rank === "A" ? (
            <SuitShape
              suit={suit}
              x={C}
              y={MID}
              size={suit === "S" ? 130 : 110}
              fill={color}
            />
          ) : isFace && faces?.kind === "court" ? (
            <CourtFigure rank={rank} suit={suit} color={color} />
          ) : rank === "J" || rank === "Q" || rank === "K" ? (
            <Face
              rank={rank}
              suit={suit}
              color={color}
              tint={theme.faceTint[suit]}
            />
          ) : (
            (PIPS[rank] ?? []).map(([x, y]) => (
              <SuitShape
                key={`${x}-${y}`}
                suit={suit}
                x={x}
                y={y}
                size={46}
                flip={y > MID}
                fill={color}
              />
            ))
          )}
        </g>
      </g>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      className="block h-full w-full"
      aria-hidden="true"
    >
      <rect
        x={1}
        y={1}
        width={CARD_W - 2}
        height={CARD_H - 2}
        rx={16}
        fill={theme.paper}
        stroke={theme.edge}
        strokeWidth={2}
      />
      {body}
    </svg>
  );
});
