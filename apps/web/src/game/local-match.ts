import { heuristicBot } from "@mighty/ai";
import {
  type Action,
  createRng,
  type GameEvent,
  type LoggedAction,
  type MatchState,
  type PlayerView,
  type PresetDeal,
  type RngState,
  type RuleSet,
} from "@mighty/engine";

import { type Clock, realClock } from "@mighty/fair-play";

import type { MatchHost, Snapshot, SubmitResult } from "./host";
import type { GameKit, KitBot, KitLoggedAction, StepOutcome } from "./kit";
import { mightyKit } from "./mighty-kit";

export interface LocalMatchOptions<
  Rules = RuleSet,
  State = MatchState,
  View = PlayerView,
  ActionT = Action,
  Event = GameEvent,
  Extra = PresetDeal,
> {
  /** 어떤 게임인가. 없으면 마이티 */
  kit?: GameKit<Rules, State, View, ActionT, Event, Extra>;
  rules: Rules;
  seed: number;
  /** 이 화면의 자리 */
  humanSeat?: number;
  /** 사람이 앉은 자리 전부(온라인 대전에서 방장이 엔진을 돌릴 때). 나머지는 봇이 앉는다 */
  humanSeats?: number[];
  bot?: KitBot<View, ActionT>;
  /** 그 게임만의 시작 조건(마이티의 정해진 패) */
  presetDeal?: Extra;
  /** 튜토리얼 미션처럼 정해진 장면(`createScenario`)에서 시작한다. 이런 대국은 저장하지 않는다 */
  initialState?: State;
  /**
   * 봇이 한 수 둘 때마다 다음 수를 이 함수로 미룬다. 브라우저에서 `setTimeout`을 넘기면
   * 2단계 봇이 여럿 이어 생각해도 화면이 한 번에 오래 멈추지 않는다. 없으면 한 번에 다 둔다.
   */
  pace?: (next: () => void) => void;
  /** 엔진 한 걸음을 바꾼다(멘탈 포커: 자리 표를 든 상태, packages/fair-play) */
  step?: (
    state: State,
    seat: number,
    action: ActionT,
  ) => StepOutcome<State, Event>;
  /**
   * 엔진에 넣기 전 비동기 준비(멘탈 포커: 열쇠·증명 모으기). 있으면 행동을 하나씩 차례로 처리하고,
   * 돌려준 행동을 엔진에 넣는다
   */
  prepare?: (
    state: State,
    seat: number,
    action: ActionT,
  ) => Promise<{ ok: true; action: ActionT } | { ok: false; error: string }>;
  /** 그 자리에 보낼 화면을 바꾼다. null이면 아직 보여 줄 수 없어 미룬다(`flushViews`) */
  revealView?: (seat: number, view: View) => View | null;
  /** 아직 보여 줄 수 없는 화면 대신 쓸 것(결정을 숨긴 화면). 없으면 마지막으로 보낸 화면 */
  maskView?: (seat: number, view: View) => View;
  /** 행동할 자리(없으면 `kit.pendingSeats`). 하트 멘탈 포커의 첫 선처럼 엔진이 모르는 자리를 알려 준다 */
  pendingSeats?: (state: State) => number[];
  /** 엔진 걸음 뒤 */
  afterStep?: (state: State, events: Event[]) => void;
  /** 준비하다 거절된 행동(비동기라 `submitAs`가 돌려준 뒤에 알게 된다) */
  onLateError?: (seat: number, error: string) => void;
  /**
   * 새로고침한 방장: 남겨 둔 엔진 상태·기록·컴퓨터 난수에서 이어 간다. 컴퓨터는 `refresh`를 부를 때 깨운다
   * (멘탈 포커 진행을 되살린 뒤에)
   */
  resume?: ResumeState<State, ActionT>;
  /** 개인 시간을 재는 시계(`kit.timing`이 있는 게임). 시험은 ManualClock을 넣는다 */
  clock?: Clock;
}

/** 방장 새로고침에 대비해 남기는 진행. 멘탈 포커는 증명으로 고친 상태라 기록만으로 되살릴 수 없어 상태째 남긴다 */
export interface ResumeState<State = MatchState, ActionT = Action> {
  state: State;
  log: KitLoggedAction<ActionT>[];
  /** 컴퓨터 난수 상태. 참가자가 같은 난수로 컴퓨터 수를 다시 계산한다 */
  rng: number;
}

/** 브라우저에 남기는 저장 내용. 상태 대신 시작 조건과 행동 기록만 남기고 `replay`로 되살린다 */
export interface SavedMatch<
  Rules = RuleSet,
  ActionT = Action,
  Extra = PresetDeal,
