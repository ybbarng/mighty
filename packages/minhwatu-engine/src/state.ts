import type { PresetDeal } from "@mighty/hwatu";

import type { MinhwatuRules } from "./rules";
import type { SeatScore, YakId } from "./score";

/** play: 손패 내기 / pick: 뒤집은 패가 바닥 두 장과 맞아 고르기 / roundEnd: 판 끝 / gameOver: 게임 끝 */
export type Phase = "play" | "pick" | "roundEnd" | "gameOver";

/** 한 차례(손패 한 장 내고 더미 한 장 뒤집기)에 일어난 일. 화면이 방금 무엇이 오갔는지 보인다 */
export interface TurnRecord {
  seat: number;
  played: string;
  /** 낸 패로 먹은 카드(낸 패 포함). 맞는 바닥 패가 없어 바닥에 놓였으면 빈 목록 */
  playTook: string[];
  /** 뒤집은 패(더미가 비었으면 null) */
  flipped: string | null;
  /** 뒤집은 패로 먹은 카드(뒤집은 패 포함) */
  flipTook: string[];
}

/** 판 결과 */
export interface RoundResult {
  roundNumber: number;
  scores: SeatScore[];
  /** 판 점수가 가장 높은 자리(같으면 여럿) */
  winners: number[];
}

export interface MinhwatuState {
  rules: MinhwatuRules;
  /** 게임 시드. 판마다 이 시드와 판 번호로 섞는다 */
  seed: number;
  roundNumber: number;
  /** 이번 판 선(먼저 내는 자리) */
  dealer: number;
  /** 자리별 손패(달 순서로 정리) */
  hands: string[][];
  /** 바닥 패(놓인 차례대로) */
  floor: string[];
  /** 더미(앞이 다음에 뒤집을 카드). 아무에게도 보이지 않는다 */
  deck: string[];
  /** 자리별 먹은 패(먹은 차례대로) */
  captured: string[][];
  /** 지금 낼 자리 */
  turn: number;
  phase: Phase;
  /** 뒤집은 패가 바닥 두 장과 맞아 고르는 중: 그 패와 고를 수 있는 바닥 패 */
  pending: { flipped: string; options: string[] } | null;
  /** 지금 차례에 일어난 일(고르는 중이면 아직 끝나지 않은 차례) */
  current: TurnRecord | null;
  /** 바로 앞 차례 */
  last: TurnRecord | null;
  /** 게임 합계 점수 */
  totals: number[];
  /** 이번 판 결과(판 끝·게임 끝에만) */
  result: RoundResult | null;
  /** 지난 판들의 결과 */
  history: RoundResult[];
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
  /** 멘탈 포커 판: 판마다 시드 대신 미리 정한 패로 나눈다(`preset`) */
  fair?: true;
  /** 다음에 나눌 판의 패(멘탈 포커). 나누면 지운다 */
  preset?: PresetDeal;
}

export type Action =
  /** 손패 한 장을 낸다. 같은 달 바닥 패가 둘이면 `target`으로 하나를 고른다 */
  | { type: "play"; card: string; target?: string }
  /** 뒤집은 패가 바닥 두 장과 맞을 때 먹을 바닥 패 */
  | { type: "pick"; target: string }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | {
      type: "roundStarted";
      roundNumber: number;
      dealer: number;
      handSize: number;
    }
  /** 손패를 냈다. `took`은 먹은 카드(낸 패 포함, 못 먹었으면 빈 목록) */
  | { type: "played"; seat: number; card: string; took: string[] }
  /** 더미에서 뒤집었다. `waiting`이면 바닥 두 장 중에서 고르기를 기다린다 */
  | {
      type: "flipped";
      seat: number;
      card: string;
      took: string[];
      waiting?: true;
    }
  | { type: "picked"; seat: number; card: string; took: string[] }
  /** 약을 이뤘다 */
  | { type: "yak"; seat: number; yak: YakId; value: number }
  | { type: "roundEnded"; result: RoundResult; totals: number[] }
  | {
      type: "gameEnded";
      totals: number[];
      winners: number[];
      retired?: true;
    };

/** 한 자리에서 본 화면. 남의 손패와 더미 순서는 장수만 보인다 */
export interface MinhwatuView {
  seat: number;
  rules: MinhwatuRules;
  roundNumber: number;
  dealer: number;
  hand: string[];
  /** 자리별 손패 장수 */
  handCounts: number[];
  floor: string[];
  deckCount: number;
  captured: string[][];
  turn: number;
  phase: Phase;
  pending: { flipped: string; options: string[] } | null;
  current: TurnRecord | null;
  last: TurnRecord | null;
  totals: number[];
  result: RoundResult | null;
  history: RoundResult[];
  continued: boolean[];
  retired: boolean;
  /** 지금 내가 할 일. 없으면 null */
  decision:
    | { kind: "play" }
    | { kind: "pick"; options: string[] }
    | { kind: "continue" }
    | null;
}
