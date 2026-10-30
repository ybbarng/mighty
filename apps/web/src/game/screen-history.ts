"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";

import { useNoPullRefresh } from "./no-pull-refresh";

/**
 * 게임 앱의 화면(시작·옵션·배우기·방·대국…)을 브라우저 기록과 잇는다.
 *
 * - 화면을 바꾸면 기록에 한 칸 남겨, 뒤로가기(휴대폰 밀어서 뒤로 포함)가 바로 전 화면으로 간다.
 *   앞서 지나온 화면으로 돌아가는 바꿈(예: 대국 → 시작)은 새 칸을 쌓지 않고 기록을 그만큼 되돌린다.
 * - 옵션·규칙·소개·배우기 목록·수 배우기 목록은 주소의 # 조각에 남겨 새로고침해도 그 화면이다.
 *   단원·문제는 목록으로, 대국·방·시작은 # 없이(대국은 이어하기, 방은 ?room= 이 있다).
 * - 판·방 화면을 뒤로가기로 떠나도 앱이 하던 정리(`leavePlay`)를 한다.
 * - 온라인(방, 방에서 들어간 대국)을 뒤로가기로 떠나려 하면 페이지 안 확인창으로 묻는다.
 *   혼자 하기는 이어하기 저장이 있어 묻지 않는다.
 * - 판을 두는 화면에서는 당겨서 새로고침을 막는다(useNoPullRefresh).
 */

export interface ScreenLike {
  kind: string;
}

/** 판을 두는 화면: 당겨서 새로고침을 막는다 */
const BOARD_KINDS = new Set(["playing", "online", "lesson", "puzzle"]);
/** 판·방 화면: 떠날 때 정리한다 */
const PLAY_KINDS = new Set(["playing", "online"]);
/** # 조각으로 남기는 화면과 그 이름. 단원·문제는 그 목록으로 남긴다 */
const HASH_OF: Record<string, string> = {
  options: "options",
  rules: "rules",
  about: "about",
  tutorial: "learn",
  lesson: "learn",
  study: "study",
  puzzle: "study",
};
const KIND_OF_HASH: Record<string, string> = {
  options: "options",
  rules: "rules",
  about: "about",
  learn: "tutorial",
  study: "study",
};

