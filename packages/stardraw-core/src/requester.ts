/**
 * 당첨자 확인의 "확인하는 분 이름"(docs/36 11-2, 11-9). 이름은 요청을 보내는 사람이 직접 적는다.
 * 서버(카노푸스 우주국)는 전달만 하므로, 이름 칸으로 우주국·운영자 행세를 하지 못하게 막는다.
 * 공백·기호를 섞거나 전각 글자로 쓴 꼴도 같은 말로 본다. 서버가 거절하고 화면도 미리 막는다.
 * 진짜 우주국이 보내는 것은 서버 서명 열쇠의 서명으로만 표시한다(확인 요청에는 서명이 없다).
 */
export const MAX_REQUESTER = 40;

/** 이름에 들어가면 안 되는 말(글자·숫자만 남긴 소문자 꼴로 비교) */
export const RESERVED_REQUESTER_WORDS = [
  "우주국",
  "국장",
  "카노푸스",
  "운영",
  "canopus",
  "kanopus",
] as const;

/** 비교용 꼴: 호환 글자를 펴고(NFKC) 소문자로, 글자·숫자만 남긴다 */
export function requesterFold(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** 이름이 쓸 수 없으면 그 까닭, 쓸 수 있으면 null */
export function requesterProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || [...trimmed].length > MAX_REQUESTER)
    return `확인하는 분 이름은 1~${MAX_REQUESTER}자입니다`;
  const folded = requesterFold(trimmed);
  if (RESERVED_REQUESTER_WORDS.some((w) => folded.includes(w)))
    return "우주국·운영자로 보이는 이름은 쓸 수 없습니다";
  return null;
}
