import { type Bot, beginnerBot, heuristicBot, searchBot } from "@mighty/ai";

/** 0 입문, 1 중수, 2 고수. 저장해 둔 값(1 중수, 2 고수)이 그대로 이어지도록 입문을 0에 둔다 */
export type BotLevel = 0 | 1 | 2;

export const BOT_LEVELS: readonly {
  value: BotLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "정석을 모르고 초보가 흔히 하는 실수를 가끔 한다",
  },
  {
    value: 1,
    label: "중수",
    description: "마공·무늬 비우기 같은 정석대로 둔다",
  },
  {
    value: 2,
    label: "고수",
    description: "남의 패를 추측해 판 끝까지 수를 읽는다",
  },
];

/** 입문은 실수를 섞은 규칙 봇, 중수는 정석 규칙 봇, 고수는 남의 패를 추측해 끝까지 둬 보는 봇 */
export function botFor(level: BotLevel): Bot {
  return level === 2 ? searchBot : level === 0 ? beginnerBot : heuristicBot;
}

/** 봇 수 사이에 브라우저가 그림을 그리고 입력을 받게 한다 */
export function browserPace(next: () => void): void {
  setTimeout(next, 0);
}