interface StateMark {
  screenKey?: string;
  screenIndex?: number;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * 이 화면을 보일 때의 주소: # 조각을 바꾸고, 방 화면이 아니면 ?room= 을 지운다.
 * 처음 그릴 때는 앱이 초대 링크의 방 코드를 읽어야 하니 지우지 않는다(`keepRoom`).
 */
function urlFor(screen: ScreenLike, keepRoom = false): string {
  const url = new URL(window.location.href);
  const hash = HASH_OF[screen.kind];
  url.hash = hash ?? "";
  if (!keepRoom && screen.kind !== "online") url.searchParams.delete("room");
  return url.toString().replace(/#$/, "");
}

/** 온라인으로 하고 있는가: 방 화면이거나, 기록상 방을 거쳐 들어온 대국 */
function isOnline<S extends ScreenLike>(stack: S[], index: number): boolean {
  const here = stack[index];
  if (!here) return false;
  if (here.kind === "online") return true;
  if (here.kind !== "playing") return false;
  return stack.slice(0, index).some((s) => s.kind === "online");
}

export function useScreenHistory<S extends ScreenLike>(
  initial: S,
  options: {
    /** 판·방 화면을 떠날 때 정리(세션 끝내기, 저장소 비우기). 화면은 이 훅이 바꾼다 */
    leavePlay?: () => void;
    /** # 조각에서 되살려도 되는 화면 종류(이 앱에 있는 것만) */
    restorable?: readonly string[];
  } = {},
): [S, (next: S) => void] {
  const [screen, setScreenState] = useState<S>(initial);
  const key = useRef(Math.random().toString(36).slice(2));
  const stack = useRef<S[]>([initial]);
  const index = useRef(0);
  // 앱 안에서 기록을 되돌릴 때(go) 뒤따라 오는 popstate 는 이미 반영했다
  const expected = useRef<number | null>(null);
  // 확인창에서 "나가기"를 고른 뒤의 이동은 다시 묻지 않는다
  const bypass = useRef(false);
  const opts = useRef(options);
  opts.current = options;
  // 처음 화면(그릴 때마다 새 객체라 ref 로 둔다)
  const first = useRef(initial);

  const mark = useCallback(
    (i: number): StateMark => ({ screenKey: key.current, screenIndex: i }),
    [],
  );

  // 처음 그린 뒤: 지금 칸에 표시를 달고, # 조각이 있으면 그 화면에서 시작한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 마운트할 때 한 번만
  useEffect(() => {
    const kind = KIND_OF_HASH[window.location.hash.replace(/^#/, "")];
    let start = initial;
    if (kind && opts.current.restorable?.includes(kind)) {
      start = { kind } as S;
      setScreenState(start);
    }
    stack.current = [start];
    index.current = 0;
    window.history.replaceState(
      { ...(window.history.state ?? {}), ...mark(0) },
      "",
      urlFor(start, true),
    );
  }, []);

  const apply = useCallback((to: number) => {
    const from = index.current;
    const before = stack.current[from];
    const after = stack.current[to];
    if (!after) return;
    if (before && PLAY_KINDS.has(before.kind) && !PLAY_KINDS.has(after.kind))
      opts.current.leavePlay?.();
    index.current = to;
    setScreenState(after);
  }, []);

  // 뒤로가기·앞으로가기
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const state = event.state as StateMark | null;
      if (state?.screenKey !== key.current) {
        // 새로고침 전에 쌓인 칸 등 이 훅이 모르는 칸: 주소(# 조각)로 화면을 정하고 거기서 새로 쌓는다
        const kind = KIND_OF_HASH[window.location.hash.replace(/^#/, "")];
        const next =
          kind && opts.current.restorable?.includes(kind)
            ? ({ kind } as S)
            : first.current;
        const before = stack.current[index.current];
        if (before && PLAY_KINDS.has(before.kind) && !PLAY_KINDS.has(next.kind))
          opts.current.leavePlay?.();
        stack.current = [next];
        index.current = 0;
        window.history.replaceState(
          { ...(window.history.state ?? {}), ...mark(0) },
          "",
          urlFor(next),
        );
        setScreenState(next);
        return;
      }
      const to = state.screenIndex ?? 0;
      if (expected.current === to) {
        // 앱 안에서 되돌린 이동: 화면은 이미 바꿨고, 주소만 그 화면에 맞춘다(?room= 지우기 등)
        expected.current = null;
        window.history.replaceState(
          { ...(window.history.state ?? {}), ...mark(to) },
          "",
          urlFor(stack.current[to] as S),
        );
        return;
      }
      const from = index.current;
      const leavingOnline =
        to < from &&
        isOnline(stack.current, from) &&
        !isOnline(stack.current, to) &&
        !bypass.current;
      bypass.current = false;
      if (!leavingOnline) {
        apply(to);
        // 초대 링크로 연 첫 칸으로 돌아오면 주소에 남은 ?room= 을 지운다
        window.history.replaceState(
          { ...(window.history.state ?? {}), ...mark(to) },
          "",
          urlFor(stack.current[to] as S),
        );
        return;
      }
      // 실수로 온라인 판을 나가지 않게: 지금 화면 칸을 다시 쌓고 묻는다
      window.history.pushState(
        { ...(window.history.state ?? {}), ...mark(from) },
        "",
        urlFor(stack.current[from] as S),
      );
      useLeaveConfirm.getState().ask({
        message:
          stack.current[from]?.kind === "online"
            ? "온라인 방에서 나가시겠어요?"
            : "온라인 대국에서 나가시겠어요? 함께 하던 사람들과 연결이 끊깁니다.",
        onLeave: () => {
          bypass.current = true;
          window.history.go(to - from);
        },
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [apply, mark]);

  const setScreen = useCallback(
    (next: S) => {
      const here = index.current;
      if (same(stack.current[here], next)) return;
      // 앞서 지나온 화면이면 기록을 그만큼 되돌린다
      for (let j = here - 1; j >= 0; j--) {
        if (same(stack.current[j], next)) {
          apply(j);
          expected.current = j;
          window.history.go(j - here);
          return;
        }
      }
      const before = stack.current[here];
      if (before && PLAY_KINDS.has(before.kind) && !PLAY_KINDS.has(next.kind))
        opts.current.leavePlay?.();
      stack.current = [...stack.current.slice(0, here + 1), next];
      index.current = here + 1;
      window.history.pushState(
        { ...(window.history.state ?? {}), ...mark(here + 1) },
        "",
        urlFor(next),
      );
      setScreenState(next);
    },
    [apply, mark],
  );

  useNoPullRefresh(BOARD_KINDS.has(screen.kind));
  return [screen, setScreen];
}

/** 온라인 판을 뒤로가기로 떠나려 할 때의 확인창 상태(LeaveConfirm 이 그린다) */
interface LeaveConfirmState {
  open: { message: string; onLeave: () => void } | null;
  ask(open: { message: string; onLeave: () => void }): void;
  close(): void;
}

export const useLeaveConfirm = create<LeaveConfirmState>((set) => ({
  open: null,
  ask: (open) => set({ open }),
  close: () => set({ open: null }),
}));
