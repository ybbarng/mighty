import type { PlayerClock } from "@mighty/engine";
import type { Cell, Stone } from "./board";
import type { BadukRules } from "./rules";

/** play: 두기 / roundEnd: 판 끝 / gameOver: 게임 끝 */
export type Phase = "play" | "roundEnd" | "gameOver";

/** 세기 결과(덤 포함). 흑·백 자리 수 */
export interface AreaCount {
  black: number;
  /** 백 자리 수 + 덤 */
  white: number;
}

/** 판 결과. `seat`은 이긴 자리 */
export type RoundResult =
  /** 두 사람이 이어 쉬어(또는 수 한도) 자리를 셌다 */
  | { kind: "score"; seat: number; count: AreaCount; limit?: true }
  | { kind: "resign"; seat: number }
  /** 상대가 시간을 다 썼다 */
  | { kind: "time"; seat: number };

/** 둔 수 하나. 쉬기는 `at`이 없다 */
export type Played =
  | { stone: Stone; at: number; captured: number[] }
  | { stone: Stone; pass: true };

export interface BadukState {
  rules: BadukRules;
  /** 길이 크기×크기. 자리 번호는 y*크기+x, y=0이 판 위쪽 */
  board: Cell[];
  /** 둘 차례인 돌. 흑이 먼저다 */
  toPlay: Stone;
  /** 이번 판에 둔 수, 둔 차례대로 */
  played: Played[];
  /** 이어서 쉰 횟수. 둘이 되면 판이 끝난다 */
  passes: number;
  /** 이번 판에 흑을 쥔 자리. 판마다 바뀐다 */
  blackSeat: number;
  /** 돌마다 따낸 상대 돌 수(1 흑이 따낸 것, 2 백이 따낸 것) */
  prisoners: Record<Stone, number>;
  roundNumber: number;
  /** 자리마다 이긴 판 수 */
  wins: number[];
  phase: Phase;
  result: RoundResult | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 개인 시간(자리마다 남은 기본 시간·초읽기). 시간 규칙이 없으면 null */
  clocks: PlayerClock[] | null;
  /** 이번 판에 나온 판 모양의 지문(`boardHash`). 같은 모양을 다시 만드는 수는 둘 수 없다(패) */
  positions: string[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  /** `spent`: 이 수에 쓴 시간(ms). 대국을 돌리는 기기(혼자 하기·방장)가 싣는다 */
  | { type: "place"; at: number; spent?: number }
  | { type: "pass"; spent?: number }
  /** 시간을 다 썼다. 대국을 돌리는 기기가 그 자리로 기록에 남긴다 */
  | { type: "timeout"; spent: number }
  | { type: "resign" }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; blackSeat: number }
  | {
      type: "placed";
      seat: number;
      stone: Stone;
      at: number;
      /** 따낸 상대 돌 자리 */
      captured: number[];
    }
  | { type: "passed"; seat: number; stone: Stone }
  | { type: "roundEnded"; result: RoundResult; wins: number[] }
  | { type: "gameEnded"; wins: number[]; retired?: boolean };

/** 한 자리에서 본 화면. 감출 것이 없어 상태 그대로에 내 자리를 더한다 */
export interface BadukView extends BadukState {
  mySeat: number;
  /** 지금 내가 할 일. 없으면 null */
  decision: { kind: "move" } | { kind: "continue" } | null;
  /** 내 차례에 돌을 놓을 수 있는 자리 */
  legal: number[];
}
