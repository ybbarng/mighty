"use client";

import type { Card } from "@mighty/engine";
import type React from "react";
import { useEffect, useRef, useState } from "react";

/** 렌더할 때마다 새로 넘기는 손패 상태. 이벤트 처리기는 늘 마지막 값을 본다 */
export interface HandControlsState {
  /** 게임 화면 전체(패널을 찾고 손가락 위치를 무대 좌표로 바꾼다) */
  stage: HTMLDivElement | null;
  /** 화면에 놓인 순서대로의 손패 */
  hand: readonly Card[];
  /** 낼 수 있는 카드. 카드를 낼 차례가 아니면 null */
  playable: ReadonlySet<Card> | null;
  selected: Card | null;
  setSelected: (card: Card | null) => void;
  /** 카드 내기를 받을지(다른 고르기 창이 떠 있으면 false) */
  canPlay: boolean;
  /** 손패 위쪽 끝(무대 좌표)과 카드 높이. 위로 끌어 내는 경계를 정한다 */
  handTop: number;
  cardHeight: number;
  play: (card: Card) => void;
  /** Esc: 고르던 것을 내려놓는다 */
  cancel: () => void;
}

/**
 * 손패 조작(마이티·하트 공통).
 * - 터치: 손패 위를 훑으면 손가락 아래 카드를 고르고, 위로 끌어 올려 놓으면 낸다.
 * - 키보드: ←→로 고르고 Enter로 내기, Esc로 취소. 판 가운데 패널은 숫자 키로 n번째 선택지,
 *   ↑↓·+−로 숫자, Enter로 주 단추.
 */
export function useHandControls() {
  const state = useRef<HandControlsState | null>(null);
  // 손을 떼기 전까지 카드 단추의 누르기를 대신한다.
  const gesture = useRef<{
    x: number;
    y: number;
    moved: boolean;
    /** 처음 움직임이 위쪽이었다(들어 올리기). 손패가 두 줄로 겹치면 아래 줄 카드를 올리는 손가락이
     * 위 줄 카드를 지나가므로, 이때는 훑어 고르기를 하지 않는다 */
    lift: boolean;
    /** 처음 짚은 카드 */
    card: Card;
    /** 지금 들고 있는 카드. 화면이 다시 그려지기 전에 손을 떼도 이 카드를 낸다 */
    held: Card | null;
  } | null>(null);
  const [dragArmed, setDragArmedState] = useState(false);
  const armed = useRef(false);
  const setDragArmed = (next: boolean) => {
    armed.current = next;
    setDragArmedState(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 카드 단추가 Enter를 이미 처리했으면 두 번 내지 않는다.
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
        return;
      const s = state.current;
      if (s) handleKey(e, s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** 손가락 아래 손패 카드 */
  const cardAt = (s: HandControlsState, x: number, y: number): Card | null => {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-card]");
    const card = el?.dataset.card as Card | undefined;
    return card && s.hand.includes(card) ? card : null;
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      const s = state.current;
      if (e.pointerType !== "touch" || !s?.canPlay || !s.playable) return;
      const card = cardAt(s, e.clientX, e.clientY);
      if (!card) return;
      gesture.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        lift: false,
        card,
        held: null,
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = gesture.current;
      const s = state.current;
      if (!g || !s) return;
      if (!g.moved) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 10) return;
        g.moved = true;
        g.lift = g.y - e.clientY > Math.abs(e.clientX - g.x);
      }
      // 고른 카드 없이 바로 끌면 처음 짚은 카드를 낸다.
      const held =
        g.held ?? s.selected ?? (s.playable?.has(g.card) ? g.card : null);
      g.held = held;
      if (held !== s.selected) s.setSelected(held);
      const top = s.stage?.getBoundingClientRect().top ?? 0;
      // 손패 위쪽 끝보다 카드 반 장 넘게 올라가면 낼 준비
      const up = e.clientY - top < s.handTop - s.cardHeight * 0.5;
      setDragArmed(up && held !== null);
      if (up || g.lift) return;
      // 손패 위를 훑으면 손가락 아래의 낼 수 있는 카드를 고른다.
      const under = cardAt(s, e.clientX, e.clientY);
      if (under && s.playable?.has(under) && under !== held) {
        g.held = under;
        s.setSelected(under);
      }
    },
    onPointerUp: () => {
      const g = gesture.current;
      const s = state.current;
      gesture.current = null;
      if (!g?.moved) return;
      const held = g.held ?? s?.selected ?? null;
      if (armed.current && held && s?.playable?.has(held)) s.play(held);
      setDragArmed(false);
    },
    onPointerCancel: () => {
      gesture.current = null;
      setDragArmed(false);
    },
  };

  return {
    /** 위로 끌어 낼 준비가 됐다(고른 카드를 더 높이 들어 올려 보인다) */
    dragArmed,
    /** 훑거나 끈 것은 손을 뗄 때 따로 처리하므로 카드 단추의 누르기는 무시한다 */
    gestureMoved: () => gesture.current?.moved ?? false,
    handlers,
    /** 이번 렌더의 손패 상태를 넘긴다 */
    update: (next: HandControlsState) => {
      state.current = next;
    },
  };
}

function handleKey(e: KeyboardEvent, s: HandControlsState): void {
  if (e.key === "Escape") {
    s.cancel();
    return;
  }
  const panel = s.stage?.querySelector(".panel-area");
  if (panel && !(e.target instanceof HTMLButtonElement)) {
    const press = (selector: string, index = 0) => {
      const button = panel.querySelectorAll<HTMLButtonElement>(
        `${selector}:not([disabled])`,
      )[index];
      if (!button) return false;
      e.preventDefault();
      button.click();
      return true;
    };
    if (/^[1-9]$/.test(e.key) && press("[data-choice]", Number(e.key) - 1))
      return;
    if (
      (e.key === "ArrowUp" || e.key === "+" || e.key === "=") &&
      press('[data-step="up"]')
    )
      return;
    if ((e.key === "ArrowDown" || e.key === "-") && press('[data-step="down"]'))
      return;
    if (e.key === "Enter" && !s.selected && press("[data-primary]")) return;
  }
  if (!s.canPlay || !s.playable) return;
  const options = s.hand.filter((c) => s.playable?.has(c));
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    const i = s.selected ? options.indexOf(s.selected) : -1;
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = options[(i + step + options.length) % options.length];
    if (next) s.setSelected(next);
  } else if (e.key === "Enter" && s.selected && s.playable.has(s.selected)) {
    e.preventDefault();
    s.play(s.selected);
  }
}
