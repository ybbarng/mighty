import { cardOf, MONTH_NAMES } from "@mighty/hwatu";

import type { Action, Bak, Settlement, Special } from "./state";

/** 화면·해설에 쓰는 이름 */
export const SPECIAL_NAMES: Record<Special, string> = {
  ppeok: "뻑",
  jjok: "쪽",
  ttadak: "따닥",
  sweep: "싹쓸이",
  stack: "뻑 먹기",
  selfStack: "자뻑",
  shake: "흔들기",
  bomb: "폭탄",
};

export const BAK_NAMES: Record<Bak, string> = {
  pi: "피박",
  gwang: "광박",
  meong: "멍박",
  go: "고박",
};

/** 행동 한 줄 설명(복기) */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "play":
      return `${cardOf(action.card).name}${action.shake ? " 흔들고" : ""} 내기`;
    case "bomb":
      return `${MONTH_NAMES[action.month]} 폭탄`;
    case "flip":
      return "뒤집기만";
    case "choose":
      return `${cardOf(action.card).name} 먹기`;
    case "go":
      return "고";
    case "stop":
      return "스톱";
    case "continue":
      return "다음 판";
    case "retire":
      return "그만두기";
  }
}

/** 정산 내역 줄(광 3점, 고도리 5점, 2고 +2 …). 판 끝 결과 상자에 쓴다 */
export function settlementLines(s: Settlement): string[] {
  if (s.kind === "nagari") return ["아무도 점수를 못 냈다(나가리)"];
  if (s.kind === "chongtong")
    return [`총통(${s.month ? MONTH_NAMES[s.month] : ""} 넉 장) ${s.points}점`];
  const b = s.breakdown;
  const lines: string[] = [];
  if (b) {
    if (b.gwang) lines.push(`광 ${b.counts.gwang}장 ${b.gwang}점`);
    if (b.animal) lines.push(`열끗 ${b.counts.animal}장 ${b.animal}점`);
    if (b.ribbon) lines.push(`띠 ${b.counts.ribbon}장 ${b.ribbon}점`);
    if (b.pi) lines.push(`피 ${b.counts.pi}장 ${b.pi}점`);
    if (b.godori) lines.push(`고도리 ${b.godori}점`);
    if (b.hongdan) lines.push(`홍단 ${b.hongdan}점`);
    if (b.cheongdan) lines.push(`청단 ${b.cheongdan}점`);
    if (b.chodan) lines.push(`초단 ${b.chodan}점`);
    if (b.gukjinAsPi) lines.push("국진은 쌍피로");
  }
  if (s.goCount > 0) lines.push(`${s.goCount}고 +${s.goBonus}`);
  if (s.goDouble > 1) lines.push(`${s.goCount}고 ×${s.goDouble}`);
  if (s.shakeDouble > 1) lines.push(`흔들기·폭탄 ×${s.shakeDouble}`);
  if (s.nagariDouble > 1) lines.push(`나가리 ×${s.nagariDouble}`);
  return lines;
}
