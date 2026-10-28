import {
  type NyrongppongBot,
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
} from "./bots";
import { nyrongppongExpertBot } from "./expert";

export * from "./bots";
export * from "./expert";
export * from "./simulate";

/** 실력 단계(0 입문, 1 중수, 2 고수) */
export function nyrongppongBotFor(level: number): NyrongppongBot {
  if (level <= 0) return nyrongppongBeginnerBot;
  if (level === 1) return nyrongppongIntermediateBot;
  return nyrongppongExpertBot;
}
