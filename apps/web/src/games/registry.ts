/**
 * 게임 등록부. 첫 화면(게임 목록)이 이 순서대로 보여 준다(docs/18 5절, docs/19).
 * 새 게임은 여기에 한 줄 더하고 `app/<id>/page.tsx`를 둔다.
 */
export type GameEntry = {
  id:
    | "mighty"
    | "hearts"
    | "omok"
    | "janggi"
    | "chess"
    | "baduk"
    | "nyrongppong"
    | "gostop"
    | "minhwatu"
    | "baseball";
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
    id: "janggi",
    name: "장기",
    englishName: "Janggi",
    tagline:
      "차·포·마·상으로 상대 궁을 외통으로 몬다. 상차림부터 한국 장기 그대로",
    players: "2명",
    path: "/janggi",
  },
  {
    id: "baduk",
    name: "바둑",
    englishName: "Baduk",
    tagline: "돌을 번갈아 놓아 더 넓게 차지한다. 9·13·19줄",
    players: "2명",
    path: "/baduk",
  },
  {
    id: "chess",
    name: "체스",
    englishName: "Chess",
    tagline:
      "킹을 체크메이트하면 이긴다. 캐슬링·앙파상·승급까지 국제 규칙 그대로",
    players: "2명",
    path: "/chess",
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
  {
    id: "gostop",
    name: "고스톱",
    englishName: "Go-Stop",
    tagline: "같은 달끼리 짝 맞춰 먹고, 점수가 나면 고? 스톱? 맞고·셋이서",
    players: "2~3명",
    path: "/gostop",
  },
  {
    id: "minhwatu",
    name: "민화투",
    englishName: "Minhwatu",
    tagline: "같은 달끼리 짝을 맞춰 먹는 화투. 초약·풍약·비약, 홍단·청단",
    players: "2~4명",
    path: "/minhwatu",
  },
  {
    id: "nyrongppong",
    name: "나이롱뽕",
    englishName: "Nairong-ppong",
    tagline: "화투로 하는 뽕! 같은 달 두 장이면 뽕, 손패 합을 가장 작게",
    players: "2~5명",
    path: "/nyrongppong",
  },
  {
    id: "baseball",
    name: "숫자야구",
    englishName: "Number Baseball",
    tagline:
      "숨긴 수를 스트라이크·볼로 좁혀 먼저 맞힌다. 비밀 수는 각자 기기에만",
    players: "1~2명",
    path: "/baseball",
  },
];
