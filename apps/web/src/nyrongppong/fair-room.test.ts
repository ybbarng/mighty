// @vitest-environment node
import { describe, it } from "vitest";

import { playNyrongppongRoom } from "./fair-room-case";

describe("나이롱뽕 암호화방(멘탈 포커)", () => {
  // 판이 바뀌어도 이어 가는지(두 판)는 3명으로 본다. 4명(참가자 둘)은 fair-room-four.test.ts가 한 판으로 본다
  it("3명(참가자 하나, 컴퓨터 하나), 두 판: 끝까지 치고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판마다 검증을 통과한다", () =>
    playNyrongppongRoom(3, 1, 2));
});
