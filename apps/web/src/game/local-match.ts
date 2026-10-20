import { type Bot, heuristicBot } from "@mighty/ai";
import {
  type Action,
  type CreateMatchOptions,
  createMatch,
  createRng,
  decisionFor,
  type LoggedAction,
  type MatchState,
  type PresetDeal,
  type RngState,
  type RuleSet,
  replay,
  step,
  viewOf,
} from "@mighty/engine";

import type { MatchHost, Snapshot, SubmitResult } from "./host";

export interface LocalMatchOptions {
  rules: RuleSet;
  seed: number;
  /** 사람 자리. 나머지는 봇이 앉는다 */
  humanSeat?: number;
  bot?: Bot;
  presetDeal?: PresetDeal;
}

/** 브라우저에 남기는 저장 내용. 상태 대신 시작 조건과 행동 기록만 남기고 `replay`로 되살린다 */
export interface SavedMatch {
  version: 1;
  rules: RuleSet;
  seed: number;
  humanSeat: number;
  presetDeal?: PresetDeal;
  log: LoggedAction[];
}

/**
 * 브라우저 안에서 엔진과 봇을 돌린다. 서버가 없다.
 * 엔진 진행은 즉시 끝내고, 화면이 스냅숏을 받아 제 속도로 재생한다.
 */
export class LocalMatch implements MatchHost {
  readonly seat: number;
  private state: MatchState;
  private readonly createOptions: CreateMatchOptions;
  private readonly seed: number;
  private readonly bot: Bot;
  private readonly rng: RngState;
  private readonly log: LoggedAction[] = [];
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private readonly pending: Snapshot[] = [];

  constructor(options: LocalMatchOptions, savedLog?: readonly LoggedAction[]) {
    this.seat = options.humanSeat ?? 0;
    this.seed = options.seed;
    this.bot = options.bot ?? heuristicBot;
    this.rng = createRng(options.seed ^ 0x2545f491);
    this.createOptions = {
      rules: options.rules,
      seed: options.seed,
      ...(options.presetDeal ? { presetDeal: options.presetDeal } : {}),
    };

    if (savedLog && savedLog.length > 0) {
      const replayed = replay(this.createOptions, savedLog);
      if (!replayed.ok)
        throw new Error(`저장한 대국을 되살릴 수 없다: ${replayed.error}`);
      this.state = replayed.state;
      this.log.push(...savedLog);
    } else {
      const created = createMatch(this.createOptions);
      this.state = created.state;
      this.pending.push({
        view: viewOf(this.state, this.seat),
        events: created.events,
      });
    }
    this.runBots();
  }

  static restore(saved: SavedMatch): LocalMatch {
    return new LocalMatch(
      {
        rules: saved.rules,
        seed: saved.seed,
        humanSeat: saved.humanSeat,
        ...(saved.presetDeal ? { presetDeal: saved.presetDeal } : {}),
      },
      saved.log,
    );
  }

  current() {
    return viewOf(this.state, this.seat);
  }

  /** 지금까지 쌓인 진행을 넘겨 준다. 구독을 시작할 때 처음 한 번 부른다 */
  drain(): Snapshot[] {
    return this.pending.splice(0);
  }

  submit(action: Action): SubmitResult {
    const result = this.apply(this.seat, action);
    if (!result.ok) return result;
    this.runBots();
    return { ok: true };
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  save(): SavedMatch {
    return {
      version: 1,
      rules: this.createOptions.rules,
      seed: this.seed,
      humanSeat: this.seat,
      ...(this.createOptions.presetDeal
        ? { presetDeal: this.createOptions.presetDeal }
        : {}),
      log: [...this.log],
    };
  }

  /** 상태 전체(JSON). 테스트와 디버깅용 */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  private apply(seat: number, action: Action): SubmitResult {
    const result = step(this.state, seat, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.log.push({ seat, action });
    this.emit({ view: viewOf(this.state, this.seat), events: result.events });
    return { ok: true };
  }

  private emit(snapshot: Snapshot): void {
    if (this.listeners.size === 0) {
      this.pending.push(snapshot);
      return;
    }
    for (const listener of this.listeners) listener(snapshot);
  }

  /** 사람 차례가 올 때까지 봇을 돌린다. */
  private runBots(): void {
    for (let guard = 0; guard < 10_000; guard++) {
      const seat = this.nextBotSeat();
      if (seat === null) return;
      const action = this.bot.decide(viewOf(this.state, seat), this.rng);
      const result = this.apply(seat, action);
      if (!result.ok)
        throw new Error(`봇(${seat})이 잘못된 행동을 했다: ${result.error}`);
    }
  }

  private nextBotSeat(): number | null {
    const { round } = this.state;
    if (round.phase === "gameOver") return null;
    if (round.phase === "roundEnd") {
      return (
        this.state.order.find(
          (s) => s !== this.seat && decisionFor(this.state, s) !== null,
        ) ?? null
      );
    }
    return round.turn !== null && round.turn !== this.seat ? round.turn : null;
  }
}
