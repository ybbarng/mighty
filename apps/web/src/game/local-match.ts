import { type Bot, heuristicBot } from "@mighty/ai";
import {
  type Action,
  createMatch,
  createRng,
  decisionFor,
  type MatchState,
  type PresetDeal,
  type RngState,
  type RuleSet,
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

/**
 * 브라우저 안에서 엔진과 봇을 돌린다. 서버가 없다.
 * 엔진 진행은 즉시 끝내고, 화면이 스냅숏을 받아 제 속도로 재생한다.
 */
export class LocalMatch implements MatchHost {
  readonly seat: number;
  private state: MatchState;
  private readonly bot: Bot;
  private readonly rng: RngState;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private readonly pending: Snapshot[] = [];

  constructor(options: LocalMatchOptions) {
    this.seat = options.humanSeat ?? 0;
    this.bot = options.bot ?? heuristicBot;
    this.rng = createRng(options.seed ^ 0x2545f491);
    const created = createMatch({
      rules: options.rules,
      seed: options.seed,
      ...(options.presetDeal ? { presetDeal: options.presetDeal } : {}),
    });
    this.state = created.state;
    this.pending.push({
      view: viewOf(this.state, this.seat),
      events: created.events,
    });
    this.runBots();
  }

  current() {
    return viewOf(this.state, this.seat);
  }

  /** 지금까지 쌓인 진행을 넘겨 준다. 구독을 시작할 때 처음 한 번 부른다 */
  drain(): Snapshot[] {
    return this.pending.splice(0);
  }

  submit(action: Action): SubmitResult {
    const result = step(this.state, this.seat, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.emit({ view: viewOf(this.state, this.seat), events: result.events });
    this.runBots();
    return { ok: true };
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 저장·이어하기용. 상태는 JSON이다 */
  serialize(): string {
    return JSON.stringify(this.state);
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
      const result = step(this.state, seat, action);
      if (!result.ok)
        throw new Error(`봇(${seat})이 잘못된 행동을 했다: ${result.error}`);
      this.state = result.state;
      this.emit({ view: viewOf(this.state, this.seat), events: result.events });
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
