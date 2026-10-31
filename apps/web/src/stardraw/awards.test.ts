import {
  drandRoundForClose,
  emptyWinners,
  type RoundRecord,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  type Ticket,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  ASLEEP_DRAWS,
  AWARDS,
  type AwardInput,
  type EarnedAward,
  earnedAwards,
  formOf,
} from "./awards";

/** 2026-11-01 0시(한국 시각). n회차 추첨은 이 시각 + n시간(n이 24면 다음 날 0시) */
const MIDNIGHT = Date.UTC(2026, 9, 31, 15, 0) / 1000;
const LIVE_FROM = 2000;

function entry(fromRound: number, phase: "trial" | "live"): ScheduleEntry {
  return {
    fromRound,
    length: 3600,
    closeMargin: 300,
    powTarget: 0,
    registerPowTarget: 0,
    phase,
  } as ScheduleEntry;
}
const schedule: Schedule = {
  epoch: MIDNIGHT - 300,
  entries: [entry(1, "trial"), entry(LIVE_FROM, "live")],
};

const ME = new Uint8Array([1]);
const pubOf = (i: number) => new Uint8Array([2, i]);

interface RoundSpec {
  round: number;
  /** 당첨 번호(없으면 무효 회차) */
  win?: number[];
  bonus?: number;
  mine?: number[][];
  others?: number[][];
}

const LOSE = [1, 2, 3, 4, 5, 6];
const FAR = [40, 41, 42, 43, 44, 45];

function ticket(round: number, numbers: number[], pub: Uint8Array): Ticket {
  return { v: 1, round, numbers, pub, nonce: 0 } as unknown as Ticket;
}

function world(
  specs: RoundSpec[],
  extra: Partial<AwardInput> = {},
): AwardInput {
  const records: RoundRecord[] = [];
  const tickets = new Map<number, Ticket[]>();
  for (const s of specs) {
    const list = [
      ...(s.mine ?? []).map((n) => ticket(s.round, n, ME)),
      ...(s.others ?? []).map((n, i) => ticket(s.round, n, pubOf(i))),
    ];
    tickets.set(s.round, list);
    const closesAt = roundTimes(schedule, s.round).closesAt;
    records.push({
      v: 1,
      round: s.round,
      prev: new Uint8Array(32),
      count: list.length,
      merkleRoot: new Uint8Array(32),
      registrationCount: 0,
      registrationRoot: new Uint8Array(32),
      rootLoggedAt: 0,
      void: !s.win,
      drandRound: s.win ? drandRoundForClose(closesAt) : 0,
      drandSignature: new Uint8Array(s.win ? 48 : 0),
      numbers: s.win ?? [],
      bonus: s.win ? (s.bonus ?? 45) : 0,
      winners: emptyWinners(),
      scheduleChanges: [],
      nicknames: [],
    });
  }
  return {
    schedule,
    records,
    tickets,
    myPubs: [ME],
    registeredRound: null,
    now: MIDNIGHT + 400 * 86400,
    ...extra,
  };
}

/** from회차부터 count개, 낙첨하는 내 응모(당첨 번호는 FAR) */
function plain(from: number, count: number, mine = LOSE): RoundSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    round: from + i,
    win: FAR,
    bonus: 39,
    mine: [mine],
  }));
}

const find = (list: EarnedAward[], id: string, step: number | null = null) =>
  list.find((a) => a.id === id && a.step === step);
const drawAt = (round: number) => roundTimes(schedule, round).closesAt + 300;

