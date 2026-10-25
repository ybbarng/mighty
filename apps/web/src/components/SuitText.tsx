"use client";

import type { Suit } from "@mighty/engine";
import { Fragment } from "react";

import { useSettings } from "@/game/settings";
import {
  SUIT_GLYPH,
  type SuitStyle,
  splitSuits,
  suitText,
} from "@/game/suit-style";

import { HOLLOW_CLUB, SUIT_PATHS } from "./card-art/suits";

/** ◆·♣를 테두리로 그리는가(그림 방식) */
const HOLLOW: Record<Suit, boolean> = { S: false, H: false, D: true, C: true };

/**
 * 글자 크기에 맞춘 무늬 그림. 색은 둘레 글자색을 따른다.
 * 그림은 읽지 않고 옆에 안 보이는 기호 글자를 둔다. 그래야 "♠3"처럼 띄어 쓰지 않은 이름으로 읽히고, 복사해도 기호가 남는다
 */
export function SuitIcon({
  suit,
  hollow = false,
  className,
}: {
  suit: Suit;
  hollow?: boolean;
  className?: string;
}) {
  return (
    <>
      <svg
        viewBox="-8 -8 116 116"
        aria-hidden="true"
        className={className}
        style={{
          display: "inline-block",
          width: "0.92em",
          height: "0.92em",
          verticalAlign: "-0.12em",
        }}
      >
        {hollow ? (
          <>
            <path
              d={suit === "C" ? HOLLOW_CLUB.lobes : SUIT_PATHS[suit]}
              fill="none"
              stroke="currentColor"
              strokeWidth={11}
              strokeLinejoin="round"
            />
            {suit === "C" && <path d={HOLLOW_CLUB.stem} fill="currentColor" />}
          </>
        ) : (
          <path d={SUIT_PATHS[suit]} fill="currentColor" />
        )}
      </svg>
      <span style={{ fontSize: 0 }}>{SUIT_GLYPH[suit]}</span>
    </>
  );
}

/** 설정한 무늬 표기 방식 */
export function useSuitStyle(): SuitStyle {
  return useSettings((s) => s.suitStyle);
}

/**
 * 무늬 기호(♠◆♥♣)가 든 문구를 설정한 방식으로 그린다.
 * 그림 방식이면 기호를 그림으로, 글자 방식이면 이름·첫 글자·기호 글자로 바꾼다
 */
export function SuitText({
  text,
  style: forced,
}: {
  text: string;
  /** 설정과 상관없이 이 방식으로(미리보기) */
  style?: SuitStyle;
}) {
  const setting = useSuitStyle();
  const style = forced ?? setting;
  if (style !== "outline" && style !== "filled")
    return <>{suitText(text, style)}</>;
  return (
    <>
      {splitSuits(text).map((piece, i) =>
        typeof piece === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 문구 조각은 순서가 곧 정체다
          <Fragment key={i}>{piece}</Fragment>
        ) : (
          <SuitIcon
            // biome-ignore lint/suspicious/noArrayIndexKey: 문구 조각은 순서가 곧 정체다
            key={i}
            suit={piece.suit}
            hollow={style === "outline" && HOLLOW[piece.suit]}
          />
        ),
      )}
    </>
  );
}

/** 무늬 하나만 그린다(기루다 고르기 단추처럼). 좁은 단추라 이름 방식은 첫 글자로 줄인다 */
export function SuitMark({ suit, style }: { suit: Suit; style?: SuitStyle }) {
  const setting = useSuitStyle();
  const chosen = style ?? setting;
  return (
    <SuitText
      text={SUIT_GLYPH[suit]}
      style={chosen === "name" ? "initial" : chosen}
    />
  );
}
