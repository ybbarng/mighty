import {
  DRAND_DELAY,
  displayRound,
  drandTime,
  liveStart,
  phaseOf,
  type Rank,
  type RoundRecord,
  rankOf,
  roundTimes,
  type Schedule,
  type Ticket,
} from "@mighty/stardraw-core";

import { SKY_STARS, starOf, tempWord } from "./sky";

/**
 * 기념 서류(docs/36 11-19): 우주국이 우주인에게 주는 감사장·표창장·위로장·임명장·인증서·기념증·패·훈장.
 * 판정은 공개 장부에 남는 것만으로 한다(회차 기록, 회차마다 공개된 응모권, 등록 회차). 그래서 자동으로 줘도 정품이고
 * 어느 기기에서 계산해도 같다. 기기 안 기록(받은 시각 영수증, 자동 고르기를 썼는지 등)은 쓰지 않는다.
 * 날짜는 조건을 처음 채운 회차의 추첨 시각이다(응모를 받은 시각은 공개 장부에 없다). 근속만 등록 날짜에서 센다.
 */

/**
 * 서류·훈장 전체 목록과 견본을 보여 주는 화면(/stardraw/awards)을 켤지. 받기 전에는 무엇이 있는지 모르게
 * 운영 배포와 공개 데모에는 넣지 않는다(사용자). 개발 서버(pnpm dev)이거나, 로컬에서
 * `NEXT_PUBLIC_STARDRAW_SPECIMENS=1`로 빌드했을 때만 켜진다. CI와 Docker 이미지 빌드는 이 값을 넣지 않는다
 */
export const AWARD_SPECIMENS =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_STARDRAW_SPECIMENS === "1";

/** 서류 종류. "~장·~상·~증·~서"는 종이, "~패"는 판, "훈장"은 메달로 그린다 */
export type AwardKind =
  | "감사장"
  | "표창장"
  | "위로장"
  | "임명장"
  | "위촉장"
  | "인증서"
  | "기념증"
  | "개근상"
  | "근속상"
  | "우주국장상"
  | "감사패"
  | "공로패"
  | "기념패"
  | "근속패"
  | "훈장";
export type AwardForm = "paper" | "plaque" | "medal";
/** 등급(같은 갈래 안에서 단계가 오를수록) */
export type AwardGrade = "bronze" | "silver" | "gold" | "star";
export type AwardCategory =
  | "참여"
  | "연속"
  | "시간"
  | "번호"
  | "별"
  | "결과"
  | "근속"
  | "우주국"
  | "함께";

export function formOf(kind: AwardKind): AwardForm {
  if (kind === "훈장") return "medal";
  return kind.endsWith("패") ? "plaque" : "paper";
}

/** 받은 서류 하나 */
export interface EarnedAward {
  /** 갈래 id(바꾸지 않는다) */
  id: string;
  /** 단계가 있는 갈래면 그 단계 값(횟수·연수 등), 없으면 null */
  step: number | null;
  name: string;
  kind: AwardKind;
  form: AwardForm;
  grade: AwardGrade;
  category: AwardCategory;
  /** 조건을 처음 채운 회차(근속은 null) */
  round: number | null;
  /** 날짜(초): 그 회차 추첨 시각, 근속은 등록 날짜에서 n년 뒤 0시(한국 시각) */
  at: number;
  /** 본문(모든 문장은 마침표로 끝난다) */
  text: string;
}

export interface AwardInput {
  schedule: Schedule;
  /** 닫힌 회차 기록(회차 순서 상관없음) */
  records: readonly RoundRecord[];
  /** 회차 → 그 회차에 공개된 응모권 전체 */
  tickets: ReadonlyMap<number, readonly Ticket[]>;
  /** 내 우주인 공개 열쇠들(열쇠를 바꾼 적이 있으면 여럿) */
  myPubs: readonly Uint8Array[];
  /** 장부에 내 등록이 실린 회차(없으면 null) */
  registeredRound: number | null;
  /** 지금(초). 시계에서 받아 넣는다 */
  now: number;
  /** 추첨을 아직 열어 보지 않은 내 회차(spoiler.ts). 그 결과로 생긴 서류는 열기 전까지 숨긴다 */
  sealed?: (round: number) => boolean;
}

// ---------------------------------------------------------------- 계산 바탕

const KST = 9 * 3600;
const DAY = 86400;

interface KstTime {
  y: number;
  /** 1~12 */
  m: number;
  d: number;
  h: number;
  /** 0 일요일 ~ 6 토요일 */
  dow: number;
  /** 한국 날짜 번호(연속한 날을 세는 데 쓴다) */
  day: number;
}

function kst(t: number): KstTime {
  const date = new Date((t + KST) * 1000);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    h: date.getUTCHours(),
    dow: date.getUTCDay(),
    day: Math.floor((t + KST) / DAY),
  };
}

/** 한 회차에서 내 응모 */
interface MyRound {
  round: number;
  record: RoundRecord;
  /** 내 응모권 번호들(오름차순 6개씩) */
  picks: number[][];
  at: number;
  time: KstTime;
  /** 이 회차 공개 응모권 전체 */
  all: readonly Ticket[];
  /** 내 가장 높은 등수(무효·낙첨 null) */
  rank: Rank | null;
  /** 내 응모권 중 가장 많이 맞힌 수(무효면 -1) */
  bestHits: number;
}

interface Ctx {
  schedule: Schedule;
  /** 세는 닫힌 회차(회차 순). 단계가 있는 일정표면 정식 회차만(countsFor) */
  records: RoundRecord[];
  atOf: (r: RoundRecord) => number;
  /** 세는 회차의 내 응모 */
  mine: MyRound[];
  /** 단계와 상관없이 모든 내 응모(시험 관측 위원처럼 단계가 조건인 서류만 쓴다) */
  everMine: MyRound[];
  tickets: ReadonlyMap<number, readonly Ticket[]>;
  isMine: (t: Ticket) => boolean;
  registeredRound: number | null;
  now: number;
}

