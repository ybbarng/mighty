/**
 * 컴퓨터 기본 이름(내 다음 차례가 1번). 원작(Option.cpp `s_sPlayerName`)은 역대 대통령 이름을 썼지만,
 * 공개하는 게임이라 같은 결의 흔한 두 글자 이름으로 바꿨다.
 */
export const DEFAULT_BOT_NAMES = [
  "민준",
  "서연",
  "지호",
  "하린",
  "도윤",
  "수아",
] as const;

/** n번째 컴퓨터의 이름(1부터). 정해 두지 않았으면 기본 이름, 그것도 없으면 "컴퓨터 n" */
export function botName(names: readonly string[], index: number): string {
  return (
    names[index - 1]?.trim() ||
    DEFAULT_BOT_NAMES[index - 1] ||
    `컴퓨터 ${index}`
  );
}
