import { presetRules } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { RenegeWatch } from "./renege";

const rules = presetRules("standard5");
const plain = { jokerSuit: null, jokerCalled: false };

describe("무늬 안 따르기 즉시 잡기", () => {
  it("♥가 선인데 ♣를 냈던 사람이 나중에 ♥를 내면 그 순간 잡힌다", () => {
    const watch = new RenegeWatch(rules, "S");
    // 1턴: 0번 ♥5 선, 1번 ♣3(♥가 없다고 주장)
    expect(watch.reveal(1, 0, "H5", plain)).toBeNull();
    expect(watch.reveal(1, 1, "C3", plain)).toBeNull();
    // 2턴: 1번이 ♥9를 낸다 → 1턴에 ♥9가 손에 있었다
    expect(watch.reveal(2, 2, "D2", plain)).toBeNull();
    const v = watch.reveal(2, 1, "H9", plain);
    expect(v).toMatchObject({
      seat: 1,
      trickIndex: 1,
      played: "C3",
      heldCard: "H9",
    });
  });

  it("마이티와 조커는 무늬와 상관없이 낼 수 있어서 위반이 아니다", () => {
    const watch = new RenegeWatch(rules, "H");
    expect(watch.reveal(1, 0, "D5", plain)).toBeNull();
    expect(watch.reveal(1, 1, "SA", plain)).toBeNull(); // 마이티
    expect(watch.reveal(2, 1, "D9", plain)).toBeNull();
  });

  it("조커콜에 조커를 안 낸 사람이 나중에 조커를 내면 잡힌다", () => {
    const watch = new RenegeWatch(rules, "H");
    const called = { jokerSuit: null, jokerCalled: true };
    expect(watch.reveal(3, 0, "C3", called)).toBeNull(); // 조커콜
    expect(watch.reveal(3, 1, "C7", called)).toBeNull(); // 조커를 안 냄
    const v = watch.reveal(5, 1, "JK", plain);
    expect(v).toMatchObject({ seat: 1, trickIndex: 3, heldCard: "JK" });
  });

  it("같은 카드가 두 번 나오면 섞기 조작으로 잡는다", () => {
    const watch = new RenegeWatch(rules, "S");
    expect(watch.reveal(1, 0, "HA", plain)).toBeNull();
    expect(watch.reveal(2, 3, "HA", plain)).toMatchObject({ seat: 3 });
  });

  it("정직하게 무늬가 떨어진 사람은 잡히지 않는다", () => {
    const watch = new RenegeWatch(rules, "S");
    expect(watch.reveal(1, 0, "H5", plain)).toBeNull();
    expect(watch.reveal(1, 1, "C3", plain)).toBeNull();
    expect(watch.reveal(2, 1, "D9", plain)).toBeNull();
    expect(watch.reveal(3, 1, "C4", plain)).toBeNull();
  });
});
