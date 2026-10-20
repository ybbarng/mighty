import { describe, expect, it } from "vitest";

import { decisionFor } from "./decision";
import { createMatch, step } from "./match";
import { presetRules } from "./presets";
import { type LoggedAction, replay, sameState } from "./replay";
import { createRng } from "./rng";
import type { MatchState } from "./state";
import { actingSeat, randomAction } from "./test-utils";

const rules = presetRules("standard5");

/** 무작위로 `rounds`판을 두고 최종 상태와 행동 기록을 돌려준다 */
function playAndLog(
  seed: number,
  rounds: number,
): { state: MatchState; log: LoggedAction[] } {
  const rng = createRng(seed + 1);
  let { state } = createMatch({ rules, seed });
  const log: LoggedAction[] = [];
  let scored = 0;
  while (scored < rounds) {
    const seat = actingSeat(state);
    if (seat === null) break;
    const decision = decisionFor(state, seat);
    if (decision === null) break;
    const action = randomAction(state, seat, decision, rng);
    const result = step(state, seat, action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    log.push({ seat, action });
    if (result.events.some((e) => e.type === "roundScored")) scored++;
  }
  return { state, log };
}

describe("replay", () => {
  it("시드와 행동 기록만으로 같은 상태를 되살린다", () => {
    for (const seed of [1, 2, 3]) {
      const { state, log } = playAndLog(seed, 2);
      const replayed = replay({ rules, seed }, log);
      expect(replayed.ok).toBe(true);
      if (replayed.ok) expect(sameState(replayed.state, state)).toBe(true);
    }
  });

  it("시드가 다르면 같은 기록이 맞지 않는다 (조작한 덱을 잡아낸다)", () => {
    const { log } = playAndLog(7, 1);
    const tampered = replay({ rules, seed: 8 }, log);
    expect(tampered.ok).toBe(false);
  });

  it("기록 중간을 바꾸면 그 지점이나 결과에서 어긋난다", () => {
    const { state, log } = playAndLog(9, 1);
    const index = log.findIndex((e) => e.action.type === "bid");
    const entry = log[index];
    if (!entry || entry.action.type !== "bid")
      throw new Error("공약 기록이 없다");
    const changed = [...log];
    changed[index] = { ...entry, action: { type: "pass" } };
    const result = replay({ rules, seed: 9 }, changed);
    expect(!result.ok || !sameState(result.state, state)).toBe(true);
  });
});
