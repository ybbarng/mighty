import type { Suit } from "@mighty/engine";

import { SuitShape } from "./suits";

/*
 * 직접 그린 전통풍 그림 카드(J·Q·K). 위아래가 대칭인 상반신에 왕관·모자, 옷 무늬, 손에 든 물건.
 * 카드 그림 틀(가로 62~188, 세로 66~284) 안에서 위 절반만 그리고 180도 돌려 아래 절반을 만든다.
 */

const RED = "#c33a2f";
const BLUE = "#2b4a8e";
const GOLD = "#e2b23a";
const INK = "#1c1f24";
const SKIN = "#f5d9b5";
const HAIR_DARK = "#6b4426";
const HAIR_GOLD = "#d9a441";

const C = 125;
const MID = 175;

function KingTop({ suit, color }: { suit: Suit; color: string }) {
  return (
    <g>
      {/* 옷: 어깨와 망토 */}
      <path
        d={`M66 ${MID} L66 140 Q72 122 98 120 L152 120 Q178 122 184 140 L184 ${MID} Z`}
        fill={RED}
        stroke={INK}
        strokeWidth={1.6}
      />
      {/* 가운데 금색 띠와 무늬 */}
      <path
        d={`M110 121 L140 121 L146 ${MID} L104 ${MID} Z`}
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.4}
      />
      {[132, 145, 158].map((y) => (
        <path
          key={y}
          d={`M112 ${y} L125 ${y + 7} L138 ${y}`}
          fill="none"
          stroke={RED}
          strokeWidth={2.2}
        />
      ))}
      {/* 옆 무늬: 파란 띠에 금 점 */}
      <path
        d={`M72 ${MID} L74 142 Q80 130 96 127 L100 ${MID} Z`}
        fill={BLUE}
        stroke={INK}
        strokeWidth={1.2}
      />
      {[140, 152, 164].map((y) => (
        <circle key={y} cx={87} cy={y} r={2.4} fill={GOLD} />
      ))}
      {/* 흰 깃 */}
      <path
        d="M100 120 Q125 134 150 120 L146 114 Q125 124 104 114 Z"
        fill="#ffffff"
        stroke={INK}
        strokeWidth={1.4}
      />
      {/* 칼: 왼쪽에 세워 든다 */}
      <rect
        x={160}
        y={78}
        width={5}
        height={82}
        fill="#cfd5dc"
        stroke={INK}
        strokeWidth={1.2}
      />
      <rect
        x={153}
        y={150}
        width={19}
        height={5}
        rx={2}
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.2}
      />
      {/* 얼굴, 수염 */}
      <ellipse
        cx={C}
        cy={97}
        rx={15}
        ry={17}
        fill={SKIN}
        stroke={INK}
        strokeWidth={1.4}
      />
      <path
        d="M110 98 Q112 120 125 124 Q138 120 140 98 Q133 108 125 108 Q117 108 110 98 Z"
        fill={HAIR_GOLD}
        stroke={INK}
        strokeWidth={1.2}
      />
      <path
        d="M118 93 h4 M128 93 h4"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M125 95 L123 103 L127 103"
        fill="none"
        stroke={INK}
        strokeWidth={1.2}
      />
      {/* 왕관 */}
      <path
        d="M107 84 L109 66 L116 76 L125 62 L134 76 L141 66 L143 84 Z"
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.4}
      />
      <circle cx={125} cy={77} r={3} fill={RED} />
      <circle cx={113} cy={79} r={2} fill={BLUE} />
      <circle cx={137} cy={79} r={2} fill={BLUE} />
      {/* 왼쪽 위 무늬 */}
      <SuitShape suit={suit} x={80} y={84} size={22} fill={color} />
    </g>
  );
}

