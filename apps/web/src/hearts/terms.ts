import { type Card, rankPower, suitOf } from "@mighty/engine";
import { type PassDirection, SORT_SUIT_ORDER } from "@mighty/hearts-engine";

/** 화면용 손패 정렬: ♣ ◆ ♠ ♥, 같은 무늬는 낮은 숫자부터(윈도우 하트와 같다) */
export function sortHearts(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      SORT_SUIT_ORDER.indexOf(suitOf(a) as (typeof SORT_SUIT_ORDER)[number]) -
        SORT_SUIT_ORDER.indexOf(
          suitOf(b) as (typeof SORT_SUIT_ORDER)[number],
        ) || rankPower(a) - rankPower(b),
  );
}

export function directionLabel(direction: PassDirection): string {
  switch (direction) {
    case "left":
      return "왼쪽";
    case "right":
      return "오른쪽";
    case "across":
      return "맞은편";
    case "none":
      return "안 넘김";
  }
}
