"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

/** 이만큼(비율) 넘게 바뀌면 크게 바뀐 것으로 본다 */
const BIG_CHANGE = 0.2;
/** 가린 채 카드를 새 자리에 놓는 시간(ms) */
const HIDE_MS = 120;

/**
 * 화면 회전처럼 무대 크기가 크게 바뀌면 카드가 화면을 가로질러 날아가지 않게,
 * 잠깐 가리고 카드를 새 자리에 바로 놓은 뒤 흐리게 다시 보인다(마이티·하트 공통).
 * 돌려주는 className과 style을 무대에 붙인다.
 */
export function useRelayoutFade(
  width: number,
  height: number,
): { className: string | undefined; style: CSSProperties } {
  const prev = useRef({ width, height });
  const [hidden, setHidden] = useState(false);
  const p = prev.current;
  if (p.width !== width || p.height !== height) {
    const big =
      p.width > 0 &&
      p.height > 0 &&
      (p.width > p.height !== width > height ||
        Math.abs(width - p.width) > p.width * BIG_CHANGE ||
        Math.abs(height - p.height) > p.height * BIG_CHANGE);
    prev.current = { width, height };
    // 그리기 전에 바로 가려야 한 장면이라도 카드가 날아가지 않는다.
    if (big && !hidden) setHidden(true);
  }

  // 크기가 계속 바뀌는 동안은 가린 채 기다린다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기가 바뀔 때마다 기다림을 새로 시작한다
  useEffect(() => {
    if (!hidden) return;
    const id = setTimeout(() => setHidden(false), HIDE_MS);
    return () => clearTimeout(id);
  }, [hidden, width, height]);

  return {
    className: hidden ? "relayout" : undefined,
    style: hidden
      ? { opacity: 0, transition: "none" }
      : { opacity: 1, transition: "opacity 250ms ease-out" },
  };
}
