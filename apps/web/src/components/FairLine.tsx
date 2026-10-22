"use client";

import type { BusyReason, GroupName } from "@mighty/fair-play";

import { useSettings } from "@/game/settings";
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
    text: n.own
      ? `⚠ 내 기기가 찾음 — ${who}: ${n.reason}`
      : `${names[n.reporter] ?? `${n.reporter}번`}의 알림 — ${who}: ${n.reason} (내 기기 확인과 따로 봅니다)`,
  });
  const current = store.getState().incident;
  if (n.own || (n.reporter === 0 && !current))
    store.setState({
      incident: { seat: n.seat, reason: n.reason, own: n.own },
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

/** 대기실: 멘탈 포커로 하는지. 방장은 켜고 끌 수 있다 */
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
            <b>멘탈 포커</b>로 함께 섞습니다. 방장 기기도 남의 카드를 볼 수
            없고, 판마다 진행을 모두가 다시 계산해 확인합니다.{" "}
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
            방장 기기가 섞습니다(방장 기기에는 모든 패가 있습니다). 판 끝에
            섞기와 진행을 확인합니다.
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
          {on ? "끄기" : "켜기"}
        </button>
      )}
    </div>
  );
}
