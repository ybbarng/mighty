"use client";

import type { BusyReason, GroupName } from "@mighty/fair-play";

import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";
import type { LobbyState } from "@/net/protocol";
import { randomId } from "@/net/transport";

import type { EndVoteState, IncidentState } from "./FairOverlays";

/** 부정 알림(내 기기가 찾은 것과 다른 사람이 알린 것) */
export interface IncidentNoticeLike {
  reporter: number;
  seat: number | null;
  reason: string;
  own: boolean;
  pending?: boolean;
}

/** 멘탈 포커 화면 상태를 담는 가게(마이티 `useGame`, 하트 `useHearts`) */
interface FairStore {
  getState(): {
    incident: IncidentState | null;
    setShuffling(reason: BusyReason | null): void;
  };
  setState(partial: {
    incident?: IncidentState | null;
    fair?: boolean;
    endGame?: (() => void) | null;
    voteEnd?: ((end: boolean) => void) | null;
    shuffling?: BusyReason | null;
  }): void;
}

export interface BusyCoordinator {
  onBusy(listener: (busy: BusyReason | null) => void): () => void;
}

/**
 * 부정 알림. 채팅에 남기고, 내 기기가 찾은 것이나 판을 진행하는 방장이 알린 것은 화면에 띄운다.
 * 다른 참가자의 알림은 그 사람의 주장으로 채팅에만 남긴다(거짓 알림으로 남의 판을 멈추지 못하게).
 */
export function reportIncident(
  n: IncidentNoticeLike,
  names: string[],
  store: FairStore,
): void {
  const who =
    n.seat === null ? "누군지 모름" : (names[n.seat] ?? `${n.seat}번`);
  useChat.getState().receive({
    id: randomId(8),
    seat: -1,
    name: "부정 감지",
    text: n.pending
      ? `⚠ ${n.own ? "내 기기가 찾음" : `${names[n.reporter] ?? `${n.reporter}번`}의 알림`} — ${n.reason}`
      : n.own
        ? `⚠ 내 기기가 찾음 — ${who}: ${n.reason}`
        : `${names[n.reporter] ?? `${n.reporter}번`}의 알림 — ${who}: ${n.reason} (내 기기 확인과 따로 봅니다)`,
  });
  const current = store.getState().incident;
  // 확인하는 중이던 알림은 같은 사람의 확정 알림으로 바꾼다.
  if (n.own || (n.reporter === 0 && (!current || current.pending)))
    store.setState({
      incident: {
        seat: n.seat,
        reason: n.reason,
        own: n.own,
        ...(n.pending ? { pending: true } : {}),
      },
    });
}

/** 멘탈 포커 판: 섞는 중 표시와 끊긴 사람 처리를 화면 상태에 잇는다 */
export function bindFair(
  store: FairStore,
  coordinator: BusyCoordinator | undefined,
  endGame: (() => void) | null,
  voteEnd: (end: boolean) => void,
): void {
  if (!coordinator) {
    store.setState({
      fair: false,
      endGame: null,
      voteEnd: null,
      shuffling: null,
    });
    return;
  }
  store.setState({ fair: true, endGame, voteEnd });
  coordinator.onBusy((busy) => store.getState().setShuffling(busy));
}

/** 대기실 정보에서 끝내기 투표(열려 있을 때). 표를 낼 수 있는 사람은 연결된 사람 자리다 */
export function endVoteOf(lobby: LobbyState): EndVoteState | null {
  if (!lobby.endVote) return null;
  return {
    votes: lobby.endVote.votes,
    voters: lobby.seats
      .filter((s) => s.kind !== "bot" && s.connected)
      .map((s) => s.seat),
  };
}

/** 판마다 진짜 카드로 다시 계산해 문제가 없었다고 채팅에 남긴다 */
export function announceRoundVerified(): void {
  useChat.getState().receive({
    id: randomId(8),
    seat: -1,
    name: "검증",
    text: "이번 판을 진짜 카드로 다시 계산했습니다 — 문제없음 ✓",
  });
}

/**
 * 방 만들기: 암호화방(멘탈 포커, 기본)과 일반방 중 고른다. 고른 것은 다음에도 기억한다.
 * 암호화방은 방장도 남의 패를 모르지만 판 시작·판 끝에 계산이 든다(느린 폰이 섞이면 몇 초씩)
 */
export function RoomKindPicker() {
  const fairPlay = useSettings((s) => s.fairPlay);
  const setFairPlay = useSettings((s) => s.setFairPlay);
  const kinds = [
    {
      fair: true,
      icon: "🔐",
      title: "암호화방(추천)",
      detail:
        "방장 기기도 남의 패를 볼 수 없고, 속이면 그 자리에서 짚습니다. 판 시작·끝에 계산이 들어 느린 폰이 섞이면 몇 초씩 걸릴 수 있습니다.",
    },
    {
      fair: false,
      icon: "🔓",
      title: "일반방",
      detail:
        "방장 기기가 섞어서 가볍고 빠릅니다. 방장 기기에는 모든 패가 있습니다(판 끝에 섞기와 진행은 확인합니다). 믿는 친구끼리 할 때.",
    },
  ];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm">방 종류</legend>
      {kinds.map((k) => (
        <label
          key={k.title}
          className={cn(
            "flex cursor-pointer gap-2 rounded-xl border px-3 py-2",
            fairPlay === k.fair
              ? "border-amber-300 bg-amber-300/10"
              : "border-white/15 bg-black/30 hover:bg-white/5",
          )}
        >
          <input
            type="radio"
            name="room-kind"
            checked={fairPlay === k.fair}
            onChange={() => setFairPlay(k.fair)}
            className="mt-1 accent-amber-300"
          />
          <span className="flex flex-col">
            <span className="font-semibold text-sm">
              {k.icon} {k.title}
            </span>
            <span className="text-xs leading-relaxed opacity-75">
              {k.detail}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** 대기실: 암호화방(멘탈 포커)인지 일반방인지. 방장은 시작 전에 바꿀 수 있다 */
export function FairLine({
  lobby,
  isHost,
  setFair,
}: {
  lobby: LobbyState;
  isHost: boolean;
  setFair: (fair: { group: GroupName } | null) => void;
}) {
  const fairPlay = useSettings((s) => s.fairPlay);
  const setFairPlay = useSettings((s) => s.setFairPlay);
  if (lobby.seats.length < 2) return null;
  const on = lobby.fair !== undefined;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-emerald-950/60 px-3 py-2 text-xs">
      <span aria-hidden>{on ? "🔐" : "🔓"}</span>
      <span className="flex-1 leading-relaxed">
        {on ? (
          <>
            <b>암호화방</b> — 멘탈 포커로 함께 섞습니다. 방장 기기도 남의 카드를
            볼 수 없고, 판마다 진행을 모두가 다시 계산해 확인합니다.{" "}
            <a
              href="/security#mental-poker"
              target="_blank"
              className="underline opacity-80"
              rel="noopener"
            >
              어떻게?
            </a>
          </>
        ) : (
          <>
            <b>일반방</b> — 방장 기기가 섞습니다(방장 기기에는 모든 패가
            있습니다). 판 끝에 섞기와 진행을 확인합니다.
          </>
        )}
      </span>
      {isHost && (
        <button
          type="button"
          onClick={() => {
            const next = !fairPlay;
            setFairPlay(next);
            setFair(next ? { group: "2048" } : null);
          }}
          className="shrink-0 rounded bg-white/10 px-1.5 py-0.5"
        >
          {on ? "일반방으로" : "암호화방으로"}
        </button>
      )}
    </div>
  );
}
