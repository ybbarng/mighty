import { displayRound, type Schedule } from "@mighty/stardraw-core";

/**
 * 화면에 보이는 회차 이름(docs/36 11-6). 서버 장부는 단계가 있어 "시험 12회"·"정식 1회",
 * 단계가 없는 기기 안 연습 장부는 예전처럼 "제 12회"다. 공유 주소·데이터는 늘 사슬 회차 번호를 쓴다
 */
export function roundTitle(schedule: Schedule, round: number): string {
  const d = safeDisplay(schedule, round);
  return d.phase ? d.label : `제 ${round}회`;
}

/** 짧은 이름: "시험 12회"·"정식 1회", 연습 장부는 "12회" */
export function roundShort(schedule: Schedule, round: number): string {
  return safeDisplay(schedule, round).label;
}

function safeDisplay(schedule: Schedule, round: number) {
  return round >= 1
    ? displayRound(schedule, round)
    : { phase: null, number: round, label: `${round}회` };
}