/** 판정 결과 하나 */
interface Hit {
  step: number | null;
  round: number | null;
  at: number;
  fill: Fill;
  /** 결과(당첨 번호)를 쓴 회차들. 하나라도 가려져 있으면 숨긴다 */
  results: number[];
}
type Fill = Record<string, string | number>;

interface Step {
  n: number;
  name: string;
  kind: AwardKind;
  grade: AwardGrade;
}

interface AwardDef {
  id: string;
  category: AwardCategory;
  /** 단계가 없는 갈래 */
  name?: string;
  kind?: AwardKind;
  grade?: AwardGrade;
  steps?: readonly Step[];
  find: (c: Ctx) => Hit[];
  text: (f: Fill, kind: AwardKind) => string;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const key = (nums: readonly number[]) => nums.join(",");
/** 끝 글자에 받침이 있나(을/를, 은/는을 고른다) */
function hasBatchim(word: string): boolean {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
const obj = (word: string) => `${word}${hasBatchim(word) ? "을" : "를"}`;
const topic = (word: string) => `${word}${hasBatchim(word) ? "은" : "는"}`;
const hitsOf = (record: RoundRecord, nums: readonly number[]) =>
  nums.filter((n) => record.numbers.includes(n)).length;

function hitAt(m: MyRound, fill: Fill = {}, results: number[] = []): Hit {
  return { step: null, round: m.round, at: m.at, fill, results };
}

/** 내 회차 가운데 조건을 채운 n번째 회차(단계마다) */
function countSteps(
  rounds: readonly MyRound[],
  steps: readonly Step[],
  weight: (m: MyRound) => number,
  usesResult = false,
): Hit[] {
  const out: Hit[] = [];
  let total = 0;
  const used: number[] = [];
  let si = 0;
  for (const m of rounds) {
    const w = weight(m);
    if (w <= 0) continue;
    total += w;
    if (usesResult) used.push(m.round);
    while (si < steps.length && total >= (steps[si] as Step).n) {
      const s = steps[si] as Step;
      out.push({
        step: s.n,
        round: m.round,
        at: m.at,
        fill: { n: s.n },
        results: [...used],
      });
      si++;
    }
  }
  return out;
}

/** 이어진 길이가 단계에 처음 닿은 곳 */
function runSteps(
  items: readonly { m: MyRound; cont: boolean }[],
  steps: readonly Step[],
  usesResult = false,
): Hit[] {
  const out: Hit[] = [];
  const reached = new Set<number>();
  let run = 0;
  let used: number[] = [];
  for (const { m, cont } of items) {
    run = cont ? run + 1 : 1;
    used = cont ? [...used, m.round] : [m.round];
    for (const s of steps)
      if (run >= s.n && !reached.has(s.n)) {
        reached.add(s.n);
        out.push({
          step: s.n,
          round: m.round,
          at: m.at,
          fill: { n: s.n },
          results: usesResult ? [...used] : [],
        });
      }
  }
  return out;
}

/** 조건을 채운 내 회차가 n번째가 된 곳 하나 */
function nth(
  c: Ctx,
  n: number,
  test: (m: MyRound) => boolean,
  usesResult = false,
): Hit[] {
  let count = 0;
  const used: number[] = [];
  for (const m of c.mine) {
    if (!test(m)) continue;
    count++;
    if (usesResult) used.push(m.round);
    if (count === n) return [hitAt(m, { n }, used)];
  }
  return [];
}

/** 응모권 한 장이라도 조건을 채운 첫 회차 */
function firstPick(
  c: Ctx,
  test: (nums: readonly number[], m: MyRound) => Fill | boolean,
): Hit[] {
  for (const m of c.mine)
    for (const p of m.picks) {
      const r = test(p, m);
      if (r) return [hitAt(m, r === true ? {} : r)];
    }
  return [];
}

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);
const NATIONAL_DAYS = [
  [3, 1, "삼일절"],
  [7, 17, "제헌절"],
  [8, 15, "광복절"],
  [10, 3, "개천절"],
  [10, 9, "한글날"],
] as const;
/** "잠든 별": 직전 이만큼의 추첨(무효 제외) 동안 당첨 번호로 나오지 않은 별 */
export const ASLEEP_DRAWS = 50;

// 끝맺음. 서류 종류마다 다르다
const close: Record<AwardKind, string> = {
  감사장: "이에 감사의 뜻을 담아 이 장을 드립니다.",
  표창장: "이에 표창합니다.",
  위로장: "이에 위로의 뜻을 전합니다.",
  임명장: "",
  위촉장: "",
  인증서: "이를 인증합니다.",
  기념증: "이를 기념하여 이 증서를 드립니다.",
  개근상: "이에 상장을 드립니다.",
  근속상: "이에 상장을 드립니다.",
  우주국장상: "이에 우주국장상을 드립니다.",
  감사패: "그 뜻을 오래 기리고자 이 패를 드립니다.",
  공로패: "그 공로를 오래 기리고자 이 패를 드립니다.",
  기념패: "이를 오래 기념하고자 이 패를 드립니다.",
  근속패: "그 세월을 기리고자 이 패를 드립니다.",
  훈장: "이에 카노푸스 우주국의 이름으로 훈장을 수여합니다.",
};
const doc = (body: string, kind: AwardKind) =>
  close[kind] ? `${body} ${close[kind]}` : body;

// ---------------------------------------------------------------- 목록

export const AWARDS: readonly AwardDef[] = [
  // 참여
  {
    id: "entries",
    category: "참여",
    steps: [
      { n: 10, name: "관측 참여 감사장", kind: "감사장", grade: "bronze" },
      { n: 100, name: "성실 관측 감사장", kind: "감사장", grade: "silver" },
      { n: 1000, name: "관측 공로 감사패", kind: "감사패", grade: "gold" },
      { n: 10000, name: "만 번의 관측 공로패", kind: "공로패", grade: "star" },
    ],
    find: (c) => countSteps(c.mine, stepsOf("entries"), (m) => m.picks.length),
    text: (f, k) =>
      doc(
        `귀하는 본 우주국의 밤하늘 관측 사업에 ${f.n}회 참여하여 별 연구에 꾸준히 이바지하였습니다.`,
        k,
      ),
  },
  {
    id: "honorary-observer",
    category: "참여",
    name: "명예 관측관 임명장",
    kind: "임명장",
    grade: "gold",
    find: (c) =>
      countSteps(
        c.mine,
        [{ n: 500, name: "", kind: "임명장", grade: "gold" }],
        (m) => m.picks.length,
      ).map((h) => ({ ...h, step: null })),
    text: () =>
      "귀하는 500회에 걸친 관측으로 밤하늘을 보는 눈이 남다름을 증명하였습니다. 이에 귀하를 카노푸스 우주국 명예 관측관으로 임명합니다.",
  },
  {
    id: "days",
    category: "참여",
    steps: [
      { n: 7, name: "일주일 관측 인증서", kind: "인증서", grade: "bronze" },
      { n: 30, name: "한 달 관측 인증서", kind: "인증서", grade: "silver" },
      { n: 100, name: "백일 관측 표창장", kind: "표창장", grade: "gold" },
      { n: 365, name: "한 해 관측 기념패", kind: "기념패", grade: "star" },
    ],
    find: (c) => {
      const seen = new Set<number>();
      return countSteps(c.mine, stepsOf("days"), (m) => {
        if (seen.has(m.time.day)) return 0;
        seen.add(m.time.day);
        return 1;
      });
    },
    text: (f, k) =>
      doc(
        `귀하는 서로 다른 ${f.n}일에 걸쳐 밤하늘을 관측하였습니다. 하루하루 쌓인 관측은 우주국의 소중한 기록이 되었습니다.`,
        k,
      ),
  },

  // 연속
  {
    id: "streak",
    category: "연속",
    steps: [
      { n: 12, name: "반나절 관측 인증서", kind: "인증서", grade: "bronze" },
      { n: 24, name: "불면 관측 표창장", kind: "표창장", grade: "silver" },
      { n: 168, name: "철야 관측 표창장", kind: "표창장", grade: "gold" },
      { n: 720, name: "한 달 철야 공로패", kind: "공로패", grade: "star" },
    ],
    find: (c) => {
      const items: { m: MyRound; cont: boolean }[] = [];
      let prev = -1;
      for (const m of c.mine) {
        items.push({ m, cont: m.round === prev + 1 });
        prev = m.round;
      }
      return runSteps(items, stepsOf("streak"));
    },
    text: (f, k) =>
      doc(
        `귀하는 ${f.n}회차를 한 번도 거르지 않고 이어서 관측하였습니다. 잠보다 별을 택한 그 정성에 우주국은 깊은 감명을 받았습니다.`,
        k,
      ),
  },
  {
    id: "daily-streak",
    category: "연속",
    steps: [
      { n: 7, name: "주간 개근상", kind: "개근상", grade: "bronze" },
      { n: 30, name: "월간 개근상", kind: "개근상", grade: "silver" },
      { n: 100, name: "백일 개근상", kind: "개근상", grade: "gold" },
      { n: 365, name: "한 해 개근 공로패", kind: "공로패", grade: "star" },
    ],
    find: (c) => {
      const items: { m: MyRound; cont: boolean }[] = [];
      let prevDay = -1;
      for (const m of c.mine) {
        if (m.time.day === prevDay) continue;
        items.push({ m, cont: m.time.day === prevDay + 1 });
        prevDay = m.time.day;
      }
      return runSteps(items, stepsOf("daily-streak"));
    },
    text: (f, k) =>
      doc(
        `귀하는 ${f.n}일 동안 하루도 빠짐없이 관측에 참여하였습니다. 그 성실함은 모든 우주인의 본보기가 되었습니다.`,
        k,
      ),
  },
  {
    id: "steady",
    category: "연속",
    steps: [
      {
        n: 10,
        name: "한결같은 별지기 감사장",
        kind: "감사장",
        grade: "bronze",
      },
      { n: 100, name: "한결같은 별지기 감사패", kind: "감사패", grade: "gold" },
    ],
    find: (c) => {
      const items: { m: MyRound; cont: boolean }[] = [];
      let prev: { round: number; key: string } | null = null;
      for (const m of c.mine) {
        const k = key(m.picks[0] as number[]);
        items.push({
          m,
          cont: prev !== null && prev.round + 1 === m.round && prev.key === k,
        });
        prev = { round: m.round, key: k };
      }
      return runSteps(items, stepsOf("steady"));
    },
    text: (f, k) =>
      doc(
        `귀하는 ${f.n}회차 동안 같은 별 여섯을 이어서 골랐습니다. 흔들리지 않는 그 믿음을 별들도 알아줄 것입니다.`,
        k,
      ),
  },

  // 시간(추첨 시각, 한국 시각)
  ...(
    [
      [
        "midnight",
        "자정 관측 인증서",
        "인증서",
        [0],
        "자정을 알리는 추첨에 10회 참여하였습니다. 하루의 끝과 시작을 별과 함께 맞이하였습니다.",
      ],
      [
        "night",
        "심야 관측 표창장",
        "표창장",
        [3, 4],
        "새벽 3시와 4시의 추첨에 10회 참여하였습니다. 모두가 잠든 시각에도 하늘을 지킨 노고가 큽니다.",
      ],
      [
        "dawn",
        "새벽 별 배웅 인증서",
        "인증서",
        [5, 6],
        "새벽 5시와 6시의 추첨에 10회 참여하였습니다. 날이 밝아 사라지는 별들을 끝까지 배웅하였습니다.",
      ],
      [
        "noon",
        "한낮 관측 인증서",
        "인증서",
        [12],
        "정오의 추첨에 10회 참여하였습니다. 해가 가장 높이 떠 별이 하나도 보이지 않는 시각에도 별을 믿었습니다.",
      ],
    ] as const
  ).map(
    ([id, name, kind, hours, body]): AwardDef => ({
      id,
      category: "시간",
      name,
      kind,
      grade: "bronze",
      find: (c) =>
        nth(c, 10, (m) => (hours as readonly number[]).includes(m.time.h)),
      text: (_, k) => doc(`귀하는 ${body}`, k),
    }),
  ),
  {
    id: "all-hours",
    category: "시간",
    name: "스물네 시간 관측 표창장",
    kind: "표창장",
    grade: "silver",
    find: (c) => {
      const hours = new Set<number>();
      for (const m of c.mine) {
        hours.add(m.time.h);
        if (hours.size === 24) return [hitAt(m)];
      }
      return [];
    },
    text: (_, k) =>
      doc(
        "귀하는 하루 스물네 시각의 추첨에 모두 한 번 이상 참여하였습니다. 우주국은 귀하가 언제 잠드는지 알지 못합니다.",
        k,
      ),
  },
  {
    id: "weekend",
    category: "시간",
    name: "주말 관측 감사장",
    kind: "감사장",
    grade: "bronze",
    find: (c) => nth(c, 50, (m) => m.time.dow === 0 || m.time.dow === 6),
    text: (_, k) =>
      doc(
        "귀하는 토요일과 일요일의 추첨에 50회 참여하였습니다. 쉬는 날에도 밤하늘을 잊지 않았습니다.",
        k,
      ),
  },
  ...(
    [
      [
        "new-year",
        "새해 첫 별 기념증",
        (t: KstTime) => t.m === 1 && t.d === 1 && t.h === 0,
        "새해 1월 1일 0시의 추첨에 참여하여 한 해의 첫 별을 맞이하였습니다.",
      ],
      [
        "christmas",
        "성탄 관측 기념증",
        (t: KstTime) => t.m === 12 && t.d === 25,
        "성탄절의 추첨에 참여하였습니다. 동방박사들도 별을 보고 길을 나섰다고 전해집니다.",
      ],
      [
        "leap-day",
        "윤일 관측 기념증",
        (t: KstTime) => t.m === 2 && t.d === 29,
        "4년에 한 번 오는 2월 29일의 추첨에 참여하였습니다.",
      ],
      [
        "friday-13",
        "13일의 금요일 관측 인증서",
        (t: KstTime) => t.d === 13 && t.dow === 5,
        "13일의 금요일에 아무렇지 않게 추첨에 참여하였습니다. 별은 날짜를 가리지 않는다는 사실을 몸소 보였습니다.",
      ],
    ] as const
  ).map(
    ([id, name, test, body]): AwardDef => ({
      id,
      category: "시간",
      name,
      kind: id === "friday-13" ? "인증서" : "기념증",
      grade: "bronze",
      find: (c) => nth(c, 1, (m) => test(m.time)),
      text: (_, k) => doc(`귀하는 ${body}`, k),
    }),
  ),
  {
    id: "national-days",
    category: "시간",
    name: "국경일 관측 표창장",
    kind: "표창장",
    grade: "silver",
    find: (c) => {
      const got = new Set<string>();
      for (const m of c.mine) {
        const day = NATIONAL_DAYS.find(
          ([mm, dd]) => m.time.m === mm && m.time.d === dd,
        );
        if (day) got.add(day[2]);
        if (got.size === NATIONAL_DAYS.length) return [hitAt(m)];
      }
      return [];
    },
    text: (_, k) =>
      doc(
        "귀하는 삼일절, 제헌절, 광복절, 개천절, 한글날의 추첨에 모두 참여하였습니다. 나라의 뜻깊은 날마다 하늘을 우러러보았습니다.",
        k,
      ),
  },

  // 번호 모양(응모권 한 장)
  {
    id: "brightest-six",
    category: "번호",
    name: "질서 존중 표창장",
    kind: "표창장",
    grade: "silver",
    find: (c) => firstPick(c, (p) => key(p) === "1,2,3,4,5,6"),
    text: (_, k) =>
      doc(
        "귀하는 1번부터 6번까지, 하늘에서 가장 밝은 별 여섯을 밝기 순서 그대로 골랐습니다. 질서를 존중하는 그 마음을 높이 삽니다.",
        k,
      ),
  },
  {
    id: "run-six",
    category: "번호",
    name: "가지런한 별 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) =>
      firstPick(
        c,
        (p) =>
          p[0] !== 1 &&
          p.every((n, i) => i === 0 || n === (p[i - 1] as number) + 1),
      ),
    text: (_, k) =>
      doc("귀하는 이어진 번호 여섯 개로 응모권을 가지런히 채웠습니다.", k),
  },
  {
    id: "arithmetic",
    category: "번호",
    name: "등차수열 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) =>
      firstPick(c, (p) => {
        const d = (p[1] as number) - (p[0] as number);
        return (
          d >= 2 &&
          p.every((n, i) => i === 0 || n - (p[i - 1] as number) === d) && {
            d,
          }
        );
      }),
    text: (f, k) =>
      doc(
        `귀하는 ${f.d}씩 커지는 번호 여섯 개로 응모하였습니다. 별을 고르는 데에도 수학이 쓰일 수 있음을 보였습니다.`,
        k,
      ),
  },
  {
    id: "all-odd",
    category: "번호",
    name: "홀수 애호 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => firstPick(c, (p) => p.every((n) => n % 2 === 1)),
    text: (_, k) => doc("귀하는 홀수 번호로만 응모권을 채웠습니다.", k),
  },
  {
    id: "all-even",
    category: "번호",
    name: "짝수 애호 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => firstPick(c, (p) => p.every((n) => n % 2 === 0)),
    text: (_, k) => doc("귀하는 짝수 번호로만 응모권을 채웠습니다.", k),
  },
  {
    id: "primes",
    category: "번호",
    name: "소수 애호 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => firstPick(c, (p) => p.every((n) => PRIMES.has(n))),
    text: (_, k) =>
      doc(
        "귀하는 1과 자기 자신으로만 나누어지는 번호로만 응모하였습니다. 나누어지지 않는 별들의 고집을 알아본 안목을 기립니다.",
        k,
      ),
  },
  {
    id: "months",
    category: "번호",
    name: "열두 달 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => firstPick(c, (p) => p.every((n) => n <= 12)),
    text: (_, k) =>
      doc("귀하는 12 이하의 번호로만 응모하여 열두 달을 하늘에 담았습니다.", k),
  },
  {
    id: "balanced-sum",
    category: "번호",
    name: "균형 감각 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => firstPick(c, (p) => p.reduce((a, b) => a + b, 0) === 138),
    text: (_, k) =>
      doc(
        "귀하가 고른 번호 여섯 개를 모두 더하면 138로, 1부터 45까지 고르게 고를 때의 가운데 값과 꼭 같습니다.",
        k,
      ),
  },
  {
    id: "copy-last",
    category: "번호",
    name: "지난 별 다시 보기 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => {
      const byRound = new Map(c.records.map((r) => [r.round, r]));
      for (const m of c.mine) {
        const prev = byRound.get(m.round - 1);
        if (!prev || prev.void) continue;
        if (m.picks.some((p) => key(p) === key(prev.numbers)))
          return [hitAt(m, {}, [prev.round])];
      }
      return [];
    },
    text: (_, k) =>
      doc(
        "귀하는 바로 앞 회차의 당첨 번호 여섯 개를 그대로 골라 응모하였습니다. 한 번 빛난 별이 다시 빛나기를 바라는 마음을 헤아립니다.",
        k,
      ),
  },

