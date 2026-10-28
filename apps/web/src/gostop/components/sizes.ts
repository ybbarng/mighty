"use client";

import { useEffect, useState } from "react";

/** 화면 크기에 맞춘 카드 너비(px). 화투 카드 조각은 너비를 숫자로 받는다 */
export interface CardSizes {
  hand: number;
  floor: number;
  captured: number;
  backs: number;
  deck: number;
  /** 손패를 겹쳐 놓는다(좁은 가로 칸) */
  overlap: boolean;
  /** 낮고 넓은 화면(휴대폰 가로) */
  landscape: boolean;
}

const DESKTOP: CardSizes = {
  hand: 56,
  floor: 50,
  captured: 26,
  backs: 22,
  deck: 44,
  overlap: false,
  landscape: false,
};

export function sizesFor(width: number, height: number): CardSizes {
  if (height <= 600 && width > height)
    return {
      hand: 42,
      floor: 34,
      captured: 17,
      backs: 13,
      deck: 30,
      overlap: true,
      landscape: true,
    };
  if (width < 520)
    return {
      hand: Math.min(48, Math.floor((width - 32) / 5.6)),
      floor: width < 400 ? 34 : 40,
      captured: width < 400 ? 17 : 20,
      backs: 13,
      deck: 32,
      overlap: false,
      landscape: false,
    };
  return DESKTOP;
}

/** 창 크기가 바뀌면 다시 고른다. 첫 그리기는 데스크톱 크기(미리 그린 HTML과 같게) */
export function useCardSizes(): CardSizes {
  const [sizes, setSizes] = useState<CardSizes>(DESKTOP);
  useEffect(() => {
    const update = () =>
      setSizes(sizesFor(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return sizes;
}
