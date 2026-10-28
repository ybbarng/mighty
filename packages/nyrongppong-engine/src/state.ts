import type { PresetDeal } from "@mighty/hwatu";
import type { Yak } from "./hand";
import type { NyrongppongRules } from "./rules";

/**
 * draw: 가져오기 전(스톱할 수 있을 때만 묻는다. 아니면 엔진이 바로 한 장 가져온다)
 * discard: 한 장 버리기(여섯 장이 약이면 약을 낼 수도 있다)
 * call: 버린 패에 뽕을 부를지 기다리는 중(응답 창)
 * roundEnd: 판 끝 / gameOver: 게임 끝
 */
export type Phase = "draw" | "discard" | "call" | "roundEnd" | "gameOver";

export type CallAnswer = "call" | "pass";

/**
 * 뽕 응답 창(docs/30 2절). 버린 패와 같은 달을 두 장 이상 든 자리마다 뽕/넘김을 받는다.
 * 여럿이 부르면 버린 사람 다음 자리부터 도는 차례(`responses` 순서)가 앞선 사람이 가져간다.
 * 앞선 자리가 모두 정해지면 뒤 자리를 기다리지 않고 바로 가린다.
 * 나중에 실시간 판정(먼저 외친 사람)으로 바꿀 때는 이 순서 대신 판정 결과로 가리면 된다(`resolveCall`).
 */
export interface CallWindow {
  /** 버린 자리 */
  from: number;
  card: string;
  /** 뽕할 수 있는 자리와 응답. 버린 사람 다음 자리부터 도는 차례 */
  responses: { seat: number; answer: CallAnswer | null }[];
  /** 창이 열린 뒤 지난 시간(ms). 응답마다 대국을 돌리는 기기가 잰 시간을 더한다 */
  used: number;
}

/** 판이 어떻게 끝났나 */
export type RoundEnd =
  /** 여섯 장 약을 냈다 */
  | { kind: "yak"; seat: number; yak: Yak }
  /** 뽕으로 손패를 모두 털었다(박). `from`은 그 패를 버려 바가지를 쓴 자리 */
  | { kind: "out"; seat: number; from: number }
  /** 스톱. `success`면 가장 낮아 0점, 아니면 스톱 바가지 */
  | { kind: "stop"; seat: number; success: boolean }
  /** 더미가 떨어졌다 */
  | { kind: "deckOut" };

export interface RoundResult {
  end: RoundEnd;
  /** 이번 판 점수(자리별, 낮을수록 좋다) */
  scores: number[];
  /** 판이 끝날 때 손패(모두 공개) */
  hands: string[][];
  /** 이번 판까지 합계 */
  totals: number[];
}

export interface NyrongppongState {
  rules: NyrongppongRules;
  /** 판마다 섞는 시드의 바탕. 화면에는 보이지 않는다 */
  seed: number;
  roundNumber: number;
  /** 이번 판 선(먼저 버리는 자리). 판마다 다음 자리로 넘어간다 */
  dealer: number;
  /** 지금 차례인 자리(가져오기·버리기) */
  turn: number;
  phase: Phase;
  /** 남은 더미. 앞이 맨 위 */
  deck: string[];
  hands: string[][];
  /** 버린 패. 끝이 맨 위 */
  pile: string[];
  /** 자리별로 뽕해 내려놓은 묶음(버린 패 + 내 두 장) */
  melds: string[][][];
  /** 이번 차례에 가져온 카드(그 사람에게만 보인다) */
  drawn: string | null;
  call: CallWindow | null;
  /** 자리별 합계 점수 */
  totals: number[];
  result: RoundResult | null;
  /** 판 끝에 "다음 판"을 누른 자리 */
  continued: boolean[];
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
  /**
   * 멘탈 포커 판(docs/30 4절). 방장 엔진이 남의 손패를 모른 채 진행하도록 손패에 달린 갈림을 없앤다.
   * - 판마다 시드 대신 함께 섞어 나눈 패(`preset`)로 나눈다
   * - 버릴 때마다 모두에게 응답 창을 연다. 뽕할 수 있는지는 부를 때 확인하고(두 장을 보인다), 먼저 부른 사람이 가져간다
   * - 뽕을 한 적이 있으면 차례마다 스톱을 묻는다(손패 합을 몰라도 같은 갈림)
   */
  fair?: true;
  /** 이번에 나눌 판의 패(멘탈 포커). 나누면 지운다 */
  preset?: PresetDeal;
}

export type Action =
  | { type: "draw" }
  | { type: "stop" }
  | { type: "discard"; card: string }
  | { type: "declare" }
  /** 뽕! `spent`: 창이 열린 뒤(또는 앞 응답 뒤) 지난 시간(ms). 대국을 돌리는 기기가 싣는다 */
  | { type: "call"; spent?: number }
  | { type: "pass"; spent?: number }
  /** 응답 시간이 다 됐다. 아직 정하지 않은 자리는 모두 넘긴 것으로 본다 */
  | { type: "timeout"; spent: number }
  | { type: "continue" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

/** 사건. 모든 자리에 똑같이 가므로 숨길 정보(가져온 카드 등)는 넣지 않는다 */
export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; dealer: number }
  | { type: "drew"; seat: number }
  | { type: "discarded"; seat: number; card: string }
  | { type: "callOpened"; from: number; card: string }
  | { type: "ppong"; seat: number; from: number; card: string }
  | { type: "callClosed"; from: number; card: string }
  | { type: "stopped"; seat: number }
  | { type: "declared"; seat: number; yak: Yak }
  | { type: "roundEnded"; result: RoundResult }
  | { type: "gameEnded"; totals: number[]; retired?: boolean };

/** 내가 지금 할 일 */
export type Decision =
  | { kind: "draw"; canStop: boolean }
  | { kind: "discard"; yak: Yak | null }
  | { kind: "call" }
  | { kind: "continue" };

/** 한 자리에서 본 화면. 남의 손패와 더미 순서·시드는 숨긴다 */
export interface NyrongppongView {
  rules: NyrongppongRules;
  mySeat: number;
  roundNumber: number;
  dealer: number;
  turn: number;
  phase: Phase;
  /** 내 손패 */
  hand: string[];
  /** 이번 차례에 내가 가져온 카드 */
  drawn: string | null;
  /** 자리별 손패 장수 */
  handCounts: number[];
  deckCount: number;
  pile: string[];
  melds: string[][][];
  totals: number[];
  /**
   * 열린 뽕 응답 창. `left`는 이 화면을 만든 순간 남은 시간(ms).
   * 누가 뽕할 수 있는지는 보이지 않고, 내가 할 수 있으면 `mine`에 내 응답(아직이면 null)이 있다
   */
  call: {
    from: number;
    card: string;
    left: number;
    mine?: CallAnswer | null;
  } | null;
  decision: Decision | null;
  result: RoundResult | null;
  continued: boolean[];
  retired?: boolean;
}