> {
  version: 1;
  rules: Rules;
  seed: number;
  humanSeat: number;
  presetDeal?: Extra;
  log: KitLoggedAction<ActionT>[];
}

/**
 * 브라우저 안에서 엔진과 봇을 돌린다. 서버가 없다.
 * 혼자 할 때는 이 화면의 자리만 사람이고, 온라인 대전에서는 방장 기기가 이것으로 모든 자리를 진행한다.
 * 엔진 진행은 즉시 끝내고, 각 화면이 스냅숏을 받아 제 속도로 재생한다.
 * 어떤 게임인지는 `kit`이 정한다(없으면 마이티).
 */
export class LocalMatch<
  Rules = RuleSet,
  State = MatchState,
  View = PlayerView,
  ActionT = Action,
  Event = GameEvent,
  Extra = PresetDeal,
> implements MatchHost<View, ActionT, Event>
{
  readonly seat: number;
  readonly kit: GameKit<Rules, State, View, ActionT, Event, Extra>;
  private state: State;
  private readonly rules: Rules;
  private readonly seed: number;
  private readonly presetDeal: Extra | undefined;
  private readonly bot: KitBot<View, ActionT>;
  private readonly rng: RngState;
  private readonly log: KitLoggedAction<ActionT>[] = [];
  private readonly humans: Set<number>;
  /** 사람 자리지만 연결이 끊겨 잠시 봇이 대신 두는 자리 */
  private readonly standIns = new Set<number>();
  private readonly listeners = new Map<
    number,
    Set<(snapshot: Snapshot<View, Event>) => void>
  >();
  private readonly pending: Snapshot<View, Event>[] = [];
  private readonly pace: ((next: () => void) => void) | null;
  private botScheduled = false;
  private readonly stepper: (
    state: State,
    seat: number,
    action: ActionT,
  ) => StepOutcome<State, Event>;
  private readonly options: LocalMatchOptions<
    Rules,
    State,
    View,
    ActionT,
    Event,
    Extra
  >;
  /** 준비 중인 행동들(차례로 처리한다) */
  private work: Promise<void> = Promise.resolve();
  /** 컴퓨터 행동을 준비하는 중 */
  private botBusy = false;
  /** 행동을 준비 중인 사람 자리 */
  private readonly preparing = new Set<number>();
  /** 아직 보여 줄 수 없어 미룬 화면(자리별) */
  private readonly held = new Map<number, Snapshot<View, Event>[]>();
  /** 자리별로 마지막에 보낸 화면 */
  private readonly shown = new Map<number, View>();
  /** 부정이 드러나 멈췄다 */
  private haltedReason: string | null = null;
  /** `end()`로 끝냈다. 준비 중이던 행동은 버리고, 못 연 카드는 가린 채 끝난 화면을 보낸다 */
  private ended = false;
  /** 개인 시간: 시계, 지금 차례가 시작된 시각, 시간패를 거는 타이머 */
  private readonly clock: Clock;
  private turnSince = 0;
  private cancelFlag: (() => void) | null = null;

  constructor(
    options: LocalMatchOptions<Rules, State, View, ActionT, Event, Extra>,
    savedLog?: readonly KitLoggedAction<ActionT>[],
  ) {
    this.kit =
      options.kit ??
      (mightyKit as unknown as GameKit<
        Rules,
        State,
        View,
        ActionT,
        Event,
        Extra
      >);
    this.seat = options.humanSeat ?? 0;
    this.humans = new Set(options.humanSeats ?? [this.seat]);
    this.humans.add(this.seat);
    this.rules = options.rules;
    this.seed = options.seed;
    this.presetDeal = options.presetDeal;
    this.bot =
      options.bot ?? (heuristicBot as unknown as KitBot<View, ActionT>);
    this.pace = options.pace ?? null;
    this.rng = createRng(options.seed ^ 0x2545f491);
    this.options = options;
    this.clock = options.clock ?? realClock;
    this.stepper =
      options.step ?? ((st, seat, a) => this.kit.step(st, seat, a));

    if (options.resume) {
      this.state = options.resume.state;
      this.log.push(...options.resume.log);
      this.rng.seed = options.resume.rng;
      this.hold(this.seat, {
        view: this.kit.viewOf(this.state, this.seat),
        events: [],
      });
      this.armClock();
      return;
    }
    if (savedLog && savedLog.length > 0) {
      const replayed = this.kit.replay(
        this.rules,
        this.seed,
        savedLog,
        this.presetDeal,
      );
      if (!replayed.ok)
        throw new Error(`저장한 대국을 되살릴 수 없다: ${replayed.error}`);
      this.state = replayed.state;
      this.log.push(...savedLog);
    } else if (options.initialState) {
      this.state = options.initialState;
      this.pending.push({
        view: this.kit.viewOf(this.state, this.seat),
        events: [],
      });
    } else {
      const created = this.kit.createMatch(
        this.rules,
        this.seed,
        this.presetDeal,
      );
      this.state = created.state;
      this.created = created.events;
      this.hold(this.seat, {
        view: this.kit.viewOf(this.state, this.seat),
        events: created.events,
      });
    }
    // 저장한 대국을 이어 둘 때도 시계는 지금부터 다시 잰다(닫아 둔 동안은 세지 않는다).
    this.armClock();
    this.runBots();
  }

  /**
   * 개인 시간: 지금 차례의 시계를 건다. 그 사람이 쓸 수 있는 시간이 다 지나면 그 자리로 시간패를 기록에 남긴다.
   * 수가 오갈 때마다(`apply`) 다시 건다
   */
  private armClock(): void {
    this.cancelFlag?.();
    this.cancelFlag = null;
    this.turnSince = this.clock.now();
    const timing = this.kit.timing;
    const turn = timing?.turn(this.state);
    if (!timing || !turn || this.ended || this.haltedReason) return;
    this.cancelFlag = this.clock.after(turn.left + 1, () => {
      this.cancelFlag = null;
      const timeout = timing.timeout(turn.left + 1);
      // 멘탈 포커(화투): 시간패로 판이 끝나거나 더미를 쓸 수 있어 카드를 여는 준비를 거친다.
      if (this.options.prepare) {
        this.enqueue(turn.seat, timeout, "clock");
        return;
      }
      const result = this.apply(turn.seat, timeout);
      if (result.ok) this.runBots();
    });
  }

  /** 대국을 만들 때 나온 사건(멘탈 포커 첫 섞기를 시작한다) */
  created: Event[] = [];

  static restore(
    saved: SavedMatch,
    extra: Pick<LocalMatchOptions, "bot" | "pace"> = {},
  ): LocalMatch {
    return new LocalMatch(
      {
        rules: saved.rules,
        seed: saved.seed,
        humanSeat: saved.humanSeat,
        ...extra,
        ...(saved.presetDeal ? { presetDeal: saved.presetDeal } : {}),
      },
      saved.log as LoggedAction[],
    );
  }

  current(): View {
    return this.viewFor(this.seat);
  }

  /** 그 자리 화면. 아직 보여 줄 수 없으면 마지막으로 보낸 화면 */
  viewFor(seat: number): View {
    const raw = this.kit.viewOf(this.state, seat);
    if (!this.options.revealView) return raw;
    const real = this.options.revealView(seat, raw);
    if (real) return real;
    return this.options.maskView
      ? this.options.maskView(seat, raw)
      : (this.shown.get(seat) ?? raw);
  }

  /** 엔진 상태(멘탈 포커 진행용) */
  rawState(): State {
    return this.state;
  }

  /** 엔진 상태를 고친다(행동 기록에는 남지 않는다. 멘탈 포커 증명 반영용) */
  patchState(fn: (state: State) => State): void {
    this.state = fn(this.state);
  }

  /** 미룬 화면을 다시 보내 보고 컴퓨터를 깨운다 */
  refresh(): void {
    for (const seat of [...this.held.keys()]) this.deliver(seat);
    this.runBots();
  }

  /** 부정이 드러나 더 진행하지 않는다 */
  halt(reason: string): void {
    this.haltedReason = reason;
  }

  /**
   * 게임을 중간에 끝낸다(`kit.retireAction`). 준비 중인 행동(멘탈 포커로 카드를 기다리는 것)을 기다리지 않는다.
   * 끊긴 사람을 더 기다리지 않기로 했을 때 쓴다
   */
  end(): SubmitResult {
    if (this.ended) return { ok: false, error: "이미 끝냈다" };
    const result = this.apply(this.seat, this.kit.retireAction);
    if (!result.ok) return result;
    this.ended = true;
    this.haltedReason = "게임을 끝냈다";
    for (const seat of [...this.held.keys()]) this.deliver(seat);
    return result;
  }

  get halted(): string | null {
    return this.haltedReason;
  }

  /** 화면 하나를 그 자리에 보낸다. 미룬 것이 있으면 뒤에 줄 세운다 */
  private hold(seat: number, snapshot: Snapshot<View, Event>): void {
    const queue = this.held.get(seat) ?? [];
    queue.push(snapshot);
    this.held.set(seat, queue);
    this.deliver(seat);
  }

  private deliver(seat: number): void {
    const queue = this.held.get(seat);
    if (!queue) return;
    while (queue.length > 0) {
      const next = queue[0] as Snapshot<View, Event>;
      let view = this.options.revealView
        ? this.options.revealView(seat, next.view)
        : next.view;
      if (view === null) {
        // 끝낸 게임은 더 열 카드가 없으므로 가린 채 보낸다.
        if (!this.ended) return;
        view = this.options.maskView?.(seat, next.view) ?? next.view;
      }
      queue.shift();
      this.shown.set(seat, view);
      const snapshot = { view, events: next.events };
      const set = this.listeners.get(seat);
      if (set && set.size > 0) for (const l of set) l(snapshot);
      else if (seat === this.seat) this.pending.push(snapshot);
    }
    this.held.delete(seat);
  }

  /** 지금까지 쌓인 진행을 넘겨 준다. 구독을 시작할 때 처음 한 번 부른다 */
  drain(): Snapshot<View, Event>[] {
    return this.pending.splice(0);
  }

  submit(action: ActionT): SubmitResult {
    return this.submitAs(this.seat, action);
  }

  /** 다른 사람 자리의 행동(온라인 대전에서 참가자가 보낸 것) */
  submitAs(seat: number, action: ActionT): SubmitResult {
    if (!this.humans.has(seat))
      return { ok: false, error: "사람 자리가 아니다" };
    if (this.haltedReason) return { ok: false, error: this.haltedReason };
    if (this.options.prepare) {
      // 앞 행동을 준비하는 동안 같은 자리의 행동은 받지 않는다(두 번 누르면 헛다리 뒤 두 번째 지목이 들어간다).
      if (this.preparing.has(seat))
        return { ok: false, error: "앞 행동을 처리하는 중입니다" };
      // 아직 보여 주지 못한 화면이 있으면(멘탈 포커로 섞고 나누는 중) 지난 화면을 보고 한 행동이다.
      if (this.held.has(seat))
        return { ok: false, error: "섞고 나누는 중입니다" };
      this.enqueue(seat, action, false);
      return { ok: true };
    }
    const result = this.apply(seat, action);
    if (!result.ok) return result;
    this.runBots();
    return { ok: true };
  }

  /** 준비가 필요한 행동을 차례로 처리한다 */
  private enqueue(seat: number, action: ActionT, who: boolean | "clock"): void {
    // 시간패(`clock`)는 사람 자리 행동도 컴퓨터 수도 아니다(기록에 bot 표시 없이 남긴다).
    const bot = who === true;
    const byClock = who === "clock";
    const prepare = this.options.prepare as NonNullable<
      LocalMatchOptions<Rules, State, View, ActionT, Event, Extra>["prepare"]
    >;
    const debug = (globalThis as { __FAIR_DEBUG?: boolean }).__FAIR_DEBUG
      ? (...a: unknown[]) => console.info("[fair]", ...a)
      : () => {};
    debug("줄 섬", seat, JSON.stringify(action));
    if (!bot && !byClock) this.preparing.add(seat);
    this.work = this.work.then(async () => {
      if (this.haltedReason) {
        if (!byClock) this.preparing.delete(seat);
        return;
      }
      debug("준비 시작", seat);
      const prepared = await prepare(this.state, seat, action);
      debug("준비 끝", seat, JSON.stringify(prepared).slice(0, 200));
      if (this.ended) {
        if (!byClock) this.preparing.delete(seat);
        return;
      }
      const result = prepared.ok
        ? this.apply(seat, prepared.action, bot)
        : prepared;
      debug("적용", seat, JSON.stringify(result).slice(0, 200));
      if (!bot && !byClock) this.preparing.delete(seat);
      if (bot) this.botBusy = false;
      if (!result.ok) {
        // 시간패가 늦게 처리돼 창이 이미 닫혔으면 그냥 버린다(그 자리 사람에게 거절을 보내지 않는다).
        if (byClock) return;
        this.options.onLateError?.(seat, result.error);
        // 컴퓨터 행동이 거절되면 같은 생각을 되풀이하지 않게 멈춘다(다음 `refresh`에 다시 생각한다).
        if (bot) return;
      }
      this.runBots();
    });
  }

  subscribe(listener: (snapshot: Snapshot<View, Event>) => void): () => void {
    return this.subscribeSeat(this.seat, listener);
  }

  /** 그 자리에서 보이는 정보로 스냅숏을 받는다 */
  subscribeSeat(
    seat: number,
    listener: (snapshot: Snapshot<View, Event>) => void,
  ): () => void {
    const set = this.listeners.get(seat) ?? new Set();
    set.add(listener);
    this.listeners.set(seat, set);
    return () => set.delete(listener);
  }

  /** 연결이 끊긴 사람 자리를 봇이 대신 두게 하거나(`true`) 다시 사람에게 돌려준다 */
  setStandIn(seat: number, standIn: boolean): void {
    if (standIn) this.standIns.add(seat);
    else this.standIns.delete(seat);
    this.runBots();
  }

  save(): SavedMatch<Rules, ActionT, Extra> {
    return {
      version: 1,
      rules: this.rules,
      seed: this.seed,
      humanSeat: this.seat,
      ...(this.presetDeal ? { presetDeal: this.presetDeal } : {}),
      log: [...this.log],
    };
  }

  /** 방장 새로고침에 대비해 남길 진행 */
  resumeState(): ResumeState<State, ActionT> {
    return { state: this.state, log: [...this.log], rng: this.rng.seed };
  }

  /** 판 끝 검증용 행동 기록 */
  actionLog(): KitLoggedAction<ActionT>[] {
    return [...this.log];
  }

  /** 상태 전체(JSON). 테스트와 디버깅용 */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  private apply(seat: number, raw: ActionT, bot = false): SubmitResult {
    // 개인 시간: 이 수에 쓴 시간을 싣는다(대국을 돌리는 이 기기가 잰다. 참가자가 보낸 값은 덮어쓴다).
    // 시간 규칙이 없는 판은 싣지 않아 예전 기록과 같다.
    const timing = this.kit.timing;
    const action = timing?.turn(this.state)
      ? timing.stamp(raw, this.clock.now() - this.turnSince)
      : raw;
    const result = this.stepper(this.state, seat, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.log.push(bot ? { seat, action, bot: true } : { seat, action });
    if (this.kit.timing) this.armClock();
    // 멘탈 포커는 이 걸음의 사건으로 섞기·나눠 주기를 이어 간다(화면을 보내기 전에).
    this.options.afterStep?.(this.state, result.events);
    const seats = new Set([...this.listeners.keys(), this.seat]);
    for (const listenerSeat of seats) {
      if (
        listenerSeat !== this.seat &&
        (this.listeners.get(listenerSeat)?.size ?? 0) === 0
      )
        continue;
      this.hold(listenerSeat, {
        view: this.kit.viewOf(this.state, listenerSeat),
        events: result.events,
      });
    }
    return { ok: true };
  }

  private isBot(seat: number): boolean {
    return !this.humans.has(seat) || this.standIns.has(seat);
  }

  /** 사람 차례가 올 때까지 봇을 돌린다. */
  private runBots(): void {
    if (this.pace) {
      this.scheduleBot();
      return;
    }
    for (let guard = 0; guard < 10_000; guard++) {
      if (!this.stepBot()) return;
    }
  }

  private scheduleBot(): void {
    if (this.botScheduled || !this.pace) return;
    this.botScheduled = true;
    this.pace(() => {
      this.botScheduled = false;
      if (this.stepBot()) this.scheduleBot();
    });
  }

  /** 봇 한 수. 둘 봇이 없으면 `false` */
  private stepBot(): boolean {
    if (this.haltedReason || this.botBusy) return false;
    const pending = this.options.pendingSeats
      ? this.options.pendingSeats(this.state)
      : this.kit.pendingSeats(this.state);
    const seat = pending.find((s) => this.isBot(s));
    if (seat === undefined) return false;
    const raw = this.kit.viewOf(this.state, seat);
    const view = this.options.revealView
      ? this.options.revealView(seat, raw)
      : raw;
    // 멘탈 포커: 아직 카드를 열지 못했으면 열 때까지 기다린다(`refresh`).
    if (view === null) return false;
    if (this.kit.botCanAct && !this.kit.botCanAct(view)) return false;
    const decided = this.bot.decide(view, this.rng);
    const action = this.kit.annotateBotAction
      ? this.kit.annotateBotAction(view, decided)
      : decided;
    if (this.options.prepare) {
      this.botBusy = true;
      this.enqueue(seat, action, true);
      return false;
    }
    const result = this.apply(seat, action, true);
    if (!result.ok)
      throw new Error(`봇(${seat})이 잘못된 행동을 했다: ${result.error}`);
    return true;
  }
}
