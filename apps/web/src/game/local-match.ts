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

import type { MatchHost, Snapshot, SubmitResult } from "./host";
import type { GameKit, KitBot, KitLoggedAction } from "./kit";
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
      this.pending.push({
        view: this.kit.viewOf(this.state, this.seat),
        events: created.events,
      });
    }
    this.runBots();
  }

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
    return this.kit.viewOf(this.state, this.seat);
  }

  viewFor(seat: number): View {
    return this.kit.viewOf(this.state, seat);
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
    const result = this.apply(seat, action);
    if (!result.ok) return result;
    this.runBots();
    return { ok: true };
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

  /** 판 끝 검증용 행동 기록 */
  actionLog(): KitLoggedAction<ActionT>[] {
    return [...this.log];
  }

  /** 상태 전체(JSON). 테스트와 디버깅용 */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  private apply(seat: number, action: ActionT, bot = false): SubmitResult {
    const result = this.kit.step(this.state, seat, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.log.push(bot ? { seat, action, bot: true } : { seat, action });
    for (const [listenerSeat, set] of this.listeners) {
      if (set.size === 0) continue;
      const snapshot = {
        view: this.kit.viewOf(this.state, listenerSeat),
        events: result.events,
      };
      for (const listener of set) listener(snapshot);
    }
    if ((this.listeners.get(this.seat)?.size ?? 0) === 0) {
      this.pending.push({
        view: this.kit.viewOf(this.state, this.seat),
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
    const seat = this.kit.pendingSeats(this.state).find((s) => this.isBot(s));
    if (seat === undefined) return false;
    const view = this.kit.viewOf(this.state, seat);
    if (this.kit.botCanAct && !this.kit.botCanAct(view)) return false;
    const decided = this.bot.decide(view, this.rng);
    const action = this.kit.annotateBotAction
      ? this.kit.annotateBotAction(view, decided)
      : decided;
    const result = this.apply(seat, action, true);
    if (!result.ok)
      throw new Error(`봇(${seat})이 잘못된 행동을 했다: ${result.error}`);
    return true;
  }
}
