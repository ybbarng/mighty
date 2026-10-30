import { describe, expect, it } from "vitest";

import { drawGlows } from "./hdr-glow";

describe("HDR 별빛을 겹칠 별", () => {
  const fixed = [3, 9, 14, 22, 30, 41, 7];

  it("연출 중에는 켜진 별마다 한 번 번쩍이고, 맞은 별은 결과가 나온 뒤에만 빛난다", () => {
    expect(
      drawGlows({ fixed: [3, 9], mine: [3], done: false, animated: true }),
    ).toEqual([
      { n: 3, kind: "flash" },
      { n: 9, kind: "flash" },
    ]);
    const end = drawGlows({
      fixed,
      mine: [3, 7, 44],
      done: true,
      animated: true,
    });
    expect(end.filter((g) => g.kind === "hit").map((g) => g.n)).toEqual([3, 7]);
  });

  it("바로 보기·움직임 줄이기는 번쩍임 없이 맞은 별(보너스 포함)만", () => {
    expect(
      drawGlows({ fixed, mine: [7, 22, 45], done: true, animated: false }),
    ).toEqual([
      { n: 22, kind: "hit" },
      { n: 7, kind: "hit" },
    ]);
  });

  it("응모하지 않았거나 맞은 별이 없으면 결과에 HDR 빛이 없다", () => {
    expect(drawGlows({ fixed, mine: [], done: true, animated: false })).toEqual(
      [],
    );
    expect(
      drawGlows({ fixed, mine: [1, 2], done: true, animated: false }),
    ).toEqual([]);
  });
});
