/**
 * 게임 등록부. 첫 화면(게임 목록)이 이 순서대로 보여 준다(docs/18 5절, docs/19).
 * 새 게임은 여기에 한 줄 더하고 `app/<id>/page.tsx`를 둔다.
 */
export type GameEntry = {
  id: "mighty" | "hearts" | "omok";
  name: string;
  englishName: string;
  /** 목록에 보일 한 줄 설명 */
  tagline: string;
  players: string;
  path: string;
};

export const GAMES: readonly GameEntry[] = [
  {
    id: "omok",
    name: "오목",
    englishName: "Gomoku",
    tagline: "다섯 개를 먼저 잇는 사람이 이긴다. 일반·자유·렌주 규칙",
    players: "2명",
    path: "/omok",
  },
  {
    id: "mighty",
    name: "마이티",
    englishName: "Mighty",
    tagline: "공약을 걸고, 프렌드를 찾고, 마이티로 뒤집는 대학가 카드게임",
    players: "2~7명",
    path: "/mighty",
  },
  {
    id: "hearts",
    name: "하트",
    englishName: "Hearts",
    tagline: "하트와 스페이드 Q를 피하는 윈도우 하트",
    players: "4명",
    path: "/hearts",
  },
];
