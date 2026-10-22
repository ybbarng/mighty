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
  /** 컴퓨터가 둔 수. 판 끝 검증에서 같은 컴퓨터로 다시 계산해 맞춰 본다 */
  bot?: true;
}

/**
 * 내 기록(통계)으로 무엇을 남기나. 내 자리 화면과 사건만 본다(`StatsRecorder`).
 * 판 기록·게임 기록의 모양은 게임마다 정하고, 지표는 그 게임의 통계 화면이 계산한다
 */
export interface KitStats<View, Event> {
  /** 이 사건들로 새 판이 시작했다 */
  roundStarted(events: readonly Event[]): boolean;
  /** 이 사건들로 판 점수가 매겨졌다 */
  roundEnded(events: readonly Event[]): boolean;
  gameEnded(events: readonly Event[]): boolean;
  roundNumber(view: View): number;
  /** 판 기록. `start`는 판이 시작할 때 화면(보지 못했으면 null), `events`는 그 판 사건 모두 */
  round(start: View | null, end: View, events: readonly Event[]): unknown;
  /** 게임 기록. `events`는 게임이 끝난 걸음의 사건 */
  game(view: View, events: readonly Event[]): unknown;
}

/**
 * 복기(다시 보기)를 위해 기록에서 상태를 다시 만들 때 게임마다 다른 것.
 * 멘탈 포커 판은 시드가 패를 정하지 않으므로 판마다 실제 패(`deals`, 판 번호 → 그 판 패)를 넣어 가며 돌린다
 */
export interface KitReview<State, Extra> {
  /** 첫 판 실제 패로 대국을 만들 때의 시작 조건 */
  firstExtra(deals: ReadonlyMap<number, unknown>): Extra | undefined;
  /** 한 걸음 전에: 다음 판(또는 다시 나누기) 실제 패를 상태에 넣는다 */
  prepare(state: State, deals: ReadonlyMap<number, unknown>): State;
  /** 한 걸음 뒤에: 쓰지 않은 미리 정한 패를 지운다 */
  cleanup(state: State, before: State): State;
  /** 멘탈 포커 판의 기록 속 행동(자리 표)을 그 판 실제 카드로 바꾼다. `deal`은 그 판 패 */
  realAction(action: unknown, deal: unknown): unknown;
  /**
   * 상황판: 그 순간 자리별로 떨어진 무늬(선 무늬를 따르지 못한 적이 있다, 무늬 기호)와
   * 점수 요약(여당·야당 점수 카드, 자리별 받은 점수 등)
   */
  situation(state: State): {
    voids: string[][];
    /** `seat`가 있으면 그 자리 이름을 앞에 붙인다 */
    tally: { label: string; value: string; seat?: number }[];
  };
  /** 행동 한 줄 설명(다시 보기에서 실제 수와 고수 수를 견준다) */
  describe(action: unknown): string;
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
  /**
   * 게임을 중간에 끝내는 행동. 멘탈 포커 판에서 끊긴 사람을 더 기다리지 않기로 하면(방장·투표) 방장 자리로 낸다.
   * 참가자는 보낼 수 없어야 한다(`guestMayAct`)
   */
  readonly retireAction: Action;
  /** 내 기록에 남길 것 */
  readonly stats: KitStats<View, Event>;
  /** 복기할 때 기록에서 상태를 다시 만든다 */
  readonly review: KitReview<State, Extra>;
  /** 봇이 둘 수 있는 화면인가. 튜토리얼 장면처럼 낼 카드가 떨어지면 멈춘다 */
  botCanAct?(view: View): boolean;
  /** 온라인 참가자가 보낼 수 있는 행동인가(마이티의 그만두기처럼 혼자 할 때만 쓰는 것을 막는다) */
  guestMayAct?(action: Action): boolean;
  /** 실력 단계의 컴퓨터. 온라인 판 끝 검증에서 컴퓨터 수를 다시 계산한다 */
  botFor?(level: number): KitBot<View, Action>;
  /** 봇 행동 다듬기(손패 위치 같은 연출 정보) */
  annotateBotAction?(view: View, action: Action): Action;
}
