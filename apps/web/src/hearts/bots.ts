import {
  type HeartsBot,
  heartsBeginnerBot,
  heartsIntermediateBot,
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
    description: "높은 카드를 쥐고 있다가 덥석 먹는 실수를 자주 한다",
  },
  {
    value: 1,
    label: "중수",
    description:
      "높은 카드를 넘기고, 아래로 피하고, ♠Q를 떠넘긴다. 가끔 실수한다",
  },
  {
    value: 2,
    label: "고수",
    description:
      "많이 해 본 사람처럼 넘길 카드까지 계산하고 하트·높은 카드를 세며 수를 읽는다. 컴퓨터마다 성향이 다르다",
  },
];

export function heartsBotFor(level: HeartsLevel): HeartsBot {
  return level === 2
    ? heartsSearchBot
    : level === 0
      ? heartsBeginnerBot
      : heartsIntermediateBot;
}