  // 별
  {
    id: "one-constellation",
    category: "별",
    name: "별자리 순례 표창장",
    kind: "표창장",
    grade: "silver",
    find: (c) =>
      firstPick(c, (p) => {
        const con = starOf(p[0] as number).con;
        return p.every((n) => starOf(n).con === con) && { con };
      }),
    text: (f, k) =>
      doc(
        `귀하는 여섯 별을 모두 ${f.con}에서 골라 한 별자리를 온전히 순례하였습니다.`,
        k,
      ),
  },
  {
    id: "first-magnitude",
    category: "별",
    name: "일등성 수집 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => firstPick(c, (p) => p.every((n) => starOf(n).mag <= 1.5)),
    text: (_, k) =>
      doc("귀하는 1등성으로 불리는 밝은 별로만 응모권을 채웠습니다.", k),
  },
  {
    id: "five-colors",
    category: "별",
    name: "다섯 빛깔 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) =>
      firstPick(
        c,
        (p) => new Set(p.map((n) => tempWord(starOf(n).k))).size === 5,
      ),
    text: (_, k) =>
      doc(
        "귀하는 한 장의 응모권에 푸른 별, 흰 별, 노란빛 별, 주황빛 별, 붉은 별을 모두 담았습니다.",
        k,
      ),
  },
  {
    id: "one-color",
    category: "별",
    name: "한 빛깔 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) =>
      firstPick(c, (p) => {
        const word = tempWord(starOf(p[0] as number).k);
        return p.every((n) => tempWord(starOf(n).k) === word) && { word };
      }),
    text: (f, k) => doc(`귀하는 여섯 별을 모두 ${f.word}로만 골랐습니다.`, k),
  },
  {
    id: "all-stars",
    category: "별",
    name: "마흔다섯 별 순례 표창장",
    kind: "표창장",
    grade: "gold",
    find: (c) => {
      const seen = new Set<number>();
      for (const m of c.mine) {
        for (const p of m.picks) for (const n of p) seen.add(n);
        if (seen.size === SKY_STARS.length) return [hitAt(m)];
      }
      return [];
    },
    text: (_, k) =>
      doc(
        "귀하는 응모판의 별 마흔다섯을 하나도 빠짐없이 한 번 이상 골랐습니다. 서울 하늘의 밝은 별을 모두 만나 본 우주인으로 기록합니다.",
        k,
      ),
  },
  {
    id: "favorite-star",
    category: "별",
    name: "전담 관측관 임명장",
    kind: "임명장",
    grade: "silver",
    find: (c) => {
      const count = new Map<number, number>();
      for (const m of c.mine)
        for (const p of m.picks)
          for (const n of p) {
            const v = (count.get(n) ?? 0) + 1;
            count.set(n, v);
            if (v === 100) return [hitAt(m, { star: starOf(n).ko })];
          }
      return [];
    },
    text: (f) =>
      `귀하는 ${obj(String(f.star))} 100번 골라 그 별을 누구보다 오래 지켜보았습니다. 이에 귀하를 ${f.star} 전담 관측관으로 임명합니다.`,
  },

