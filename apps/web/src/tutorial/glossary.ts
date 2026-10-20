/** 마이티 용어. 튜토리얼과 게임 화면 도움말이 같이 쓴다 */
export interface Term {
  id: string;
  term: string;
  meaning: string;
}

export const GLOSSARY: readonly Term[] = [
  {
    id: "trick",
    term: "트릭",
    meaning: "모두가 한 장씩 내는 한 바퀴. 한 판은 트릭 10번이다.",
  },
  {
    id: "lead",
    term: "선",
    meaning:
      "트릭에서 맨 처음 카드를 내는 사람. 트릭을 이긴 사람이 다음 선이 된다.",
  },
  {
    id: "point",
    term: "점수 카드",
    meaning: "10·J·Q·K·A. 네 무늬에 5장씩 모두 20장이다.",
  },
  {
    id: "goal",
    term: "공약",
    meaning: "여당이 가져오겠다고 약속하는 점수 카드 장수와 기루다.",
  },
  {
    id: "kiruda",
    term: "기루다",
    meaning: "으뜸 무늬. 다른 무늬 카드를 모두 이긴다.",
  },
  {
    id: "noKiruda",
    term: "노기루다",
    meaning: "기루다 없이 하는 공약. 이기면 점수가 2배다.",
  },
  {
    id: "declarer",
    term: "주공",
    meaning: "공약을 가장 높게 불러 당선된 사람. 여당의 우두머리.",
  },
  {
    id: "friend",
    term: "프렌드",
    meaning:
      "주공이 고른 같은 편 한 명. 정한 카드를 가진 사람이고, 그 카드를 낼 때 드러난다.",
  },
  {
    id: "ruling",
    term: "여당·야당",
    meaning: "주공과 프렌드가 여당, 나머지가 야당이다.",
  },
  {
    id: "kitty",
    term: "키티",
    meaning: "나눠 주고 남은 3장. 주공이 받아서 13장 중 3장을 버린다.",
  },
  {
    id: "mighty",
    term: "마이티",
    meaning: "♠A. 가장 센 카드다. 기루다가 ♠이면 ◆A가 마이티다.",
  },
  {
    id: "joker",
    term: "조커",
    meaning: "마이티 다음으로 센 카드. 선으로 내면 무늬를 정할 수 있다.",
  },
  {
    id: "jokerCall",
    term: "조커콜",
    meaning:
      "선이 ♣3(기루다가 ♣이면 ♠3)을 내며 외치면 조커를 가진 사람이 조커를 내야 하고, 그 조커는 힘을 잃는다.",
  },
  {
    id: "firstTrick",
    term: "초구",
    meaning: "첫 번째 트릭. 초구 프렌드는 첫 트릭을 이긴 사람이다.",
  },
  {
    id: "run",
    term: "런",
    meaning: "여당이 점수 카드 20장을 다 가져오는 것. 점수가 2배다.",
  },
  {
    id: "dealMiss",
    term: "딜미스",
    meaning: "점수 카드가 하나도 없는 등 너무 나쁜 패. 선언하면 다시 나눈다.",
  },
];

export function termOf(id: string): Term | undefined {
  return GLOSSARY.find((t) => t.id === id);
}
