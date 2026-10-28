"use client";

import type { BusyReason } from "@mighty/fair-play";
import { create } from "zustand";

import type { EndVoteState, IncidentState } from "@/components/FairOverlays";

/**
 * 화투 세 게임의 암호화방(멘탈 포커) 표시 상태. 마이티·하트는 게임 가게에 두지만, 화투 셋은 같은 띠를 쓰므로
 * 따로 하나만 둔다(`bindFair`·`reportIncident`가 그대로 받는 모양)
 */
interface HwatuFairState {
  incident: IncidentState | null;
  shuffling: BusyReason | null;
  setShuffling(reason: BusyReason | null): void;
  fair: boolean;
  endGame: (() => void) | null;
  endVote: EndVoteState | null;
  voteEnd: ((end: boolean) => void) | null;
  /** 자리 이름과 연결이 끊긴 사람 자리(대기실 정보) */
  names: string[];
  offline: number[];
  /** 혼자 하기·일반방으로 바꿀 때 지운다 */
  reset(): void;
}

export const useHwatuFair = create<HwatuFairState>()((set) => ({
  incident: null,
  shuffling: null,
  setShuffling: (shuffling) => set({ shuffling }),
  fair: false,
  endGame: null,
  endVote: null,
  voteEnd: null,
  names: [],
  offline: [],
  reset: () =>
    set({
      incident: null,
      shuffling: null,
      fair: false,
      endGame: null,
      endVote: null,
      voteEnd: null,
    }),
}));

/**
 * 암호화방 띠: 함께 섞는 중, 부정 감지(누가·무엇을), 끊긴 사람을 기다리는 동안 끝내기·투표.
 * 온라인 대국 화면 위쪽에 놓는다
 */
export function HwatuFairBar({
  me,
  over,
}: {
  me: number;
  /** 게임이 끝났다(끊긴 사람을 기다리지 않는다) */
  over: boolean;
}) {
  const {
    incident,
    shuffling,
    fair,
    endGame,
    endVote,
    voteEnd,
    names,
    offline,
  } = useHwatuFair();
  if (!fair) return null;
  const nameOf = (seat: number) =>
    seat === me ? "내 자리" : (names[seat] ?? `${seat + 1}번 자리`);
  const waiting = over ? [] : offline.map(nameOf);
  return (
    <>
      {incident && (
        <div
          role="alert"
          className="w-full max-w-3xl rounded-xl border border-rose-300/60 bg-rose-800/95 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          <div className="font-bold">
            ⚠ 부정 감지 —{" "}
            {incident.pending
              ? "누가 했는지 확인하는 중…"
              : incident.seat === null
                ? "누군지는 가릴 수 없습니다"
                : nameOf(incident.seat)}
          </div>
          <div className="mt-0.5 text-xs opacity-90">{incident.reason}</div>
          <div className="mt-1 text-[11px] opacity-75">
            {incident.own
              ? "내 기기가 직접 확인한 것입니다. 이 판을 멈췄습니다."
              : "판을 진행하는 방장 기기가 찾아 판을 멈췄습니다(내 기기는 따로 확인하지 못했습니다)."}
          </div>
        </div>
      )}
      {shuffling && shuffling !== "wait" && !incident && (
        <p
          role="status"
          className="w-full max-w-3xl rounded-xl bg-black/50 px-3 py-1.5 text-center text-sm short-landscape:col-span-2"
        >
          🔐{" "}
          {shuffling === "redeal"
            ? "바닥에 같은 달 넉 장이 깔려 다시 섞는 중…"
            : "모두 함께 섞고 나누는 중…"}
        </p>
      )}
      {waiting.length > 0 && !incident && (
        <div
          role="status"
          className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 rounded-xl bg-black/70 px-3 py-2 text-center text-sm short-landscape:col-span-2"
        >
          {waiting.join(", ")}님 연결이 끊겼습니다. 그 사람 카드는 그 사람만 열
          수 있어 돌아오기를 기다립니다.
          {endVote && voteEnd ? (
            <span className="flex items-center gap-1">
              {endVote.voters.includes(me) &&
              !endVote.votes.some((v) => v.seat === me) ? (
                <>
                  <button
                    type="button"
                    onClick={() => voteEnd(true)}
                    className="rounded-lg bg-rose-500 px-2 py-0.5 font-semibold"
                  >
                    끝내기
                  </button>
                  <button
                    type="button"
                    onClick={() => voteEnd(false)}
                    className="rounded-lg bg-white/15 px-2 py-0.5"
                  >
                    더 기다리기
                  </button>
                </>
              ) : (
                <span className="text-xs opacity-70">
                  투표 {endVote.votes.filter((v) => v.end).length}/
                  {endVote.voters.length}
                </span>
              )}
            </span>
          ) : endGame ? (
            <button
              type="button"
              onClick={endGame}
              className="rounded-lg bg-rose-500 px-3 py-1 font-semibold"
            >
              게임 끝내기
            </button>
          ) : (
            <span className="text-xs opacity-70">
              오래 걸리면 끝낼지 투표합니다.
            </span>
          )}
        </div>
      )}
    </>
  );
}