  // 결과(당첨 번호를 쓴다)
  {
    id: "lose-streak",
    category: "결과",
    steps: [
      {
        n: 50,
        name: "꺾이지 않는 관측 정신 위로장",
        kind: "위로장",
        grade: "bronze",
      },
      {
        n: 200,
        name: "꺾이지 않는 관측 정신 위로장",
        kind: "위로장",
        grade: "silver",
      },
      { n: 1000, name: "불굴의 관측 공로패", kind: "공로패", grade: "gold" },
    ],
    find: (c) => {
      const items: { m: MyRound; cont: boolean }[] = [];
      let lost = false;
      for (const m of c.mine) {
        if (m.record.void) continue;
        const now = m.rank === null;
        if (now) items.push({ m, cont: lost });
        lost = now;
      }
      return runSteps(items, stepsOf("lose-streak"), true);
    },
    text: (f, k) =>
      doc(
        `귀하는 ${f.n}회 연속으로 당첨되지 않았음에도 관측을 멈추지 않았습니다. 별은 쉽게 따지지 않기에 하늘의 별 따기라 부릅니다.`,
        k,
      ),
  },
  {
    id: "zero-streak",
    category: "결과",
    name: "완벽한 엇갈림 위로장",
    kind: "위로장",
    grade: "bronze",
    find: (c) => {
      const items: { m: MyRound; cont: boolean }[] = [];
      let zero = false;
      for (const m of c.mine) {
        if (m.record.void) continue;
        const now = m.bestHits === 0;
        if (now) items.push({ m, cont: zero });
        zero = now;
      }
      return runSteps(
        items,
        [{ n: 5, name: "", kind: "위로장", grade: "bronze" }],
        true,
      ).map((h) => ({ ...h, step: null }));
    },
    text: (_, k) =>
      doc(
        "귀하가 고른 별은 5회 연속으로 당첨 번호를 하나도 맞히지 않았습니다. 이토록 정확하게 비켜 가는 것도 드문 재주입니다.",
        k,
      ),
  },
  {
    id: "fifth",
    category: "결과",
    steps: [
      { n: 10, name: "5등 단골 표창장", kind: "표창장", grade: "bronze" },
      { n: 50, name: "5등 단골 표창장", kind: "표창장", grade: "silver" },
      { n: 100, name: "5등 명인 공로패", kind: "공로패", grade: "gold" },
    ],
    find: (c) =>
      countSteps(c.mine, stepsOf("fifth"), (m) => (m.rank === 5 ? 1 : 0), true),
    text: (f, k) =>
      doc(
        `귀하는 별 셋을 맞혀 5등에 ${f.n}번 당첨되었습니다. 크지 않아도 꾸준한 빛이 하늘을 채웁니다.`,
        k,
      ),
  },
  {
    id: "fourth",
    category: "결과",
    name: "4등 열 번 표창장",
    kind: "표창장",
    grade: "gold",
    find: (c) => nth(c, 10, (m) => m.rank === 4, true),
    text: (_, k) => doc("귀하는 별 넷을 맞혀 4등에 10번 당첨되었습니다.", k),
  },
  {
    id: "bonus-only",
    category: "결과",
    name: "보너스 별 위로장",
    kind: "위로장",
    grade: "bronze",
    find: (c) => {
      for (const m of c.mine) {
        if (m.record.void) continue;
        if (
          m.picks.some(
            (p) => hitsOf(m.record, p) === 0 && p.includes(m.record.bonus),
          )
        )
          return [hitAt(m, {}, [m.round])];
      }
      return [];
    },
    text: (_, k) =>
      doc(
        "귀하는 당첨 번호 여섯은 모두 비켜 갔으나 보너스 별 하나만은 정확히 맞혔습니다. 보너스 별은 당첨 번호를 다섯 개 맞혔을 때에만 쓰입니다.",
        k,
      ),
  },
  {
    id: "one-short",
    category: "결과",
    name: "별 하나 차이 위로장",
    kind: "위로장",
    grade: "gold",
    find: (c) => nth(c, 1, (m) => m.rank === 2, true),
    text: (_, k) =>
      doc(
        "귀하는 별 다섯과 보너스 별을 맞혀 1등에 별 하나 모자랐습니다. 2등 당첨을 축하하며, 놓친 별 하나에 대하여는 깊은 위로를 보냅니다.",
        k,
      ),
  },
  {
    id: "woke-star",
    category: "결과",
    name: "잠든 별을 깨운 공로 표창장",
    kind: "표창장",
    grade: "silver",
    find: (c) => {
      const draws = c.records.filter((r) => !r.void);
      const index = new Map(draws.map((r, i) => [r.round, i]));
      for (const m of c.mine) {
        const i = index.get(m.round);
        if (i === undefined || i < ASLEEP_DRAWS) continue;
        const before = draws.slice(i - ASLEEP_DRAWS, i);
        const mineStars = new Set(m.picks.flat());
        for (const n of m.record.numbers)
          if (mineStars.has(n) && before.every((r) => !r.numbers.includes(n)))
            return [
              hitAt(m, { star: starOf(n).ko }, [
                ...before.map((r) => r.round),
                m.round,
              ]),
            ];
      }
      return [];
    },
    text: (f, k) =>
      doc(
        `귀하가 고른 ${topic(String(f.star))} ${ASLEEP_DRAWS}번의 추첨 동안 한 번도 뽑히지 않다가 귀하의 응모와 함께 당첨 번호로 떠올랐습니다. 잠든 별을 깨운 공로를 기립니다.`,
        k,
      ),
  },
  {
    id: "medal-gold",
    category: "결과",
    name: "카노푸스 별 훈장 금장",
    kind: "훈장",
    grade: "star",
    find: (c) =>
      c.mine.filter((m) => m.rank === 1).map((m) => hitAt(m, {}, [m.round])),
    text: (_, k) =>
      doc(
        "귀하는 하늘의 별 여섯을 모두 맞혀 1등에 당첨되었습니다. 로또 1등보다 어렵다는 하늘의 별 따기를 해낸 공을 높이 기립니다.",
        k,
      ),
  },
  {
    id: "medal-silver",
    category: "결과",
    name: "카노푸스 별 훈장 은장",
    kind: "훈장",
    grade: "gold",
    find: (c) =>
      c.mine.filter((m) => m.rank === 2).map((m) => hitAt(m, {}, [m.round])),
    text: (_, k) =>
      doc(
        "귀하는 별 다섯과 보너스 별을 맞혀 2등에 당첨되었습니다. 하늘의 별에 가장 가까이 다가간 공을 기립니다.",
        k,
      ),
  },
  {
    id: "director-prize",
    category: "결과",
    name: "우주국장 특별상",
    kind: "우주국장상",
    grade: "star",
    find: (c) => {
      const got = new Set<Rank>();
      const used: number[] = [];
      for (const m of c.mine) {
        if (m.rank !== null && m.rank <= 3) {
          got.add(m.rank);
          used.push(m.round);
        }
        if (got.size === 3) return [hitAt(m, {}, used)];
      }
      return [];
    },
    text: (_, k) =>
      doc(
        "귀하는 1등, 2등, 3등에 모두 한 번 이상 당첨되었습니다. 우주국이 문을 연 뒤로 손에 꼽을 만한 일입니다.",
        k,
      ),
  },
  {
    id: "witness-first",
    category: "결과",
    name: "1등의 순간 기념증",
    kind: "기념증",
    grade: "silver",
    find: (c) =>
      nth(
        c,
        1,
        (m) =>
          !m.record.void &&
          m.rank !== 1 &&
          m.all.some((t) => !c.isMine(t) && rankOf(m.record, t.numbers) === 1),
        true,
      ),
    text: (_, k) =>
      doc(
        "귀하가 참여한 회차에서 다른 우주인이 1등에 당첨되었습니다. 하늘의 별이 따지는 드문 순간을 함께하였습니다.",
        k,
      ),
  },

