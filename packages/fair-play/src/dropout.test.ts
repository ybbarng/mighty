import { describe, expect, it } from "vitest";

import { DropoutPolicy } from "./dropout";

describe("나간 사람 처리", () => {
  it("정한 시간 안에 돌아오면 이어서 한다", () => {
    const policy = new DropoutPolicy([0, 1, 2, 3, 4], 0, 1000);
    policy.disconnected(3, 0);
    policy.tick(500);
    policy.reconnected(3);
    expect(policy.state.kind).toBe("playing");
  });

  it("안 돌아오면 투표를 열고, 남은 사람 과반이 끝내기를 고르면 판을 무효로 한다", () => {
    const policy = new DropoutPolicy([0, 1, 2, 3, 4], 0, 1000);
    policy.disconnected(3, 0);
    policy.tick(1000);
    expect(policy.state.kind).toBe("voting");
    policy.vote(1, "abort");
    policy.vote(2, "wait");
    expect(policy.state.kind).toBe("voting");
    policy.vote(4, "abort");
    policy.vote(2, "abort");
    expect(policy.state.kind).toBe("aborted");
  });

  it("방장은 혼자서도 끝내기를 정할 수 있다", () => {
    const policy = new DropoutPolicy([0, 1, 2, 3, 4], 0, 1000);
    policy.disconnected(2, 0);
    policy.tick(2000);
    policy.vote(0, "abort");
    expect(policy.state.kind).toBe("aborted");
  });
});
