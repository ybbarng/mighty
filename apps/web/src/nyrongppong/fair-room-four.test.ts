// @vitest-environment node
import { describe, it } from "vitest";

import { playNyrongppongRoom } from "./fair-room-case";

describe("나이롱뽕 암호화방(멘탈 포커)", () => {
  // 참가자가 둘인 4명 방은 한 판으로 본다(판 잇기는 fair-room.test.ts의 3명 두 판이 본다)
  it("4명(참가자 둘, 컴퓨터 하나), 한 판: 끝까지 치고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판마다 검증을 통과한다", () =>
    playNyrongppongRoom(4, 2, 1));
});