  // 근속(등록 날짜에서)
  {
    id: "anniversary",
    category: "근속",
    steps: [
      { n: 1, name: "1년 근속상", kind: "근속상", grade: "bronze" },
      { n: 2, name: "2년 근속상", kind: "근속상", grade: "silver" },
      { n: 5, name: "5년 근속패", kind: "근속패", grade: "gold" },
      { n: 10, name: "10년 근속패", kind: "근속패", grade: "star" },
    ],
    find: (c) => {
      if (c.registeredRound === null) return [];
      const reg = kst(roundTimes(c.schedule, c.registeredRound).closesAt);
      const out: Hit[] = [];
      for (const s of stepsOf("anniversary")) {
        // 2월 29일 등록은 평년에 2월 28일로
        const last = new Date(Date.UTC(reg.y + s.n, reg.m, 0)).getUTCDate();
        const at =
          Date.UTC(reg.y + s.n, reg.m - 1, Math.min(reg.d, last)) / 1000 - KST;
        if (at <= c.now)
          out.push({
            step: s.n,
            round: null,
            at,
            fill: { n: s.n },
            results: [],
          });
      }
      return out;
    },
    text: (f, k) =>
      doc(
        `귀하는 우주인으로 등록한 뒤 ${f.n}년 동안 카노푸스 우주국과 함께하였습니다.`,
        k,
      ),
  },

