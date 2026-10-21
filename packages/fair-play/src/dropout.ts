/*
 * 누가 나가면: 멘탈 포커에서는 그 사람 열쇠가 없으면 그 사람 카드를 아무도 열 수 없다.
 * 1. 열쇠는 각자 브라우저(sessionStorage)에 남겨 두므로 새로고침·잠깐 끊김은 다시 이어 간다(Party.snapshot).
 * 2. 정한 시간 동안 안 돌아오면 남은 사람이 투표한다: 더 기다리기 / 이 판 무효로 끝내기.
 *    남은 사람의 과반이 끝내기를 고르거나, 방장이 끝내기를 고르면 판을 무효로 한다(점수 없음).
 * 3. 무효로 끝낸 판도 남은 사람끼리 지금까지 공개된 것은 검증할 수 있다(무늬 안 따르기 감시 결과).
 */

export type DropoutState =
  | { kind: "playing" }
  | { kind: "waiting"; seat: number; since: number }
  | { kind: "voting"; seat: number; votes: Map<number, "wait" | "abort"> }
  | { kind: "aborted"; reason: string };

export class DropoutPolicy {
  state: DropoutState = { kind: "playing" };

  constructor(
    private readonly seats: readonly number[],
    private readonly host: number,
    /** 재연결을 기다리는 시간(ms) */
    private readonly waitMs = 60_000,
  ) {}

  disconnected(seat: number, now: number): void {
    if (this.state.kind === "playing")
      this.state = { kind: "waiting", seat, since: now };
  }

  reconnected(seat: number): void {
    if (
      (this.state.kind === "waiting" || this.state.kind === "voting") &&
      this.state.seat === seat
    )
      this.state = { kind: "playing" };
  }

  /** 시간이 지나면 투표를 연다 */
  tick(now: number): void {
    if (this.state.kind === "waiting" && now - this.state.since >= this.waitMs)
      this.state = { kind: "voting", seat: this.state.seat, votes: new Map() };
  }

  /** 남은 사람의 표. 방장이 끝내기를 고르거나 과반이 끝내기면 무효 */
  vote(seat: number, choice: "wait" | "abort"): void {
    if (this.state.kind !== "voting" || seat === this.state.seat) return;
    this.state.votes.set(seat, choice);
    const voters = this.seats.filter(
      (s) => s !== (this.state as { seat: number }).seat,
    );
    const aborts = [...this.state.votes.values()].filter(
      (v) => v === "abort",
    ).length;
    if (
      (seat === this.host && choice === "abort") ||
      aborts * 2 > voters.length
    )
      this.state = {
        kind: "aborted",
        reason: `${this.state.seat}번이 돌아오지 않아 이 판을 무효로 했다`,
      };
  }
}
