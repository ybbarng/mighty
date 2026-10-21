import {
  type HeartsBot,
  heartsBeginnerBot,
  heartsNormalBot,
  heartsSearchBot,
} from "@mighty/hearts-ai";

import type { HeartsLevel } from "./settings";

export const HEARTS_LEVELS: readonly {
  value: HeartsLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "높은 카드를 쥐고 있다가 덥석 먹는 실수를 가끔 한다",
  },
  {
    value: 1,
    label: "중수",
    description: "높은 카드를 넘기고, 아래로 피하고, ♠Q를 떠넘긴다",
  },
  {
    value: 2,
    label: "고수",
    description: "남의 패를 추측해 판 끝까지 수를 읽는다",
  },
];

export function heartsBotFor(level: HeartsLevel): HeartsBot {
  return level === 2
    ? heartsSearchBot
    : level === 0
      ? heartsBeginnerBot
      : heartsNormalBot;
}
