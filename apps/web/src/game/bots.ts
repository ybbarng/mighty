import { type Bot, heuristicBot, searchBot } from "@mighty/ai";

export type BotLevel = 1 | 2;

export const BOT_LEVELS: readonly { value: BotLevel; label: string }[] = [
  { value: 1, label: "보통" },
  { value: 2, label: "고수" },
];

/** 1단계는 규칙 기반, 2단계는 남의 패를 추측해 끝까지 둬 보고 카드를 고른다 */
export function botFor(level: BotLevel): Bot {
  return level === 2 ? searchBot : heuristicBot;
}