  // 우주국 행사
  {
    id: "trial-observer",
    category: "우주국",
    name: "시험 관측 위원 위촉장",
    kind: "위촉장",
    grade: "silver",
    find: (c) =>
      nth(
        { ...c, mine: c.everMine },
        1,
        (m) => phaseOf(c.schedule, m.round) === "trial",
      ),
    text: () =>
      "귀하는 우주국이 문을 열기 전 시험 관측에 참여하여 장부와 하늘을 함께 점검하였습니다. 이에 귀하를 시험 관측 위원으로 위촉하고 그 노고에 감사드립니다.",
  },
  {
    id: "first-live",
    category: "우주국",
    name: "개국 첫 관측 기념패",
    kind: "기념패",
    grade: "gold",
    find: (c) => {
      const start = liveStart(c.schedule);
      return start === null ? [] : nth(c, 1, (m) => m.round === start);
    },
    text: (_, k) =>
      doc(
        "귀하는 카노푸스 우주국이 정식으로 문을 연 첫 회차에 참여하였습니다.",
        k,
      ),
  },
  {
    id: "milestone-round",
    category: "우주국",
    steps: [
      { n: 100, name: "100번째 회차 기념증", kind: "기념증", grade: "bronze" },
      {
        n: 1000,
        name: "1000번째 회차 기념증",
        kind: "기념증",
        grade: "silver",
      },
      {
        n: 10000,
        name: "10000번째 회차 기념패",
        kind: "기념패",
        grade: "gold",
      },
    ],
    find: (c) => {
      const out: Hit[] = [];
      for (const s of stepsOf("milestone-round")) {
        const m = c.mine.find((x) => {
          const d = displayRound(c.schedule, x.round);
          return d.phase === "live" && d.number === s.n;
        });
        if (m) out.push({ ...hitAt(m, { n: s.n }), step: s.n });
      }
      return out;
    },
    text: (f, k) =>
      doc(`귀하는 우주국 정식 관측 ${f.n}번째 회차에 참여하였습니다.`, k),
  },
  {
    id: "founding-day",
    category: "우주국",
    name: "개국 기념일 관측 기념증",
    kind: "기념증",
    grade: "silver",
    find: (c) => {
      const start = liveStart(c.schedule);
      if (start === null) return [];
      const f = kst(roundTimes(c.schedule, start).closesAt);
      return nth(
        c,
        1,
        (m) => m.time.y > f.y && m.time.m === f.m && m.time.d === f.d,
      );
    },
    text: (_, k) =>
      doc("귀하는 카노푸스 우주국의 개국 기념일에 추첨에 참여하였습니다.", k),
  },

