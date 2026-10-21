import type { RngState } from "@mighty/engine";

/** 컴퓨터 플레이어. 자기 자리에서 보이는 정보만 받는다(마이티·하트 공통 모양) */
export interface KitBot<View, Action> {
  readonly name: string;
  decide(view: View, rng: RngState): Action;
}

export type StepOutcome<State, Event> =
  | { ok: true; state: State; events: Event[] }
  | { ok: false; error: string };

export interface KitLoggedAction<Action> {
  seat: number;
  action: Action;
}

/**
 * 게임 하나를 돌리는 데 필요한 것. 대국 진행(LocalMatch)과 온라인 방(HostRoom·GuestRoom)은
 * 이것만 알고, 어떤 게임(마이티·하트)인지는 모른다.
 * `Extra`는 그 게임만의 시작 조건(마이티의 정해진 패 등)이다.
 */
export interface GameKit<Rules, State, View, Action, Event, Extra = undefined> {
  readonly id: string;
  createMatch(
    rules: Rules,
    seed: number,
    extra?: Extra,
  ): { state: State; events: Event[] };
  step(state: State, seat: number, action: Action): StepOutcome<State, Event>;
  viewOf(state: State, seat: number): View;
  replay(
    rules: Rules,
    seed: number,
    log: readonly KitLoggedAction<Action>[],
    extra?: Extra,
  ): { ok: true; state: State } | { ok: false; index: number; error: string };
  /** 지금 결정해야 하는 자리들 */
  pendingSeats(state: State): number[];
  playerCount(rules: Rules): number;
  encodeRules(rules: Rules): string;
  decodeRules(
    code: string,
  ): { ok: true; rules: Rules } | { ok: false; reason: string };
  /** 방장이 시작할 때 참가자 첫 화면과 함께 보내는 이벤트(나눠 주기 연출 등) */
  startEvents(view: View): Event[];
  /** 게임이 끝났는가(온라인 판 끝 검증을 시작한다) */
  isOver(view: View): boolean;
  /** 봇이 둘 수 있는 화면인가. 튜토리얼 장면처럼 낼 카드가 떨어지면 멈춘다 */
  botCanAct?(view: View): boolean;
  /** 봇 행동 다듬기(손패 위치 같은 연출 정보) */
  annotateBotAction?(view: View, action: Action): Action;
}
