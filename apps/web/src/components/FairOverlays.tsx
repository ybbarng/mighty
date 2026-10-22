"use client";

import type { BusyReason } from "@mighty/fair-play";

import { prefersReducedMotion } from "@/game/timing";
import type { Point, Size } from "@/layout/compute-layout";

import { ShuffleLoop } from "./DealAnimation";

/** 끊긴 사람을 오래 기다려 연 끝내기 투표. `voters`는 표를 낼 수 있는 자리(연결된 사람) */
export interface EndVoteState {
  votes: { seat: number; end: boolean }[];
  voters: number[];
}

/** 부정 감지(내 기기가 찾았거나, 판을 진행하는 방장이 알렸다) */
export interface IncidentState {
  seat: number | null;
  reason: string;
  own: boolean;
  /** 부정은 확실하지만 누가 했는지 확인하는 중 */
  pending?: boolean;
}

/**
 * 멘탈 포커 판의 화면 위 표시. 마이티와 하트가 함께 쓴다.
 * - 부정 감지: 누가, 무엇을. 내 기기가 찾은 것과 방장이 알린 것을 구분한다
 * - 모두 함께 섞는 동안: 가운데 덱이 갈라졌다 합쳐지기를 되풀이한다. 무엇을 하는지는 위 상태 막대에 쓴다(`FairStatus`)
 * - 연결이 끊긴 사람: 컴퓨터가 대신할 수 없어 기다린다. 방장은 게임을 끝낼 수 있고,
 *   오래 기다리면 남은 사람이 투표한다(과반이 끝내기를 고르면 끝난다)
 */
