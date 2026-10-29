// @vitest-environment node
import {
  createMatch,
  type GameEvent,
  type PlayerView,
  presetRules,
  type ScoreResult,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { mightyResultBanner } from "./result-banner";

const rules = presetRules("standard5");
const base = viewOf(createMatch({ rules, seed: 1 }).state, 0);

function scored(result: Partial<ScoreResult>): GameEvent {
  return {
    type: "roundScored",
    result: {
      rulingWon: true,
      rulingPoints: 14,
      oppositionPoints: 6,
      base: 0,
      staticRun: false,
      multipliers: [],
      moved: 0,
      money: [],
      ...result,
    },
  };
}

/** 0번 자리(나)가 주공이나 야당인 판 끝 장면. 돈은 판 시작 1000에서 `money`로 바뀌었다 */
function scene(declarer: number, money: number): PlayerView {
  return {
    ...base,
    declarer,
    friend: 1,
    money: [money, 1000, 1000, 1000, 1000],
  };
}
const start = [1000, 1000, 1000, 1000, 1000];

describe("판 끝 승패 문구", () => {
  it("점수가 난 장면에서만 띄운다", () => {
    expect(mightyResultBanner(scene(0, 1000), [], start)).toBeNull();
  });

  it("내 편이 이기면 승리, 지면 패배. 돈 변화는 결과 상자처럼 10배로", () => {
    expect(
      mightyResultBanner(scene(0, 1004), [scored({ rulingWon: true })], start),
    ).toEqual({ won: true, detail: "+40" });
    // 나는 야당인데 여당이 이겼다
    expect(
      mightyResultBanner(scene(2, 999), [scored({ rulingWon: true })], start),
    ).toEqual({ won: false, detail: "-10" });
  });

  it("런과 백런을 함께 적는다", () => {
    expect(
      mightyResultBanner(
        scene(0, 1016),
        [scored({ rulingWon: true, multipliers: ["run"] })],
        start,
      ),
    ).toEqual({ won: true, detail: "런! · +160" });
    expect(
      mightyResultBanner(
        scene(3, 1004),
        [scored({ rulingWon: false, multipliers: ["reverseRun"] })],
        start,
      ),
    ).toEqual({ won: true, detail: "백런! · +40" });
  });
});
