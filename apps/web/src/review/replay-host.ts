import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import type { GameKit } from "@/game/kit";

import type { Replayed } from "./replay";

/**
 * 다시 보기: 남긴 기록을 다시 돌린 상태들을 게임 화면에 한 걸음씩 흘려보낸다.
 * 게임 화면(GameTable·HeartsTable)은 평소처럼 사건을 받아 카드를 움직인다. 결정할 것은 지운다(누를 수 없다)
 */
export class ReplayHost<Rules, State, View, Action, Event, Extra>
  implements MatchHost<View, Action, Event>
{
  private readonly listeners = new Set<
    (snapshot: Snapshot<View, Event>) => void
  >();

  constructor(
    private readonly kit: GameKit<Rules, State, View, Action, Event, Extra>,
    private readonly replayed: Replayed<State, Event>,
    readonly seat: number,
    /** 지금 보이는 걸음(0이면 대국을 만든 때) */
    public index: number,
  ) {}

  get last(): number {
    return this.replayed.states.length - 1;
  }

  current(): View {
    const view = this.kit.viewOf(
      this.replayed.states[this.index] as State,
      this.seat,
    );
    return { ...view, decision: null } as View;
  }

  submit(): SubmitResult {
    return { ok: false, error: "다시 보기 중입니다" };
  }

  subscribe(listener: (snapshot: Snapshot<View, Event>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  drain(): Snapshot<View, Event>[] {
    return [];
  }

  /** 한 걸음 앞으로(그 걸음의 사건과 함께 화면에 보낸다). 끝이면 false */
  forward(): boolean {
    if (this.index >= this.last) return false;
    this.index++;
    const snapshot = {
      view: this.current(),
      events: this.replayed.events[this.index] ?? [],
    };
    for (const l of this.listeners) l(snapshot);
    return true;
  }
}
