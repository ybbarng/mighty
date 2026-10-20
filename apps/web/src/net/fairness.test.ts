import { describe, expect, it } from "vitest";

import { commit, deriveSeed, newSecret } from "./fairness";

describe("공정한 섞기", () => {
  it("모두가 정직하면 같은 시드가 나온다", async () => {
    const secrets = [newSecret(), newSecret(), newSecret()];
    const commitments = await Promise.all(
      secrets.map(async (s, seat) => ({ seat, hash: await commit(s) })),
    );
    const reveals = secrets.map((secret, seat) => ({ seat, secret }));
    const a = await deriveSeed(commitments, reveals);
    const b = await deriveSeed(commitments, [...reveals].reverse());
    expect(a.ok && b.ok && a.seed === b.seed).toBe(true);
  });

  it("약속과 다른 값을 내면 잡아낸다 (방장이 시드를 바꿔치기하려는 경우)", async () => {
    const secrets = [newSecret(), newSecret()];
    const commitments = await Promise.all(
      secrets.map(async (s, seat) => ({ seat, hash: await commit(s) })),
    );
    const tampered = [
      { seat: 0, secret: "원하는 덱이 나오도록 고른 값" },
      { seat: 1, secret: secrets[1] as string },
    ];
    const result = await deriveSeed(commitments, tampered);
    expect(result).toEqual({
      ok: false,
      reason: "0번 자리의 값이 약속과 다르다",
    });
  });

  it("공개하지 않은 자리가 있으면 시드를 만들지 않는다", async () => {
    const commitments = [
      { seat: 0, hash: await commit("a") },
      { seat: 1, hash: await commit("b") },
    ];
    const result = await deriveSeed(commitments, [{ seat: 0, secret: "a" }]);
    expect(result.ok).toBe(false);
  });

  it("한 사람의 값만 바뀌어도 시드가 달라진다", async () => {
    const make = async (secrets: string[]) =>
      deriveSeed(
        await Promise.all(
          secrets.map(async (s, seat) => ({ seat, hash: await commit(s) })),
        ),
        secrets.map((secret, seat) => ({ seat, secret })),
      );
    const a = await make(["x", "y", "z"]);
    const b = await make(["x", "y", "w"]);
    expect(a.ok && b.ok && a.seed !== b.seed).toBe(true);
  });
});
