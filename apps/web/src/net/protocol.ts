import type { Action, GameEvent, PlayerView } from "@mighty/engine";
import type { FairControl, FairWire, GroupName } from "@mighty/fair-play";

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
  /** 빈자리 컴퓨터의 실력 단계. 판 끝에 컴퓨터 수를 다시 계산해 방장이 조종하지 않았는지 본다 */
  botLevel?: number;
  seats: LobbySeat[];
  started: boolean;
  /**
   * 멘탈 포커로 섞고 나눈다(docs/13-mental-poker.md). 방장도 남의 패를 모른다.
   * `group`은 쓰는 수의 크기(비트)
   */
  fair?: { group: GroupName };
}

/**
 * 부정을 찾았다. 찾은 기기가 모두에게 직접 알린다(방장을 거치지 않는다).
 * 받은 쪽은 "그 사람의 주장"으로 보여 주고, 자기 기기가 찾은 것만 판을 멈추는 근거로 쓴다.
 */
export interface IncidentReport {
  t: "incident";
  /** 알린 사람 자리 */
  reporter: number;
  /** 탓한 자리. 누군지 가릴 수 없으면 null */
  seat: number | null;
  reason: string;
}

/** 멘탈 포커 메시지(섞은 덱, 공개한 열쇠, 물음과 답, 판 기록). 기기끼리 모두에게 직접 보낸다 */
export type FairMessage = FairWire | FairControl;

export function isFairMessage(value: unknown): value is FairMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { t?: unknown }).t === "fp" &&
    typeof (value as { k?: unknown }).k === "string"
  );
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
      /**
       * 재접속 증명: SHA-256("mighty-token|토큰|받는 사람 연결 아이디"). 토큰 자체는 보내지 않는다.
       * 받는 사람마다 값이 달라서, 방에 있는 다른 사람이 엿들어 방장에게 다시 보내도 쓸 수 없다.
       */
      tokenProof: string | null;
      commit: string;
      /** 방장 서명에 넣을 임의의 값(identity.ts) */
      nonce?: string;
    }
  | { t: "action"; action: A }
  | { t: "reveal"; secret: string }
  | { t: "chat"; text: string }
  | AuditReport
  | IncidentReport
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
  | {
      t: "audit";
      reveals: Reveal[];
      log: KitLoggedAction<A>[];
      /** 실제로 시드에 쓴 약속(값을 내지 않아 빠진 자리를 뺀 것) */
      commitments?: Commitment[];
    }
  /** 채팅. 방장이 받은 말을 모두에게 다시 보낸다(이름은 방장이 붙인다) */
  | { t: "chat"; message: ChatMessage }
  /**
   * 멘탈 포커 판: 시드는 덱을 정하지 않으므로(덱은 모두가 함께 섞는다) 시작하자마자 공개한다.
   * 참가자는 이 값으로 판마다 진행을 다시 계산한다
   */
  | { t: "seed"; reveals: Reveal[]; commitments: Commitment[] }
  /** 다시 연결된 참가자에게 그동안 오간 멘탈 포커 메시지를 다시 보낸다 */
  | { t: "fpRelay"; items: { from: number; message: FairMessage }[] }
  | AuditReport
  | IncidentReport;

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
