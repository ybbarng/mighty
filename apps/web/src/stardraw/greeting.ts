/**
 * 신분증을 확인한 뒤 창구 직원이 건네는 인사(입장·응모 공통). 우주국 창구 말투로 짧고 정중하게, 문장마다 마침표.
 * 지금 시각(한국 시각)의 시간대 후보와 늘 쓰는 인사 중에서 무작위로 고르되, 바로 앞 인사와 같은 문장은 피한다.
 * 시각과 무작위는 넣어 받아 시험이 결정적이다
 */

/** 시간대별 인사(한국 시각, [시작 시, 끝 시)) */
const BY_HOUR: { from: number; to: number; lines: readonly string[] }[] = [
  {
    from: 0,
    to: 5,
    lines: [
      "늦은 밤까지 관측하시네요.",
      "깊은 밤에 오셨네요.",
      "별이 가장 또렷한 시간이에요.",
      "밤이 깊었어요. 반갑습니다.",
    ],
  },
  {
    from: 5,
    to: 11,
    lines: [
      "좋은 아침이에요.",
      "상쾌한 아침이에요.",
      "이른 시간에 오셨네요.",
      "오늘 하루도 반갑습니다.",
    ],
  },
  {
    from: 11,
    to: 14,
    lines: [
      "점심은 드셨어요?",
      "점심시간에 오셨네요.",
      "좋은 한낮이에요.",
      "해가 높이 떴어요. 반갑습니다.",
    ],
  },
  {
    from: 14,
    to: 18,
    lines: [
      "좋은 오후예요.",
      "오후도 반갑습니다.",
      "남은 하루도 잘 보내세요.",
      "해가 기울고 있어요. 반갑습니다.",
    ],
  },
  {
    from: 18,
    to: 22,
    lines: [
      "좋은 저녁이에요.",
      "오늘 하루도 수고 많으셨어요.",
      "별이 하나둘 뜨는 시간이에요.",
      "저녁 관측에 오셨네요.",
    ],
  },
  {
    from: 22,
    to: 24,
    lines: [
      "별이 잘 보이는 밤이에요.",
      "늦은 시간에 오셨네요.",
      "오늘 밤 하늘이 맑아요.",
      "편안한 밤 되세요.",
    ],
  },
];

/** 시간대와 상관없이 늘 쓰는 인사 */
const ANY_TIME = ["어서 오세요.", "안녕하세요.", "다시 뵙네요."] as const;

/** 한국 시각의 시(0~23) */
export function kstHour(ms: number): number {
  return new Date(ms + 9 * 3600_000).getUTCHours();
}

/** 지금 시각에 맞는 인사 후보 */
export function greetingLines(ms: number): readonly string[] {
  const h = kstHour(ms);
  const slot = BY_HOUR.find((b) => h >= b.from && h < b.to);
  return [...(slot?.lines ?? []), ...ANY_TIME];
}

/**
 * 인사 한 문장. `random`은 [0, 1). 바로 앞 인사(`last`)와 같은 문장은 고르지 않는다.
 * 응모 자리는 창구 말("응모를 접수하겠습니다.")을 뒤에 붙인다
 */
export function pickGreeting({
  now,
  place,
  random,
  last,
}: {
  now: number;
  place: "enter" | "submit";
  random: () => number;
  last?: string | null | undefined;
}): string {
  const all = greetingLines(now);
  const pool = all.filter((l) => l !== last);
  const line = pool[Math.floor(random() * pool.length)] ?? all[0] ?? "";
  return place === "submit" ? `${line} 응모를 접수하겠습니다.` : line;
}

/** 이 탭에서 바로 앞에 건넨 인사(같은 문장이 연달아 나오지 않게, 세션 안에서만) */
let lastLine: string | null = null;

/** 화면에서 쓰는 인사: 지금 시각과 Math.random, 바로 앞 인사를 피한다 */
export function greetNow(now: number, place: "enter" | "submit"): string {
  const text = pickGreeting({
    now,
    place,
    random: Math.random,
    last: lastLine,
  });
  lastLine = text.replace(/ 응모를 접수하겠습니다\.$/, "");
  return text;
}