function QueenTop({ suit, color }: { suit: Suit; color: string }) {
  return (
    <g>
      {/* 머리카락이 어깨로 흘러내린다 */}
      <path
        d="M106 92 Q100 120 96 138 L112 132 L110 96 Z M144 92 Q150 120 154 138 L138 132 L140 96 Z"
        fill={HAIR_GOLD}
        stroke={INK}
        strokeWidth={1.2}
      />
      {/* 옷 */}
      <path
        d={`M66 ${MID} L66 146 Q74 126 100 124 L150 124 Q176 126 184 146 L184 ${MID} Z`}
        fill={BLUE}
        stroke={INK}
        strokeWidth={1.6}
      />
      <path
        d={`M106 124 L144 124 L150 ${MID} L100 ${MID} Z`}
        fill={RED}
        stroke={INK}
        strokeWidth={1.4}
      />
      {[136, 150, 164].map((y) => (
        <g key={y}>
          <circle
            cx={125}
            cy={y}
            r={4}
            fill={GOLD}
            stroke={INK}
            strokeWidth={1}
          />
          <path d={`M108 ${y} h8 M134 ${y} h8`} stroke={GOLD} strokeWidth={2} />
        </g>
      ))}
      {/* 레이스 깃 */}
      <path
        d="M102 124 Q125 138 148 124 Q140 132 125 134 Q110 132 102 124 Z"
        fill="#ffffff"
        stroke={INK}
        strokeWidth={1.2}
      />
      {/* 꽃: 오른손에 든다 */}
      <path d="M92 168 L92 128" stroke="#3e7a3a" strokeWidth={2.4} />
      <path
        d="M84 128 Q86 112 92 118 Q98 112 100 128 Q92 134 84 128 Z"
        fill={RED}
        stroke={INK}
        strokeWidth={1.2}
      />
      <path d="M92 150 Q84 146 82 140 Q90 140 92 146" fill="#3e7a3a" />
      {/* 얼굴 */}
      <ellipse
        cx={C}
        cy={99}
        rx={14}
        ry={17}
        fill={SKIN}
        stroke={INK}
        strokeWidth={1.4}
      />
      <path
        d="M118 96 h4 M128 96 h4"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M121 108 Q125 111 129 108"
        fill="none"
        stroke={RED}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <path
        d="M111 92 Q113 80 125 80 Q137 80 139 92 Q133 86 125 86 Q117 86 111 92 Z"
        fill={HAIR_GOLD}
        stroke={INK}
        strokeWidth={1.2}
      />
      {/* 작은 관 */}
      <path
        d="M111 82 Q114 68 118 76 Q121 64 125 72 Q129 64 132 76 Q136 68 139 82 Z"
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.4}
      />
      <circle cx={125} cy={76} r={2.6} fill={BLUE} />
      <SuitShape suit={suit} x={170} y={84} size={22} fill={color} />
    </g>
  );
}

function JackTop({ suit, color }: { suit: Suit; color: string }) {
  return (
    <g>
      {/* 옷 */}
      <path
        d={`M66 ${MID} L66 142 Q72 124 98 122 L152 122 Q178 124 184 142 L184 ${MID} Z`}
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.6}
      />
      <path
        d={`M84 ${MID} L92 124 L158 124 L166 ${MID} Z`}
        fill={RED}
        stroke={INK}
        strokeWidth={1.4}
      />
      {/* 어깨 띠: 비스듬히 */}
      <path
        d={`M100 124 L112 124 L160 ${MID} L146 ${MID} Z`}
        fill={BLUE}
        stroke={INK}
        strokeWidth={1.2}
      />
      {[138, 154].map((y) => (
        <circle key={y} cx={118 + (y - 124) * 0.9} cy={y} r={2.4} fill={GOLD} />
      ))}
      <path
        d="M102 122 Q125 132 148 122 L144 117 Q125 126 106 117 Z"
        fill="#ffffff"
        stroke={INK}
        strokeWidth={1.4}
      />
      {/* 도끼창: 왼쪽에 세워 든다 */}
      <rect
        x={78}
        y={74}
        width={4}
        height={96}
        fill={HAIR_DARK}
        stroke={INK}
        strokeWidth={1}
      />
      <path
        d="M80 74 L72 90 L80 96 Z"
        fill="#cfd5dc"
        stroke={INK}
        strokeWidth={1.2}
      />
      {/* 얼굴, 머리카락 */}
      <path
        d="M110 92 Q108 112 114 116 L136 116 Q142 112 140 92 Z"
        fill={HAIR_DARK}
        stroke={INK}
        strokeWidth={1.2}
      />
      <ellipse
        cx={C}
        cy={99}
        rx={13}
        ry={16}
        fill={SKIN}
        stroke={INK}
        strokeWidth={1.4}
      />
      <path
        d="M118 96 h4 M128 96 h4"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M121 107 h8"
        stroke={INK}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      {/* 모자와 깃털 */}
      <path
        d="M106 88 Q108 72 125 70 Q142 72 144 88 Z"
        fill={RED}
        stroke={INK}
        strokeWidth={1.4}
      />
      <rect
        x={106}
        y={84}
        width={38}
        height={6}
        rx={2}
        fill={GOLD}
        stroke={INK}
        strokeWidth={1.2}
      />
      <path
        d="M140 80 Q160 64 170 70 Q158 74 146 86 Z"
        fill={BLUE}
        stroke={INK}
        strokeWidth={1.2}
      />
      <SuitShape suit={suit} x={172} y={104} size={20} fill={color} />
    </g>
  );
}

