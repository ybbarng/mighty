import type { PlayerClock } from "@mighty/engine";
import type { Cell, Forbidden, Stone } from "./board";
import type { OmokRules } from "./rules";

export type Phase = "play" | "roundEnd" | "gameOver";

/** 판 결과. `seat`은 이긴 자리 */
export type RoundResult =
  | { kind: "five"; seat: number; stone: Stone; line: number[] }
  | { kind: "resign"; seat: number }
  /** 상대가 시간을 다 썼다 */
  | { kind: "time"; seat: number }
  | { kind: "draw" };

export interface OmokState {
  rules: OmokRules;
  /** 길이 225. 자리 번호는 y*15+x */
  board: Cell[];
  /** 이번 판에 둔 자리, 둔 차례대로. 흑이 먼저다 */
  moves: number[];
  /** 이번 판에 흑을 쥔 자리. 판마다 바뀐다 */
  blackSeat: number;
  roundNumber: number;
  /** 자리마다 이긴 판 수 */
  wins: number[];
  phase: Phase;
  result: RoundResult | null;
  /** 개인 시간(자리마다 남은 기본 시간·초읽기). 시간 규칙이 없으면 null */
  clocks: PlayerClock[] | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  /** `spent`: 이 수에 쓴 시간(ms). 대국을 돌리는 기기(혼자 하기·방장)가 싣는다 */
  | { type: "place"; at: number; spent?: number }
  /** 시간을 다 썼다. 대국을 돌리는 기기가 그 자리로 기록에 남긴다 */
  | { type: "timeout"; spent: number }
  | { type: "resign" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; blackSeat: number }
  | { type: "placed"; seat: number; at: number; stone: Stone }
  | { type: "roundEnded"; result: RoundResult; wins: number[] }
  | { type: "gameEnded"; wins: number[]; retired?: boolean };

/** 한 자리에서 본 화면. 감출 것이 없어 상태 그대로에 내 자리를 더한다 */
export interface OmokView extends OmokState {
  mySeat: number;
  /** 지금 내가 할 일: 돌 두기·다음 판 누르기. 없으면 null(온라인 참가자가 차례 아닐 때 보내지 않는다) */
  decision: { kind: "place" } | { kind: "continue" } | null;
  /** 내 차례면 금지 자리와 그 이름(판에 ×로 보인다) */
  forbidden: { at: number; reason: Forbidden }[];
}
