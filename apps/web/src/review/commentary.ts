import type { Verdict } from "@/game/kit";

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: "좋은 수",
  fine: "괜찮은 수",
  slip: "아쉬운 수",
  bad: "나쁜 수",
};

/**
 * 가장 좋은 수보다 얼마나 손해인지(`loss`)로 평가한다. `steps`는 좋은·괜찮은·아쉬운 수의 위 경계.
 * 추측한 판의 평균이라 오차가 있어 작은 차이는 좋은 수로 본다
 */
export function verdictOf(
  loss: number,
  steps: readonly [number, number, number],
): Verdict {
  if (loss < steps[0]) return "good";
  if (loss < steps[1]) return "fine";
  if (loss < steps[2]) return "slip";
  return "bad";
}

export function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length;
}

/** 부호를 붙인 수: +1.2, −0.4 */
export function signed(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}