  // 함께(그 회차의 공개 응모권)
  {
    id: "twin",
    category: "함께",
    name: "같은 꿈 인증서",
    kind: "인증서",
    grade: "silver",
    find: (c) =>
      firstPick(c, (p, m) =>
        m.all.some((t) => !c.isMine(t) && key(t.numbers) === key(p)),
      ),
    text: (_, k) =>
      doc(
        "귀하는 같은 회차에 다른 우주인과 똑같은 별 여섯을 골랐습니다. 넓은 하늘에서 같은 꿈을 꾼 우주인이 있음을 인증합니다.",
        k,
      ),
  },
  {
    id: "busiest",
    category: "함께",
    name: "가장 붐빈 밤 감사장",
    kind: "감사장",
    grade: "bronze",
    find: (c) => {
      let most = 0;
      for (const r of c.records) {
        const count = c.tickets.get(r.round)?.length ?? r.count;
        if (count > most) {
          most = count;
          if (count >= 10) {
            const m = c.mine.find((x) => x.round === r.round);
            if (m) return [hitAt(m, { count })];
          }
        }
      }
      return [];
    },
    text: (f, k) =>
      doc(
        `귀하는 그때까지 가장 많은 응모권(${f.count}장)이 모인 회차에 참여하였습니다. 붐비는 하늘에 한 자리를 보태 주었습니다.`,
        k,
      ),
  },
  {
    id: "alone",
    category: "함께",
    name: "홀로 관측 인증서",
    kind: "인증서",
    grade: "bronze",
    find: (c) => nth(c, 1, (m) => m.all.length === 1 && m.picks.length === 1),
    text: (_, k) =>
      doc(
        "귀하는 응모권이 단 한 장뿐인 회차에서 홀로 밤하늘을 지켰습니다. 그 회차의 하늘은 오롯이 귀하의 것이었습니다.",
        k,
      ),
  },
];

