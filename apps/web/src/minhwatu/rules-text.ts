import { DEAL_SIZES, type MinhwatuRules } from "@mighty/minhwatu-engine";

/** 규칙 한 줄 요약(시작 화면·방 만들기) */
export function describeRules(rules: MinhwatuRules): string {
  const deal = DEAL_SIZES[rules.players];
  const yaks = [
    `약 ${rules.yakScore}점`,
    rules.chodan ? "초단 있음" : "초단 없음",
    ...(rules.saodong ? ["사오동 있음"] : []),
  ];
  return [
    `${rules.players}명`,
    rules.rounds === 1 ? "한 판" : `${rules.rounds}판`,
    `손패 ${deal.hand}장·바닥 ${deal.floor}장`,
    ...yaks,
  ].join(" · ");
}