describe("기념 서류", () => {
  it("응모 횟수: 조건을 처음 채운 회차와 그 추첨 시각이 날짜가 된다", () => {
    const got = earnedAwards(world(plain(101, 10)));
    const a = find(got, "entries", 10);
    expect(a).toMatchObject({ round: 110, kind: "감사장", form: "paper" });
    expect(Math.abs((a?.at ?? 0) - drawAt(110))).toBeLessThan(3);
    expect(
      earnedAwards(world(plain(101, 9))).some((x) => x.id === "entries"),
    ).toBe(false);
  });

  it("연속 응모: 빠진 회차에서 끊기고, 무효 회차도 응모했으면 이어진다", () => {
    const specs = [...plain(1, 11), ...plain(13, 11)];
    expect(find(earnedAwards(world(specs)), "streak", 12)).toBeUndefined();
    const withVoid = [
      ...plain(1, 6),
      { round: 7, mine: [LOSE] },
      ...plain(8, 5),
    ];
    expect(find(earnedAwards(world(withVoid)), "streak", 12)?.round).toBe(12);
  });

  it("연속 낙첨: 무효 회차는 끊지도 세지도 않고, 당첨이 끼면 처음부터", () => {
    const specs = [
      ...plain(1, 30),
      { round: 31, mine: [LOSE] },
      ...plain(32, 20),
    ];
    const a = find(earnedAwards(world(specs)), "lose-streak", 50);
    expect(a).toMatchObject({ round: 51, kind: "위로장" });
    const broken = [
      ...plain(1, 30),
      { round: 31, win: [1, 2, 3, 30, 31, 32], bonus: 39, mine: [LOSE] },
      ...plain(32, 30),
    ];
    expect(
      find(earnedAwards(world(broken)), "lose-streak", 50),
    ).toBeUndefined();
  });

  it("추첨을 열어 보지 않은 회차의 결과로 생긴 서류는 숨기고, 응모만으로 생긴 서류는 보인다", () => {
    const specs: RoundSpec[] = [
      { round: 5, win: FAR, bonus: 1, mine: [[1, 2, 3, 4, 5, 6]] },
    ];
    const open = earnedAwards(world(specs));
    expect(find(open, "bonus-only")).toBeDefined();
    expect(find(open, "brightest-six")).toBeDefined();
    const sealed = earnedAwards(world(specs, { sealed: (r) => r === 5 }));
    expect(find(sealed, "bonus-only")).toBeUndefined();
    expect(find(sealed, "brightest-six")).toBeDefined();
  });

  it("번호 모양과 별", () => {
    const got = earnedAwards(
      world([
        { round: 1, win: FAR, mine: [[1, 3, 5, 7, 9, 11]] },
        { round: 2, win: FAR, mine: [[2, 3, 5, 7, 11, 13]] },
        { round: 3, win: FAR, mine: [[5, 7, 18, 20, 37, 40]] },
        { round: 4, win: FAR, mine: [[3, 4, 7, 22, 32, 43]] },
        { round: 5, win: FAR, mine: [[5, 9, 13, 17, 21, 25]] },
      ]),
    );
    expect(find(got, "all-odd")?.round).toBe(1);
    expect(find(got, "primes")?.round).toBe(2);
    expect(find(got, "one-constellation")?.text).toContain("오리온자리");
    expect(find(got, "five-colors")?.round).toBe(4);
    expect(find(got, "arithmetic")?.text).toContain("2씩");
    expect(find(got, "months")?.round).toBe(1);
    expect(find(got, "all-even")).toBeUndefined();
  });

  it("함께: 같은 번호의 다른 우주인, 홀로 관측, 그때까지 가장 붐빈 회차", () => {
    const crowd = Array.from({ length: 11 }, (_, i) => [1, 2, 3, 4, 5, 7 + i]);
    const got = earnedAwards(
      world([
        { round: 1, win: FAR, mine: [LOSE] },
        {
          round: 2,
          win: FAR,
          mine: [[8, 9, 10, 11, 12, 13]],
          others: [[8, 9, 10, 11, 12, 13]],
        },
        { round: 3, win: FAR, mine: [LOSE], others: crowd },
      ]),
    );
    expect(find(got, "alone")?.round).toBe(1);
    expect(find(got, "twin")?.round).toBe(2);
    expect(find(got, "busiest")?.text).toContain("12장");
  });

  it("훈장은 1·2등 회차마다, 우주국장 특별상은 1~3등을 모두 받았을 때", () => {
    const first = [30, 31, 32, 33, 34, 35];
    const got = earnedAwards(
      world([
        { round: 1, win: first, bonus: 36, mine: [first] },
        { round: 2, win: first, bonus: 36, mine: [[30, 31, 32, 33, 34, 36]] },
        { round: 3, win: first, bonus: 36, mine: [[30, 31, 32, 33, 34, 1]] },
        { round: 4, win: first, bonus: 36, mine: [first] },
      ]),
    );
    const gold = got.filter((a) => a.id === "medal-gold");
    expect(gold.map((a) => a.round)).toEqual([1, 4]);
    expect(gold[0]?.form).toBe("medal");
    expect(find(got, "medal-silver")?.round).toBe(2);
    expect(find(got, "one-short")?.round).toBe(2);
    expect(find(got, "director-prize")?.round).toBe(3);
  });

  it("잠든 별: 직전 추첨 내내 나오지 않던 내 별이 당첨 번호로", () => {
    const quiet = plain(1, ASLEEP_DRAWS);
    const wake = {
      round: ASLEEP_DRAWS + 1,
      win: [10, 40, 41, 42, 43, 44],
      bonus: 39,
      mine: [[10, 11, 12, 13, 14, 15]],
    };
    expect(
      find(earnedAwards(world([...quiet, wake])), "woke-star")?.text,
    ).toContain("안타레스");
    expect(
      find(earnedAwards(world([...quiet.slice(1), wake])), "woke-star"),
    ).toBeUndefined();
  });

  it("근속: 등록 날짜에서 n년 뒤 0시, 지금이 그 전이면 아직 없다", () => {
    const base = world(plain(1, 1), { registeredRound: 1 });
    const year = Date.UTC(2027, 10, 1) / 1000 - 9 * 3600;
    expect(
      find(earnedAwards({ ...base, now: year - 1 }), "anniversary", 1),
    ).toBeUndefined();
    const a = find(earnedAwards({ ...base, now: year }), "anniversary", 1);
    expect(a).toMatchObject({ at: year, round: null, kind: "근속상" });
    const five = find(
      earnedAwards({ ...base, now: year + 5 * 366 * 86400 }),
      "anniversary",
      5,
    );
    expect(five?.form).toBe("plaque");
  });

  it("시간과 우주국 행사", () => {
    // n회차 추첨은 n시. 3·4시 회차를 다섯 날 = 10회
    const night = [0, 1, 2, 3, 4].flatMap((d) =>
      [3, 4].map((h) => ({ round: d * 24 + h, win: FAR, mine: [LOSE] })),
    );
    const got = earnedAwards(
      world([
        ...night,
        { round: LIVE_FROM, win: FAR, mine: [LOSE] },
        { round: LIVE_FROM + 99, win: FAR, mine: [LOSE] },
      ]),
    );
    expect(find(got, "night")?.round).toBe(4 * 24 + 4);
    expect(find(got, "trial-observer")?.round).toBe(3);
    expect(find(got, "first-live")?.form).toBe("plaque");
    expect(find(got, "milestone-round", 100)?.round).toBe(LIVE_FROM + 99);
  });

  it("모든 서류 본문은 마침표로 끝나고, 패는 판·훈장은 메달로 그린다", () => {
    const fill = {
      n: 10,
      d: 2,
      con: "오리온자리",
      word: "푸른 별",
      star: "시리우스",
      count: 12,
    };
    const ids = new Set<string>();
    for (const def of AWARDS) {
      expect(ids.has(def.id)).toBe(false);
      ids.add(def.id);
      const kinds = def.steps ? def.steps.map((s) => s.kind) : [def.kind];
      for (const kind of kinds) {
        if (!kind) throw new Error(`${def.id}: 종류가 없다`);
        const text = def.text(fill, kind);
        expect(text.endsWith("."), `${def.id}: ${text}`).toBe(true);
        expect(text).not.toMatch(/\s{2}|undefined/);
        expect(text, `${def.id}: 받침에 맞춰 조사를 고른다`).not.toMatch(
          /\((을|를|은|는|이|가)\)/,
        );
      }
    }
    expect(AWARDS.length).toBeGreaterThanOrEqual(40);
    expect(formOf("감사패")).toBe("plaque");
    expect(formOf("훈장")).toBe("medal");
    expect(formOf("위로장")).toBe("paper");
  });
});