/** 그림 틀: 전통 카드처럼 크게 쓴다(모서리 글씨 자리는 비운다) */
const FX = 54;
const FY = 58;
const FW = 142;
const FH = 234;

/** 직접 그린 그림 카드의 가운데 그림(틀 포함) */
export function CourtFigure({
  rank,
  suit,
  color,
}: {
  rank: "J" | "Q" | "K";
  suit: Suit;
  color: string;
}) {
  const Top = rank === "K" ? KingTop : rank === "Q" ? QueenTop : JackTop;
  const clipId = `court-${rank}-${suit}`;
  // 위 절반 그림(가로 62~188)을 넓어진 틀에 맞게 키운다.
  const grow = `translate(${C} ${MID}) scale(1.13 1.08) translate(${-C} ${-MID})`;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={FX} y={FY} width={FW} height={MID - FY} />
        </clipPath>
      </defs>
      <rect x={FX} y={FY} width={FW} height={FH} rx={6} fill="#fbf7ee" />
      <g clipPath={`url(#${clipId})`}>
        <g transform={grow}>
          <Top suit={suit} color={color} />
        </g>
      </g>
      <g transform={`rotate(180 ${C} ${MID})`}>
        <g clipPath={`url(#${clipId})`}>
          <g transform={grow}>
            <Top suit={suit} color={color} />
          </g>
        </g>
      </g>
      <line
        x1={FX}
        y1={MID}
        x2={FX + FW}
        y2={MID}
        stroke={INK}
        strokeWidth={1.4}
      />
      <rect
        x={FX}
        y={FY}
        width={FW}
        height={FH}
        rx={6}
        fill="none"
        stroke={INK}
        strokeWidth={2}
      />
    </g>
  );
}

const SUIT_WORD: Record<Suit, string> = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
};
const RANK_WORD = { J: "jack", Q: "queen", K: "king" } as const;

/** public/cards/traditional 에 있는 그림. 아직 받지 못한 것은 직접 그린 그림으로 대신한다 */
const TRADITIONAL_AVAILABLE = new Set([
  "jack_spades",
  "jack_hearts",
  "jack_diamonds",
  "jack_clubs",
  "queen_spades",
  "queen_hearts",
  "queen_diamonds",
  "queen_clubs",
  "king_spades",
  "king_hearts",
]);

/**
 * 전통 그림 카드(Dmitry Fomin, 위키미디어 공용, CC0)에서 인물 그림만 떼어 우리 카드 틀에 넣는다.
 * 원본(360×540)은 인물을 어긋난 두 직사각형 (60,30)–(330,390)과 (30,150)–(300,510)에 그리고
 * 빈 모서리에 글씨를 둔다. 두 직사각형을 합친 모양으로 잘라 원본 글씨는 빼고, 비율은 그대로 둔다.
 */
const TRAD_FRAME = "M60 30 H330 V390 H300 V510 H30 V150 H60 Z";

export function TraditionalFigure({
  rank,
  suit,
  color,
  bold = false,
}: {
  rank: "J" | "Q" | "K";
  suit: Suit;
  color: string;
  /** 선을 굵게 해 작은 화면에서도 또렷하게 */
  bold?: boolean;
}) {
  const name = `${RANK_WORD[rank]}_${SUIT_WORD[suit]}`;
  if (!TRADITIONAL_AVAILABLE.has(name))
    return <CourtFigure rank={rank} suit={suit} color={color} />;
  return (
    <svg
      x={52}
      y={58}
      width={146}
      height={234}
      viewBox="30 30 300 480"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="trad-frame">
          <path d={TRAD_FRAME} />
        </clipPath>
        {bold && (
          <filter id="trad-bold" x="0" y="0" width="1" height="1">
            {/* 어두운 선만 골라(밝기 → 투명도, 뒤집어 문턱) 굵게 한 뒤 원래 그림 위에 다시 그린다 */}
            <feColorMatrix
              in="SourceGraphic"
              type="luminanceToAlpha"
              result="lum"
            />
            <feComponentTransfer in="lum" result="dark">
              <feFuncA type="discrete" tableValues="1 0 0 0 0 0 0 0 0 0 0 0" />
            </feComponentTransfer>
            <feMorphology
              in="dark"
              operator="dilate"
              radius="0.9"
              result="thick"
            />
            <feFlood floodColor="#111111" result="ink" />
            <feComposite in="ink" in2="thick" operator="in" result="lines" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="lines" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g clipPath="url(#trad-frame)">
        <image
          href={`/cards/traditional/${name}.svg`}
          width={360}
          height={540}
          {...(bold ? { filter: "url(#trad-bold)" } : {})}
        />
      </g>
      <path d={TRAD_FRAME} fill="none" stroke={INK} strokeWidth={3} />
    </svg>
  );
}
