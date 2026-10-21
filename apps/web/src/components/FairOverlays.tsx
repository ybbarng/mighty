"use client";

import type { BusyReason } from "@mighty/fair-play";

import { prefersReducedMotion } from "@/game/timing";
import type { Point, Size } from "@/layout/compute-layout";

import { ShuffleLoop } from "./DealAnimation";

/** 부정 감지(내 기기가 찾았거나, 판을 진행하는 방장이 알렸다) */
export interface IncidentState {
  seat: number | null;
  reason: string;
  own: boolean;
}

/**
 * 멘탈 포커 판의 화면 위 표시. 마이티와 하트가 함께 쓴다.
 * - 부정 감지: 누가, 무엇을. 내 기기가 찾은 것과 방장이 알린 것을 구분한다
 * - 모두 함께 섞는 동안: 가운데 덱이 갈라졌다 합쳐지기를 되풀이한다(글은 띄우지 않는다)
 * - 연결이 끊긴 사람: 컴퓨터가 대신할 수 없어 기다린다. 방장은 게임을 끝낼 수 있다
 */
export function FairOverlays({
  incident,
  shuffling,
  fair,
  offlineNames,
  endGame,
  whoName,
  center,
  card,
  deckCount,
  top,
  stageWidth,
}: {
  incident: IncidentState | null;
  /** 섞는 중(나눠 주는 연출 중이면 null로 넘긴다) */
  shuffling: BusyReason | null;
  fair: boolean;
  offlineNames: string[];
  endGame: (() => void) | null;
  whoName: (seat: number) => string;
  center: Point;
  card: Size;
  deckCount: number;
  /** 경고를 띄울 높이(위 막대 아래) */
  top: number;
  stageWidth: number;
}) {
  return (
    <>
      {incident && (
        <div
          role="alert"
          className="absolute inset-x-0 z-[345] mx-auto w-fit max-w-[94%] rounded-xl border border-rose-300/60 bg-rose-800/95 px-4 py-2 text-center text-sm shadow-2xl"
          style={{ top }}
        >
          <div className="font-bold">
            ⚠ 부정 감지 —{" "}
            {incident.seat === null
              ? "누군지는 가릴 수 없습니다"
              : whoName(incident.seat)}
          </div>
          <div className="mt-0.5 text-xs opacity-90">{incident.reason}</div>
          <div className="mt-1 text-[11px] opacity-75">
            {incident.own
              ? "내 기기가 직접 확인한 것입니다. 이 판을 멈췄습니다."
              : "판을 진행하는 방장 기기가 찾아 판을 멈췄습니다(내 기기는 따로 확인하지 못했습니다)."}
          </div>
        </div>
      )}
      {shuffling && !incident && (
        <>
          {shuffling !== "wait" && !prefersReducedMotion() && (
            <ShuffleLoop
              center={center}
              card={card}
              count={shuffling === "deal" ? deckCount : 13}
            />
          )}
          {/* 섞는 애니메이션으로 충분하므로 글은 화면 낭독기에만 알린다. 애니메이션이 없는 짧은 기다림은 회전 표시만 */}
          <div role="status" data-shuffling={shuffling} className="sr-only">
            {shuffling === "wait" ? "카드를 여는 중" : "모두 함께 섞는 중"}
          </div>
          {(shuffling === "wait" || prefersReducedMotion()) && (
            <span
              aria-hidden
              className="pointer-events-none absolute z-[330] inline-block size-5 -translate-x-1/2 animate-spin rounded-full border-2 border-white/30 border-t-white"
              style={{ left: stageWidth / 2, top: center.y - 10 }}
            />
          )}
        </>
      )}
      {fair && offlineNames.length > 0 && !incident && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-28 z-[340] mx-auto flex w-fit max-w-[92%] flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/85 px-4 py-2 text-center text-sm shadow-2xl"
        >
          {offlineNames.join(", ")}님 연결이 끊겼습니다. 그 사람 카드는 그
          사람만 열 수 있어 돌아오기를 기다립니다.
          {endGame && (
            <button
              type="button"
              onClick={endGame}
              className="rounded-lg bg-rose-500 px-3 py-1 font-semibold"
            >
              게임 끝내기
            </button>
          )}
        </div>
      )}
    </>
  );
}
