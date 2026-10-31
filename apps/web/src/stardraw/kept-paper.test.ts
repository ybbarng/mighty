import { beforeEach, describe, expect, it } from "vitest";
import { clearKept, loadKept, saveKept } from "./kept-paper";

beforeEach(() => localStorage.clear());

describe("보관한 용지", () => {
  const paper = {
    ledger: "L1",
    round: 3,
    numbers: [1, 7, 14, 29, 38, 42],
    qual: true,
  };

  it("한 장을 두고, 같은 장부에서만 꺼내며, 버리면 사라진다", () => {
    expect(loadKept("sd", "L1")).toBeNull();
    saveKept("sd", paper);
    expect(loadKept("sd", "L1")).toEqual(paper);
    expect(loadKept("sd", "L2")).toBeNull();
    saveKept("sd", { ...paper, round: 4 });
    expect(loadKept("sd", "L1")?.round).toBe(4);
    clearKept("sd");
    expect(loadKept("sd", "L1")).toBeNull();
  });

  it("깨진 값은 없는 것으로 본다", () => {
    localStorage.setItem("sd-kept-paper", "{");
    expect(loadKept("sd", "L1")).toBeNull();
    localStorage.setItem(
      "sd-kept-paper",
      JSON.stringify({ ...paper, numbers: [1] }),
    );
    expect(loadKept("sd", "L1")).toBeNull();
  });
});
