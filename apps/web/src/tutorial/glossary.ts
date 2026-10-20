/**
 * 마이티 용어. 튜토리얼과 게임 화면 도움말이 같이 쓴다.
 *
 * 표제어는 원작(마이티 네트워크)이 화면에 쓰던 말을 따른다. 오프라인에서 흔히 쓰는 줄임말과
 * 다른 카드 게임(트릭 테이킹 게임)에서 같은 것을 부르는 이름을 함께 적는다.
 * 출처와 고른 까닭은 docs/11-terms.md.
 */
export interface Term {
  id: string;
  term: string;
  meaning: string;
  /** 마이티를 하는 사람들이 쓰는 다른 이름·줄임말 */
  aka?: string;
  /** 다른 카드 게임(보드게임)에서 흔히 부르는 이름 */
  general?: string;
  /** 용어 사전에서 묶는 곳 */
  group: "basic" | "play" | "slang";
}

export const TERM_GROUPS: readonly { id: Term["group"]; name: string }[] = [
  { id: "basic", name: "기본" },
  { id: "play", name: "진행과 전략" },
  { id: "slang", name: "마이티 은어" },
];

export const GLOSSARY: readonly Term[] = [
  {
    id: "trick",
    term: "턴",
    meaning:
      "모두가 한 장씩 내는 한 바퀴. 가장 센 카드를 낸 사람이 그 턴을 이겨 나온 카드를 가져간다. 한 판은 10턴이다.",
    aka: "구(첫 턴은 초구, 마지막 턴은 막구, 2구·3구…)",
    general: "트릭",
    group: "basic",
  },
  {
    id: "lead",
    term: "선",
    meaning:
      "턴에서 맨 처음 카드를 내는 사람. 턴을 이긴 사람이 다음 선이 된다. 첫 턴의 선은 주공이다.",
    general: "리드(lead)",
    group: "basic",
  },
  {
    id: "follow",
    term: "무늬 따라 내기",
    meaning:
      "선이 낸 무늬가 손에 있으면 반드시 그 무늬를 내야 한다. 없을 때만 다른 카드를 낼 수 있다. 마이티와 조커는 언제든 낼 수 있다.",
    general: "팔로우(follow suit)",
    group: "basic",
  },
  {
    id: "point",
    term: "점수 카드",
    meaning: "10·J·Q·K·A. 네 무늬에 5장씩 모두 20장이다.",
    aka: "점카",
    general: "카운터, 포인트 카드",
    group: "basic",
  },
  {
    id: "election",
    term: "선거",
    meaning:
      "판마다 주공을 뽑는 단계. 딜러부터 돌아가며 공약을 걸고(출마), 부르기 싫으면 출마를 포기한다. 남은 한 사람이 당선된다.",
    aka: "출마, 포기(패스), 당선",
    general: "비딩, 경매",
    group: "basic",
  },
  {
    id: "goal",
    term: "공약",
    meaning:
      "여당이 가져오겠다고 약속하는 점수 카드 장수(목표 점수)와 기루다. 예: ♥15는 기루다 ♥로 점수 카드 15장.",
    aka: "숫자는 둘(12)·셋(13)·넷·닷·섯·곱·덜·홉·풀(20)로 부르고 무늬를 붙인다: 셋트(♥13), 둘노(노기루다 12)",
    general: "비드, 계약(contract)",
    group: "basic",
  },
  {
    id: "kiruda",
    term: "기루다",
    meaning:
      "그 판의 으뜸 무늬. 기루다는 다른 무늬 카드를 모두 이긴다. 공약을 걸 때 정한다.",
    aka: "기",
    general: "트럼프, 으뜸패",
    group: "basic",
  },
  {
    id: "noKiruda",
    term: "노기루다",
    meaning: "기루다 없이 하는 공약. 이기면 점수가 2배다.",
    aka: "노기, 노",
    general: "노트럼프(NT)",
    group: "basic",
  },
  {
    id: "declarer",
    term: "주공",
    meaning:
      "선거에서 당선된 사람. 바닥 카드를 받고, 프렌드를 정하고, 첫 턴의 선이 된다.",
    general: "디클러러(declarer)",
    group: "basic",
  },
  {
    id: "friend",
    term: "프렌드",
    meaning:
      "주공이 고른 같은 편 한 명. 보통 카드 한 장을 정하고, 그 카드를 가진 사람이 프렌드다. 그 카드를 낼 때 드러난다.",
    aka: "프(마프는 마이티 프렌드, 쪼프는 조커 프렌드), 원작 표기는 프랜드",
    general: "파트너",
    group: "basic",
  },
  {
    id: "ruling",
    term: "여당·야당",
    meaning:
      "주공과 프렌드가 여당, 나머지가 야당이다. 원작은 선거·출마·당선·정권처럼 정치에 빗댄 말을 쓴다.",
    general: "디클러러 편·수비 편(디펜더)",
    group: "basic",
  },
  {
    id: "kitty",
    term: "바닥 카드",
    meaning:
      "나눠 주고 남아 가운데 엎어 둔 3장. 당선된 주공이 가져가 13장 중 3장을 다시 바닥에 묻는다(버린다).",
    aka: "원작에서는 나머지 카드, 추가 카드",
    general: "키티(kitty), 위도(widow)",
    group: "basic",
  },
  {
    id: "mighty",
    term: "마이티",
    meaning:
      "♠A. 가장 센 카드이고 언제든 낼 수 있다. 기루다가 ♠이면 ◆A가 마이티다.",
    aka: "마, ◆A 마이티는 빨마(빨간 마이티)",
    group: "basic",
  },
  {
    id: "joker",
    term: "조커",
    meaning:
      "마이티 다음으로 센 카드. 언제든 낼 수 있고, 선으로 내면 따라 낼 무늬를 정한다.",
    aka: "쪼",
    group: "basic",
  },
  {
    id: "jokerCall",
    term: "조커콜",
    meaning:
      "선이 ♣3(기루다가 ♣이면 ♠3)을 내며 외치면 조커를 가진 사람이 조커를 내야 하고, 그 조커는 힘을 잃는다.",
    aka: "쪼콜, 총. 끌려 나온 조커는 쪼끌",
    group: "basic",
  },
  {
    id: "firstTrick",
    term: "초구",
    meaning:
      "첫 번째 턴. 초구 프렌드는 첫 턴을 이긴 사람이 프렌드가 되는 것이다. 마지막 턴은 막구다.",
    aka: "첫 턴",
    group: "play",
  },
  {
    id: "noFriend",
    term: "노프렌드",
    meaning: "프렌드 없이 주공 혼자 하는 것. 이기면 점수가 2배다.",
    aka: "노프",
    group: "play",
  },
  {
    id: "dealer",
    term: "딜러",
    meaning:
      "카드를 나눠 주고 선거에서 가장 먼저 공약을 부르는 사람. 규칙에 따라 전 판의 프렌드가 맡기도 한다.",
    group: "play",
  },
  {
    id: "dealMiss",
    term: "딜미스",
    meaning:
      "점수 카드가 하나도 없는 등 너무 나쁜 패. 선언하면 다시 나눈다. 규칙마다 조건이 다르다.",
    aka: "딜 미스, 딜미",
    general: "미스딜(misdeal)",
    group: "play",
  },
  {
    id: "run",
    term: "런",
    meaning:
      "여당이 점수 카드 20장을 다 가져오는 것. 거꾸로 야당이 많이 가져가 크게 지는 것은 백런이다. 규칙에 따라 점수를 2배로 친다.",
    aka: "백런",
    general: "슬램(slam)",
    group: "play",
  },
  {
    id: "cut",
    term: "간",
    meaning:
      "선 무늬가 없어서 기루다를 내 그 턴을 가져가는 것. 주로 야당이 주공의 턴을 빼앗을 때 쓴다.",
    aka: "간 치다",
    general: "러프(ruff), 컷, 트럼프로 잘라 먹기",
    group: "play",
  },
  {
    id: "loser",
    term: "물패",
    meaning: "이길 수 없는 낮은 카드. 주공은 판 끝무렵 물패를 털어야 한다.",
    general: "로서(loser)",
    group: "play",
  },
  {
    id: "duck",
    term: "흘리기",
    meaning: "이길 수 있어도 일부러 낮은 카드를 내 턴을 넘겨주는 것.",
    general: "더킹(ducking)",
    group: "play",
  },
  {
    id: "top",
    term: "탑",
    meaning: "어떤 무늬에서 아직 나오지 않은 카드 중 가장 센 카드.",
    aka: "탑카, 아빠(두 번째는 엄마)",
    general: "마스터 카드",
    group: "play",
  },
  {
    id: "suits",
    term: "무늬 부르는 말",
    meaning: "♠ 삽, ◆ 다리, ♥ 트, ♣ 끌(클). 기루다는 기, 노기루다는 노.",
    group: "slang",
  },
  {
    id: "ranks",
    term: "카드 부르는 말",
    meaning:
      "A 아, K 카, Q 큐, J 자, 10 텐. 기아는 기루다 A, 기카는 기루다 K, 마쪼는 마이티와 조커를 함께 든 것.",
    group: "slang",
  },
  {
    id: "numbers",
    term: "공약 숫자 부르는 말",
    meaning:
      "12 둘, 13 셋, 14 넷, 15 닷, 16 섯, 17 곱, 18 덜, 19 홉, 20 풀. 셋삽은 ♠13, 풀노는 노기루다 20.",
    group: "slang",
  },
];

export function termOf(id: string): Term | undefined {
  return GLOSSARY.find((t) => t.id === id);
}