/** 갈래의 단계(판정 함수 안에서 부른다: 목록이 다 만들어진 뒤) */
function stepsOf(id: string): readonly Step[] {
  return AWARDS.find((a) => a.id === id)?.steps ?? [];
}

// ---------------------------------------------------------------- 계산

/** 받은 기념 서류 전체(날짜 순). 순수 함수: 같은 입력이면 어느 기기에서나 같다 */
export function earnedAwards(input: AwardInput): EarnedAward[] {
  const c = context(input);
  const out: EarnedAward[] = [];
  for (const def of AWARDS) {
    for (const h of def.find(c)) {
      if (input.sealed && h.results.some((r) => input.sealed?.(r))) continue;
      const step =
        h.step !== null && def.steps
          ? def.steps.find((s) => s.n === h.step)
          : undefined;
      const kind = (step?.kind ?? def.kind) as AwardKind;
      out.push({
        id: def.id,
        step: h.step,
        name: (step?.name ?? def.name) as string,
        kind,
        form: formOf(kind),
        grade: (step?.grade ?? def.grade) as AwardGrade,
        category: def.category,
        round: h.round,
        at: h.at,
        text: def.text(h.fill, kind),
      });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * 기념 서류가 세는 회차: 단계가 있는 일정표면 정식 회차만, 단계가 없으면(연습 장부) 모두.
 * 시험 회차는 짧은 주기·시험 참가자로 돌아 정식 기록과 섞으면 횟수·연속이 부풀기 때문이다(docs/36 11-19)
 */
export function countsFor(schedule: Schedule, round: number): boolean {
  const phase = phaseOf(schedule, round);
  return phase === null || phase === "live";
}

function context(input: AwardInput): Ctx {
  const everRecords = [...input.records].sort((a, b) => a.round - b.round);
  const records = everRecords.filter((r) => countsFor(input.schedule, r.round));
  const isMine = (t: Ticket) => input.myPubs.some((p) => sameBytes(p, t.pub));
  const atOf = (r: RoundRecord) =>
    r.void
      ? roundTimes(input.schedule, r.round).closesAt + DRAND_DELAY
      : drandTime(r.drandRound);
  const everMine: MyRound[] = [];
  for (const record of everRecords) {
    const all = input.tickets.get(record.round) ?? [];
    const picks = all
      .filter(isMine)
      .map((t) => [...t.numbers].sort((a, b) => a - b))
      .sort((a, b) => key(a).localeCompare(key(b)));
    if (picks.length === 0) continue;
    const at = atOf(record);
    let rank: Rank | null = null;
    let bestHits = -1;
    if (!record.void)
      for (const p of picks) {
        const r = rankOf(record, p);
        if (r !== null && (rank === null || r < rank)) rank = r;
        bestHits = Math.max(bestHits, hitsOf(record, p));
      }
    everMine.push({
      round: record.round,
      record,
      picks,
      at,
      time: kst(at),
      all,
      rank,
      bestHits,
    });
  }
  return {
    schedule: input.schedule,
    records,
    atOf,
    mine: everMine.filter((m) => countsFor(input.schedule, m.round)),
    everMine,
    tickets: input.tickets,
    isMine,
    registeredRound: input.registeredRound,
    now: input.now,
  };
}
