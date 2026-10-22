/** 다시 돌린 기록에서 판의 처음(나눠 준 걸음)과 끝(점수를 매긴 걸음) 찾기. 마이티·하트 공통 */
export interface RoundSpan {
  number: number;
  /** 판을 시작한 걸음 */
  start: number;
  /** 점수를 매긴 걸음(아직 안 끝났으면 null) */
  end: number | null;
}

export function roundSpans(
  events: readonly (readonly { type: string }[])[],
  roundNumberAt: (index: number) => number,
): RoundSpan[] {
  const spans: RoundSpan[] = [];
  for (const [i, list] of events.entries()) {
    if (list.some((e) => e.type === "roundStarted"))
      spans.push({ number: roundNumberAt(i), start: i, end: null });
    const last = spans.at(-1);
    if (last && list.some((e) => e.type === "roundScored")) last.end = i;
  }
  return spans;
}