export function FairOverlays({
  incident,
  shuffling,
  fair,
  offlineNames,
  endGame,
  endVote,
  voteEnd,
  mySeat,
  whoName,
  center,
  card,
  deckCount,
  top,
}: {
  incident: IncidentState | null;
  /** 섞는 중(나눠 주는 연출 중이면 null로 넘긴다) */
  shuffling: BusyReason | null;
  fair: boolean;
  offlineNames: string[];
  endGame: (() => void) | null;
  endVote: EndVoteState | null;
  voteEnd: ((end: boolean) => void) | null;
  mySeat: number;
  whoName: (seat: number) => string;
  center: Point;
  card: Size;
  deckCount: number;
  /** 경고를 띄울 높이(위 막대 아래) */
  top: number;
}) {
  return (
    <>
      {incident && (
        <div
          role="alert"
          className="absolute inset-x-0 z-[345] mx-auto flex w-fit max-w-[94%] items-center gap-3 rounded-xl border border-rose-300/60 bg-rose-800/95 px-4 py-2 text-sm shadow-2xl"
          style={{ top }}
        >
          <Police searching={incident.pending === true} />
          <div className="min-w-0 text-center">
            <div className="font-bold">
              ⚠ 부정 감지 —{" "}
              {incident.pending
                ? "누가 했는지 확인하는 중…"
                : incident.seat === null
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
        </div>
      )}
      {shuffling &&
        !incident &&
        shuffling !== "wait" &&
        !prefersReducedMotion() && (
          <ShuffleLoop
            center={center}
            card={card}
            count={shuffling === "deal" ? deckCount : 13}
          />
        )}
      {fair && offlineNames.length > 0 && !incident && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-28 z-[340] mx-auto flex w-fit max-w-[92%] flex-wrap items-center justify-center gap-2 rounded-2xl bg-black/85 px-4 py-2 text-center text-sm shadow-2xl"
        >
          {offlineNames.join(", ")}님 연결이 끊겼습니다. 그 사람 카드는 그
          사람만 열 수 있어 돌아오기를 기다립니다.
          {endVote && voteEnd ? (
            <EndVote
              vote={endVote}
              mySeat={mySeat}
              onVote={voteEnd}
              host={endGame !== null}
            />
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

/**
 * 부정 감지 팝업의 경찰관. 머리 위 경광등이 빨강·파랑으로 번갈아 켜진다.
 * 누가 했는지 확인하는 중이면 돋보기를 든다
 */
function Police({ searching }: { searching: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-14 shrink-0"
      role="img"
      aria-label={searching ? "경찰이 조사하는 중" : "경찰 출동"}
    >
      {/* 경광등 */}
      <rect x="22" y="15.5" width="20" height="4" rx="1.5" fill="#1f2937" />
      <path
        d="M24 6 a8 8 0 0 1 8 -8 v8 z"
        className="siren-red"
        fill="#ef4444"
        transform="translate(0 10)"
      />
      <path
        d="M32 6 v-8 a8 8 0 0 1 8 8 z"
        className="siren-blue"
        fill="#3b82f6"
        transform="translate(0 10)"
      />
      {/* 얼굴 */}
      <circle cx="32" cy="40" r="15" fill="#f4c7a1" />
      <circle cx="26.5" cy="40" r="1.8" fill="#1f2937" />
      <circle cx="37.5" cy="40" r="1.8" fill="#1f2937" />
      {/* 찌푸린 눈썹과 입 */}
      <path
        d="M23.5 36 l5 1.2 M40.5 36 l-5 1.2"
        stroke="#1f2937"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M28 47 q4 -2 8 0"
        stroke="#7c2d12"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      {/* 모자 */}
      <path d="M16 31 q16 -22 32 0 z" fill="#1e3a8a" />
      <rect x="14" y="29.5" width="36" height="4" rx="2" fill="#0f172a" />
      <path
        d="M32 18.5 l1.6 3.2 3.5.5 -2.5 2.5.6 3.5 -3.2 -1.7 -3.2 1.7.6 -3.5 -2.5 -2.5 3.5 -.5z"
        fill="#facc15"
      />
      {searching && (
        <g>
          {/* 돋보기 */}
          <circle
            cx="50"
            cy="50"
            r="7"
            fill="#e0f2fe"
            fillOpacity="0.35"
            stroke="#e5e7eb"
            strokeWidth="2.5"
          />
          <path
            d="M55 55 l6 6"
            stroke="#e5e7eb"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}

/** 끝내기 투표: 더 기다리기 / 끝내기. 연결된 사람의 과반이 끝내기를 고르면(방장은 혼자서도) 끝난다 */
function EndVote({
  vote,
  mySeat,
  onVote,
  host,
}: {
  vote: EndVoteState;
  mySeat: number;
  onVote: (end: boolean) => void;
  host: boolean;
}) {
  const mine = vote.votes.find((v) => v.seat === mySeat)?.end;
  const ends = vote.votes.filter(
    (v) => v.end && vote.voters.includes(v.seat),
  ).length;
  const need = Math.floor(vote.voters.length / 2) + 1;
  return (
    <span className="flex w-full flex-wrap items-center justify-center gap-2">
      <span className="text-xs opacity-80" data-testid="end-vote-count">
        끝내기 {ends}/{need}표{host ? " · 방장은 바로 끝낼 수 있습니다" : ""}
      </span>
      <button
        type="button"
        aria-pressed={mine === false}
        onClick={() => onVote(false)}
        className={`rounded-lg px-3 py-1 font-semibold ${mine === false ? "bg-emerald-500" : "bg-white/15"}`}
      >
        더 기다리기
      </button>
      <button
        type="button"
        aria-pressed={mine === true}
        onClick={() => onVote(true)}
        className={`rounded-lg px-3 py-1 font-semibold ${mine === true ? "bg-rose-500 ring-2 ring-white" : "bg-rose-500/70"}`}
      >
        {host ? "게임 끝내기" : "끝내기"}
      </button>
    </span>
  );
}

/** 위 상태 막대에 쓰는 멘탈 포커 진행 상황. 섞는 동안은 지난 판 정보 대신 이것을 보인다 */
export function FairStatus({ shuffling }: { shuffling: BusyReason }) {
  return (
    <span
      role="status"
      data-shuffling={shuffling}
      className="flex shrink-0 items-center gap-1.5 text-amber-200"
    >
      <span
        aria-hidden
        className="inline-block size-3 animate-spin rounded-full border-2 border-white/30 border-t-white"
      />
      {shuffling === "wait"
        ? "카드 여는 중"
        : shuffling === "redeal"
          ? "다시 섞는 중"
          : "섞는 중"}
    </span>
  );
}
