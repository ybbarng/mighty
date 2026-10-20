import type {
  Action,
  GameEvent,
  LoggedAction,
  PlayerView,
} from "@mighty/engine";

/** 대기실 자리 하나 */
export interface LobbySeat {
  seat: number;
  name: string;
  kind: "host" | "guest" | "bot";
  /** 사람 자리가 지금 연결되어 있는가. 끊기면 잠시 뒤 컴퓨터가 대신 둔다 */
  connected: boolean;
}

export interface LobbyState {
  /** 원작 규칙 문자열 */
  ruleCode: string;
  seats: LobbySeat[];
  started: boolean;
}

/** 공정한 섞기: 처음에는 해시만, 시작할 때 원래 값을 낸다 (docs/07-security.md 5절) */
export interface Commitment {
  seat: number;
  hash: string;
}
export interface Reveal {
  seat: number;
  secret: string;
}

/** 참가자 → 방장 */
export type GuestMessage =
  | { t: "join"; name: string; token: string | null; commit: string }
  | { t: "action"; action: Action }
  | { t: "reveal"; secret: string }
  | { t: "leave" };

/** 방장 → 참가자 */
export type HostMessage =
  | { t: "welcome"; seat: number; token: string }
  | { t: "full" }
  /** 방장이 대기실에서 내보냈다. 같은 방에는 다시 들어올 수 없다 */
  | { t: "kicked" }
  | { t: "lobby"; lobby: LobbyState }
  /** 게임 시작: 방장 것까지 모든 약속(해시)을 먼저 알린다. 참가자는 이걸 받은 뒤 비밀 값을 방장에게만 보낸다 */
  | { t: "started"; commitments: Commitment[] }
  | { t: "snapshot"; view: PlayerView; events: GameEvent[] }
  | { t: "rejected"; error: string }
  /** 게임이 끝나면 모든 비밀 값과 행동 기록을 공개한다. 참가자가 시드와 진행을 직접 다시 계산해 확인한다 */
  | { t: "audit"; reveals: Reveal[]; log: LoggedAction[] };

function hasTag(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { t?: unknown }).t === "string"
  );
}

/** 받은 값이 메시지 모양인지만 본다. 내용 검증은 받는 쪽(방장 엔진)이 한다 */
export function isGuestMessage(value: unknown): value is GuestMessage {
  return hasTag(value);
}

export function isHostMessage(value: unknown): value is HostMessage {
  return hasTag(value);
}
