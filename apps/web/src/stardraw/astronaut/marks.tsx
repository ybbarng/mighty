"use client";

import { useId } from "react";

/**
 * 발급 기관 직인: 용골자리(카노푸스가 속한 별자리)의 별과 선으로 이룬 붉은 네모 인장(전각 느낌으로 가장자리를 거칠게).
 * 지어낸 기관 "카노푸스 우주국장"의 것이다. 별 자리는 실제 적경·적위를 동쪽이 왼쪽이 되게 펴서 인장 위쪽에 맞췄다.
 */
export function Seal({
  className,
  text = "우주국장",
  label = "카노푸스 우주국장 직인",
}: {
  className?: string;
  /** 아래 글자(등록증은 "우주국장", 당첨 직인은 "당첨") */
  text?: string;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  // 용골자리 밝은 별(동쪽이 왼쪽): 카노푸스 α, χ, ε(아비오르), ι(아스피디스케), q, p, θ, ω, β(미아플라키두스), υ
  const at = {
    alpha: [84, 18],
    chi: [61, 19],
    epsilon: [54, 31],
    iota: [40, 30],
    q: [25, 34],
    p: [21, 35],
    theta: [18, 40],
    omega: [26, 49],
    beta: [41, 48],
    upsilon: [33, 40],
  } as const;
  type Star = keyof typeof at;
  const lines: Star[][] = [
    ["alpha", "chi", "epsilon", "iota", "q", "p", "theta"],
    ["epsilon", "beta", "omega", "theta"],
    ["iota", "upsilon", "beta"],
  ];
  const star = (x: number, y: number, r: number) =>
    `M${x} ${y - r} L ${x + r * 0.3} ${y - r * 0.3} L ${x + r} ${y} L ${x + r * 0.3} ${y + r * 0.3} L ${x} ${y + r} L ${x - r * 0.3} ${y + r * 0.3} L ${x - r} ${y} L ${x - r * 0.3} ${y - r * 0.3} Z`;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={label}
      data-seal
    >
      <defs>
        <filter id={`${id}-rough`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="7"
          />
          <feDisplacementMap in="SourceGraphic" scale="2.6" />
        </filter>
        <mask id={`${id}-ink`}>
          <rect width="100" height="100" fill="#fff" />
          <filter id={`${id}-speck`}>
            <feTurbulence type="fractalNoise" baseFrequency="1.6" seed="3" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.25" />
          </filter>
          <rect width="100" height="100" filter={`url(#${id}-speck)`} />
        </mask>
      </defs>
      <g
        filter={`url(#${id}-rough)`}
        mask={`url(#${id}-ink)`}
        fill="#c8102e"
        stroke="#c8102e"
      >
        <rect
          x="4"
          y="4"
          width="92"
          height="92"
          rx="7"
          fill="none"
          strokeWidth="6"
        />
        <rect
          x="11"
          y="11"
          width="78"
          height="78"
          rx="3"
          fill="none"
          strokeWidth="1.4"
        />
        {lines.map((l) => (
          <polyline
            key={l.join("-")}
            points={l.map((k) => at[k].join(",")).join(" ")}
            fill="none"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        ))}
        {(Object.keys(at) as Star[]).map((k) => (
          <path
            key={k}
            d={star(at[k][0], at[k][1], k === "alpha" ? 7.5 : 4)}
            stroke="none"
          />
        ))}
        <text
          x="50"
          y={text.length <= 2 ? 80 : 77}
          textAnchor="middle"
          fontFamily="'Nanum Myeongjo','Noto Serif KR','AppleMyungjo','Batang',serif"
          fontWeight="900"
          fontSize={text.length <= 2 ? 22 : 16}
          letterSpacing={text.length <= 2 ? 4 : 0.5}
          stroke="none"
        >
          {text}
        </text>
      </g>
    </svg>
  );
}

/**
 * 패스키 마크(직접 그림): 열쇠 머리에 지문 물결. 모바일 신분증의 작은 표시처럼 카드 구석에 둔다.
 * FIDO Alliance의 패스키 아이콘은 상표 사용 계약 조건이 분명하지 않아 쓰지 않았다(2026-10-30).
 */
export function PasskeyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    >
      <circle cx="8.5" cy="9" r="5.5" />
      <path d="M6 9.2a2.5 2.5 0 0 1 5 0c0 1.4-.4 2.4-1 3.2" />
      <path d="M8.5 8.6v1.2c0 .9-.2 1.7-.6 2.3" />
      <path d="M13.2 12.2 20 19l-1.6 1.6M17.6 16.6l-1.5 1.5" />
    </svg>
  );
}
