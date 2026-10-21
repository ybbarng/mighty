import type { Action, GameEvent, PlayerView } from "@mighty/engine";

import type { KitLoggedAction } from "@/game/kit";

/** 대기실 자리 하나 */
export interface LobbySeat {
  seat: number;
  name: string;
  kind: "host" | "guest" | "bot";
  /** 사람 자리가 지금 연결되어 있는가. 끊기면 잠시 뒤 컴퓨터가 대신 둔다 */
  connected: boolean;
  /** 사람 자리의 연결 아이디. 참가자끼리 직접 보낸 알림이 그 자리에서 왔는지 맞춰 본다 */
  peerId?: string;
}

export interface LobbyState {
  /** 어떤 게임의 방인가(게임 키트 id: mighty, hearts). 다른 게임의 방에는 들어가지 않는다 */
  game?: string;
  /** 규칙 문자열(마이티는 원작 형식, 하트는 h1-…) */
  ruleCode: string;
  /** 방장이 붙인 규칙 이름(내 규칙). 기본 규칙이면 없다 */
  ruleName?: string;
  seats: LobbySeat[];
  started: boolean;
}

/**
 * 참가자가 판 끝 검증 결과를 모두에게 직접 알린다(방장을 거치지 않는다).
 * 방장이 섞기를 조작했다면 그 결과를 숨길 수 없게 하려는 것이다.
 */
export interface AuditReport {
  t: "auditReport";
  seat: number;
  name: string;
  ok: boolean;
  reason?: string;
}

/** 채팅 한 줄 */
export interface ChatMessage {
  id: string;
  seat: number;
  name: string;
  text: string;
}

/** 채팅 한 줄의 최대 길이 */
export const CHAT_MAX_LENGTH = 80;

/** 공정한 섞기: 처음에는 해시만, 시작할 때 원래 값을 낸다 (docs/07-security.md 5절) */
export interface Commitment {
  seat: number;
  hash: string;
}
export interface Reveal {
  seat: number;
  secret: string;
}

/** 참가자 → 방장. `A`는 게임의 행동(기본 마이티) */
export type GuestMessage<A = Action> =
  | {
      t: "join";
      name: string;
      token: string | null;
      commit: string;
      /** 방장 서명에 넣을 임의의 값(identity.ts) */
      nonce?: string;
    }
  | { t: "action"; action: A }
  | { t: "reveal"; secret: string }
  | { t: "chat"; text: string }
  | AuditReport
  | { t: "leave" };

/** 방장 → 참가자. `V`·`E`·`A`는 게임의 화면·이벤트·행동(기본 마이티) */
export type HostMessage<V = PlayerView, E = GameEvent, A = Action> =
  | {
      t: "welcome";
      seat: number;
      token: string;
      /** 방장 서명: 공개 열쇠와 서명(identity.ts). 초대 링크의 지문과 맞아야 방장으로 믿는다 */
      proof?: { key: string; sig: string };
    }
  | { t: "full" }
  /** 방장이 대기실에서 내보냈다. 같은 방에는 다시 들어올 수 없다 */
  | { t: "kicked" }
  /** 방장이 방을 닫는다. 이 메시지 없이 연결이 끊기면 참가자는 잠시 다시 연결을 기다린다 */
  | { t: "closed" }
  | { t: "lobby"; lobby: LobbyState }
  /** 게임 시작: 방장 것까지 모든 약속(해시)을 먼저 알린다. 참가자는 이걸 받은 뒤 비밀 값을 방장에게만 보낸다 */
  | { t: "started"; commitments: Commitment[] }
  | { t: "snapshot"; view: V; events: E[] }
  | { t: "rejected"; error: string }
  /** 게임이 끝나면 모든 비밀 값과 행동 기록을 공개한다. 참가자가 시드와 진행을 직접 다시 계산해 확인한다 */
  | { t: "audit"; reveals: Reveal[]; log: KitLoggedAction<A>[] }
  /** 채팅. 방장이 받은 말을 모두에게 다시 보낸다(이름은 방장이 붙인다) */
  | { t: "chat"; message: ChatMessage }
  | AuditReport;

function hasTag(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { t?: unknown }).t === "string"
  );
}

/** 받은 값이 메시지 모양인지만 본다. 내용 검증은 받는 쪽(방장 엔진)이 한다 */
export function isGuestMessage<A = Action>(
  value: unknown,
): value is GuestMessage<A> {
  return hasTag(value);
}

export function isHostMessage<V = PlayerView, E = GameEvent, A = Action>(
  value: unknown,
): value is HostMessage<V, E, A> {
  return hasTag(value);
}
