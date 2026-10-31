import { ByteWriter, taggedHash } from "./bytes";

/**
 * 회차 방(docs/36 11-23)의 서명 내용. 화면과 서버가 같이 쓴다.
 * 용도 태그가 응모권·확인·운영 기록과 달라 이 서명을 다른 곳에 돌려쓸 수 없다.
 */

export const ROOM_PASS_TAG = "stardraw/room-pass/v1";
export const ROOM_MOD_TAG = "stardraw/room-mod/v1";

/** 말 길이 상한(글자) */
export const ROOM_TEXT_MAX = 40;

/** 대화 표를 받을 때 우주인 패스키로 서명하는 내용: 회차와 서버가 준 한 번 쓰는 값(16바이트) */
export function roomPassMessage(round: number, nonce: Uint8Array): Uint8Array {
  return taggedHash(
    ROOM_PASS_TAG,
    new ByteWriter().u32(round).fixed(nonce, 16).done(),
  );
}

export type RoomModAction = "hide" | "kick";

/** 국장 조치(말 가리기·사람 내보내기)에 국장 패스키로 서명하는 내용 */
export function roomModMessage(
  round: number,
  action: RoomModAction,
  target: string,
  nonce: Uint8Array,
): Uint8Array {
  return taggedHash(
    ROOM_MOD_TAG,
    new ByteWriter().u32(round).fixed(nonce, 16).done(),
    new TextEncoder().encode(`${action}:${target}`),
  );
}

/** 글자 수(한글 한 자 = 1) */
export const roomCharCount = (text: string) => Array.from(text).length;
