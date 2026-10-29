/*
 * 고스톱 아이콘(`next/og` ImageResponse용 JSX). 초록 담요 위에 화투 두 장: 붉은 뒷면과 공산(8월) 광.
 * 카드는 한국 화투 그림을 줄인 `hwatu/icon-cards`를 쓴다(붉은 하늘·보름달·검은 언덕, 붉은 원 안 光).
 * 글꼴 없이 그림만 쓴다. 합칠 때 `components/brand/icon-art.tsx`의 `IconArt`에 `game="gostop"`으로 옮긴다(docs/28 7절)
 */

import { iconBack, iconMoonGwang } from "@/hwatu/icon-cards";

const FELT = "#0f5132";

/** 카드 두 장 그림(100×100) */
export function GostopCards() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "flex" }}
    >
      <rect width="100" height="100" fill={FELT} />
      {iconBack({ x: 8, y: 16, rotate: -14, scale: 0.72 })}
      {iconMoonGwang({ x: 44, y: 14, rotate: 10, scale: 0.74 })}
    </svg>
  );
}

/** 아이콘 틀: 둥근 모서리, `maskable`이면 안전 영역 안으로 줄인다(`IconArt`와 같은 모양) */
export function GostopIconArt({ maskable = false }: { maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: FELT,
        borderRadius: maskable ? 0 : "18%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          width: maskable ? "78%" : "100%",
          height: maskable ? "78%" : "100%",
        }}
      >
        <GostopCards />
      </div>
    </div>
  );
}
