import { heuristicBot } from "@mighty/ai";
import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import type { Snapshot } from "./host";
import { LocalMatch } from "./local-match";

const rules = presetRules("standard5");

describe("LocalMatch", () => {
  it("사람 차례가 올 때까지 봇을 돌리고, 사람 차례에 멈춘다", () => {
    const match = new LocalMatch({ rules, seed: 11 });
    const view = match.current();
    expect(view.decision).not.toBeNull();
    expect(match.drain().length).toBeGreaterThan(0);
  });

  it("사람이 봇과 같은 수를 두면 판 끝까지 간다", () => {
    const match = new LocalMatch({ rules, seed: 12 });
    const snapshots: Snapshot[] = [...match.drain()];
    match.subscribe((s) => snapshots.push(s));
    for (let i = 0; i < 500; i++) {
      const view = match.current();
      if (view.phase === "roundEnd" && view.decision === null) break;
      if (view.decision === null) break;
      const result = match.submit(heuristicBot.decide(view, { seed: i }));
      expect(result).toEqual({ ok: true });
      if (snapshots.some((s) => s.events.some((e) => e.type === "roundScored")))
        break;
    }
    expect(
      snapshots.some((s) => s.events.some((e) => e.type === "roundScored")),
    ).toBe(true);
  });

  it("pace를 주면 봇이 한 수씩 나눠 두고, 다 두면 미루지 않을 때와 같은 곳에 이른다", () => {
    const later: (() => void)[] = [];
    const paced = new LocalMatch({
      rules,
      seed: 21,
      humanSeat: 2,
      pace: (next) => later.push(next),
    });
    // 판을 만든 장면 하나뿐이고 아직 아무 봇도 두지 않았다.
    expect(paced.drain()).toHaveLength(1);
    let steps = 0;
    while (later.length > 0) {
      (later.shift() as () => void)();
      steps++;
      // 한 번 미룰 때마다 봇 한 수만 둔다.
      expect(paced.drain().length).toBeLessThanOrEqual(1);
    }
    expect(steps).toBeGreaterThan(1);
    const direct = new LocalMatch({ rules, seed: 21, humanSeat: 2 });
    expect(paced.serialize()).toBe(direct.serialize());
  });

  it("저장한 기록으로 같은 대국을 되살린다", () => {
    const match = new LocalMatch({ rules, seed: 14 });
    for (let i = 0; i < 30; i++) {
      const view = match.current();
      if (view.decision === null) break;
      match.submit(heuristicBot.decide(view, { seed: i }));
    }
    const saved = JSON.parse(JSON.stringify(match.save()));
    const restored = LocalMatch.restore(saved);
    expect(restored.serialize()).toBe(match.serialize());
    expect(restored.current()).toEqual(match.current());
  });

  it("잘못된 행동은 거절하고 상태를 바꾸지 않는다", () => {
    const match = new LocalMatch({ rules, seed: 13 });
    const before = match.serialize();
    const result = match.submit({ type: "play", card: "SA" });
    expect(result.ok).toBe(false);
    expect(match.serialize()).toBe(before);
  });
});
