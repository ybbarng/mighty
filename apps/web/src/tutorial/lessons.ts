import {
  type Action,
  type Card,
  type GameEvent,
  isJoker,
  mightyOf,
  type PlayerView,
  presetRules,
  type ScenarioOptions,
} from "@mighty/engine";

const rules = presetRules("standard5");

export type MissionStatus = "success" | "fail" | null;

export interface MissionContext {
  view: PlayerView;
  /** 미션을 시작한 뒤 생긴 모든 이벤트 */
  events: readonly GameEvent[];
}

/** 화면에 보여 줄 짧은 글. `**굵게**`만 쓴다 */
export type Text = string;

export type Step =
  | {
      kind: "explain";
      title: string;
      body: Text[];
      cards?: Card[];
      terms?: string[];
    }
  | {
      kind: "quiz";
      question: Text;
      cards?: Card[];
      options: string[];
      answer: number;
      explain: Text;
    }
  | {
      kind: "mission";
      title: string;
      objective: Text;
      hint: Text;
      /** 정해진 장면. 없으면 처음부터 한 판 */
      scenario: Omit<ScenarioOptions, "rules"> | null;
      check: (ctx: MissionContext) => MissionStatus;
      success: Text;
      fail: Text;
      /** 테스트용: 성공해야 하는 행동과 실패해야 하는 행동 */
      solution?: Action[];
      mistake?: Action[];
    };

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  steps: Step[];
}

/** 트릭을 하나 끝냈을 때 내가 이겼는가 */
function wonFirstTrick({ events, view }: MissionContext): MissionStatus {
  const won = events.find((e) => e.type === "trickWon");
  if (won?.type !== "trickWon") return null;
  return won.seat === view.seat ? "success" : "fail";
}

export const LESSONS: readonly Lesson[] = [
  {
    id: "goal",
    title: "마이티는 어떤 게임?",
    summary: "목표: 점수 카드를 공약만큼 가져오기",
    steps: [
      {
        kind: "explain",
        title: "다섯 명, 53장",
        body: [
          "마이티는 다섯 명이 트럼프 52장에 **조커 1장**을 더해서 하는 카드 게임이에요.",
          "한 사람이 10장씩 받고, 남는 3장은 나중에 쓸 데가 있어요.",
          "모두가 한 장씩 내는 한 바퀴를 **트릭**이라고 하고, 한 판은 트릭 10번으로 끝나요.",
        ],
        terms: ["trick"],
      },
      {
        kind: "explain",
        title: "점수 카드",
        body: [
          "**10·J·Q·K·A**가 점수 카드예요. 무늬마다 5장씩, 모두 20장이에요.",
          "트릭을 이기면 그 트릭에 나온 점수 카드를 가져가요.",
        ],
        cards: ["S10", "HJ", "DQ", "CK", "SA"],
        terms: ["point"],
      },
      {
        kind: "explain",
        title: "여당과 야당",
        body: [
          '판을 시작할 때 "점수 카드를 몇 장 가져오겠다"고 **공약**을 걸어요. 가장 높게 부른 사람이 **주공**이 돼요.',
          "주공은 같은 편 한 명(**프렌드**)을 골라요. 주공과 프렌드가 **여당**, 나머지 세 명이 **야당**이에요.",
          "여당이 공약한 장수만큼 점수 카드를 가져오면 여당이 이기고, 못 하면 야당이 이겨요.",
        ],
        terms: ["goal", "declarer", "friend", "ruling"],
      },
      {
        kind: "quiz",
        question: "다음 중 **점수 카드가 아닌** 것은?",
        options: ["♠10", "♥9", "◆J", "♣A"],
        answer: 1,
        explain: "점수 카드는 10·J·Q·K·A예요. 9는 점수 카드가 아니에요.",
      },
      {
        kind: "quiz",
        question:
          "공약이 ♠15인데 여당이 점수 카드 14장을 가져왔어요. 누가 이겼을까요?",
        options: ["여당", "야당"],
        answer: 1,
        explain:
          "15장을 약속했는데 14장만 가져왔으니 공약을 못 지켰어요. 야당이 이겨요.",
      },
    ],
  },
  {
    id: "trick",
    title: "트릭 이기기",
    summary: "무늬 따라 내기, 높은 카드가 이긴다",
    steps: [
      {
        kind: "explain",
        title: "선 무늬를 따라 내요",
        body: [
          "트릭에서 맨 처음 내는 사람을 **선**이라고 해요.",
          "다른 사람은 선이 낸 무늬가 손에 있으면 **반드시 그 무늬를** 내야 해요. 없을 때만 아무 카드나 낼 수 있어요.",
          "게임 화면에서는 낼 수 있는 카드만 밝게 보여요.",
        ],
        terms: ["lead"],
      },
      {
        kind: "explain",
        title: "가장 높은 카드가 이겨요",
        body: [
          "선 무늬 중 가장 높은 카드를 낸 사람이 트릭을 가져가요. A가 가장 높고 2가 가장 낮아요.",
          "다른 무늬는 아무리 높아도 이기지 못해요(뒤에 배울 기루다는 빼고요).",
          "트릭을 이긴 사람이 다음 트릭의 선이 돼요.",
        ],
        cards: ["HA", "HK", "HQ", "HJ", "H10", "H9", "H2"],
      },
      {
        kind: "quiz",
        question:
          "선이 ♥7을 냈고, 이어서 ♥K, ♠A, ♥2, ♣Q가 나왔어요(기루다 없음). 누가 이길까요?",
        cards: ["H7", "HK", "SA", "H2", "CQ"],
        options: ["♥K", "♠A", "♣Q"],
        answer: 0,
        explain:
          "선 무늬는 ♥예요. ♠A와 ♣Q는 무늬가 달라서 이길 수 없고, ♥ 중에서는 K가 가장 높아요.",
      },
      {
        kind: "mission",
        title: "트릭을 이겨 보세요",
        objective: "다른 사람들이 ♥를 냈어요. **이 트릭을 가져오세요.**",
        hint: "♥ 중에서 가장 높은 카드를 내면 돼요.",
        scenario: {
          phase: "play",
          declarer: 1,
          goal: { kiruda: "NT", score: 13 },
          leader: 1,
          hands: [["HA", "H5"], ["HK"], ["H9"], ["H10"], ["HQ"]],
        },
        check: wonFirstTrick,
        success: "잘했어요! ♥A가 가장 높아서 트릭을 가져왔어요.",
        fail: "아쉬워요. ♥5로는 ♥K를 이길 수 없어요. 다시 해 볼까요?",
        solution: [{ type: "play", card: "HA" }],
        mistake: [{ type: "play", card: "H5" }],
      },
    ],
  },
  {
    id: "kiruda",
    title: "기루다",
    summary: "으뜸 무늬는 다른 무늬를 모두 이긴다",
    steps: [
      {
        kind: "explain",
        title: "으뜸 무늬, 기루다",
        body: [
          "공약을 걸 때 무늬 하나를 **기루다**로 정해요.",
          "기루다는 다른 무늬를 모두 이겨요. 기루다 2도 다른 무늬의 A를 이겨요.",
          "기루다끼리는 높은 쪽이 이겨요.",
        ],
        terms: ["kiruda"],
      },
      {
        kind: "explain",
        title: "잘라 먹기",
        body: [
          "선 무늬가 손에 있으면 그 무늬를 먼저 따라 내야 해서 기루다를 낼 수 없어요.",
          '선 무늬가 **없을 때** 기루다를 내서 트릭을 가져오는 걸 "잘라 먹는다"고 해요.',
        ],
      },
      {
        kind: "quiz",
        question:
          "기루다가 ♠예요. ♥A가 선으로 나오고 ♥K, ♠2, ♥Q, ◆A가 나왔어요. 누가 이길까요?",
        cards: ["HA", "HK", "S2", "HQ", "DA"],
        options: ["♥A", "♠2", "◆A"],
        answer: 1,
        explain: "♠가 기루다라서 가장 작은 ♠2도 다른 무늬를 모두 이겨요.",
      },
      {
        kind: "mission",
        title: "기루다로 잘라 먹기",
        objective:
          "기루다는 ♠예요. 다른 사람들이 ♥를 냈는데 나는 ♥가 없어요. **트릭을 가져오세요.**",
        hint: "♥가 없으니 기루다(♠)를 낼 수 있어요.",
        scenario: {
          phase: "play",
          declarer: 1,
          goal: { kiruda: "S", score: 13 },
          leader: 1,
          hands: [["S3", "D7"], ["HA"], ["HK"], ["HQ"], ["H2"]],
        },
        check: wonFirstTrick,
        success: "그렇죠! 가장 작은 기루다 ♠3이 ♥A를 이겼어요.",
        fail: "◆7은 선 무늬도 기루다도 아니라서 이길 수 없어요. 다시 해 볼까요?",
        solution: [{ type: "play", card: "S3" }],
        mistake: [{ type: "play", card: "D7" }],
      },
    ],
  },
  {
    id: "mighty",
    title: "마이티와 조커",
    summary: "가장 센 두 장",
    steps: [
      {
        kind: "explain",
        title: "마이티",
        body: [
          "**♠A가 마이티**예요. 기루다보다도 세서, 무엇이 나와도 이겨요.",
          "기루다가 ♠일 때는 **◆A**가 마이티예요.",
          "마이티는 선 무늬를 따라 내야 할 때도 언제든 낼 수 있어요.",
        ],
        cards: ["SA", "DA"],
        terms: ["mighty"],
      },
      {
        kind: "explain",
        title: "조커",
        body: [
          "**조커**는 마이티 다음으로 세요. 역시 언제든 낼 수 있어요.",
          "조커를 선으로 내면 다른 사람이 따라 낼 무늬를 정해요.",
          "첫 트릭과 마지막 트릭에는 조커를 낼 수 없어요(표준 규칙). 그래서 마지막 전에 써야 해요.",
        ],
        cards: ["JK"],
        terms: ["joker"],
      },
      {
        kind: "quiz",
        question: "기루다가 ♠일 때 마이티는 무엇일까요?",
        options: ["♠A", "◆A", "조커"],
        answer: 1,
        explain:
          "기루다가 ♠이면 ♠A는 그냥 가장 높은 기루다가 되고, 마이티는 ◆A로 바뀌어요.",
      },
      {
        kind: "quiz",
        question: "기루다가 ♥예요. ♥A, 조커, ♠A, ♥K가 나왔어요. 누가 이길까요?",
        cards: ["HA", "JK", "SA", "HK"],
        options: ["♥A", "조커", "♠A"],
        answer: 2,
        explain: "♠A가 마이티라서 조커와 기루다 A를 모두 이겨요.",
      },
      {
        kind: "mission",
        title: "마이티로 이기기",
        objective:
          "기루다는 ♥예요. 선이 기루다 A를 냈어요! **트릭을 가져오세요.**",
        hint: "♥2를 따라 낼 수도 있지만, 마이티는 언제든 낼 수 있어요.",
        scenario: {
          phase: "play",
          declarer: 1,
          goal: { kiruda: "H", score: 13 },
          leader: 1,
          hands: [["H2", "SA"], ["HA"], ["HK"], ["H5"], ["H6"]],
        },
        check: wonFirstTrick,
        success: "마이티는 기루다 A도 이겨요!",
        fail: "♥2로는 ♥A를 이길 수 없어요. 마이티(♠A)를 써 보세요.",
        solution: [{ type: "play", card: "SA" }],
        mistake: [{ type: "play", card: "H2" }],
      },
    ],
  },
  {
    id: "jokerCall",
    title: "조커콜",
    summary: "상대의 조커를 끌어내 힘을 빼앗기",
    steps: [
      {
        kind: "explain",
        title: "조커콜",
        body: [
          '선이 **♣3**을 내며 "조커콜!"을 외치면, 조커를 가진 사람은 조커를 내야 해요.',
          "이렇게 끌려 나온 조커는 힘을 잃어서 가장 약한 카드가 돼요.",
          "기루다가 ♣일 때는 **♠3**이 조커콜 카드예요. 조커가 이미 나왔으면 조커콜은 의미가 없어요.",
        ],
        cards: ["C3", "S3"],
        terms: ["jokerCall"],
      },
      {
        kind: "quiz",
        question: "기루다가 ♣일 때 조커콜 카드는 무엇일까요?",
        options: ["♣3", "♠3", "♥3"],
        answer: 1,
        explain: "♣3은 기루다 카드가 되어 버리니까, 대신 ♠3이 조커콜 카드예요.",
      },
      {
        kind: "mission",
        title: "조커 끌어내기",
        objective:
          "내가 선이에요. 누군가 조커를 갖고 있어요. **조커콜로 조커를 끌어내세요.**",
        hint: '♣3을 누르고 "조커콜!"을 고르세요.',
        scenario: {
          phase: "play",
          declarer: 0,
          goal: { kiruda: "H", score: 13 },
          leader: 0,
          hands: [["C3", "D2"], ["C9"], ["JK", "C2"], ["C10"], ["CQ"]],
        },
        check: ({ events }) => {
          const calledJoker = events.some(
            (e) => e.type === "played" && isJoker(e.card),
          );
          const called = events.some((e) => e.type === "played" && e.jokerCall);
          if (called && calledJoker) return "success";
          return events.some((e) => e.type === "trickWon") ? "fail" : null;
        },
        success: "조커가 끌려 나와 힘을 잃었어요. 이게 조커콜이에요!",
        fail: "조커콜을 외치지 않으면 상대가 조커를 아껴 둘 수 있어요. ♣3을 내며 조커콜을 골라 보세요.",
        solution: [{ type: "play", card: "C3", jokerCall: true }],
        mistake: [{ type: "play", card: "C3", jokerCall: false }],
      },
    ],
  },
  {
    id: "election",
    title: "공약 걸기",
    summary: "기루다와 숫자 정하기",
    steps: [
      {
        kind: "explain",
        title: "출마",
        body: [
          "판이 시작되면 돌아가며 공약을 불러요. **숫자**는 여당이 가져올 점수 카드 장수예요(13~20).",
          "앞사람보다 **숫자가 커야** 해요. 부르기 싫으면 **포기**해요.",
          "다른 사람이 모두 포기하면 마지막으로 부른 사람이 당선돼요.",
        ],
        terms: ["goal"],
      },
      {
        kind: "explain",
        title: "어떤 무늬를 기루다로?",
        body: [
          "내 손에 **많고 높은** 무늬를 기루다로 고르세요. 마이티와 조커가 있으면 더 높이 불러도 좋아요.",
          '게임 화면의 공약 패널에 "이 패라면 어디까지 노려볼 만한지" 도움말이 나와요.',
          "기루다 없이 하는 **노기루다**도 있어요. 어렵지만 이기면 점수가 2배예요.",
        ],
        cards: ["SA", "JK", "HA", "HK", "HQ", "H9", "H5", "DA", "C2", "D3"],
        terms: ["noKiruda"],
      },
      {
        kind: "quiz",
        question:
          "위 패(♠A, 조커, ♥A·K·Q·9·5, ◆A, ♣2, ◆3)라면 어느 무늬를 기루다로 하면 좋을까요?",
        cards: ["SA", "JK", "HA", "HK", "HQ", "H9", "H5", "DA", "C2", "D3"],
        options: ["♠", "♥", "◆"],
        answer: 1,
        explain:
          "♥가 5장이고 A·K·Q까지 있어요. 마이티(♠A)와 조커는 기루다와 상관없이 강하니 덤이에요.",
      },
      {
        kind: "quiz",
        question: "앞사람이 ♠14를 불렀어요. 내가 부를 수 있는 공약은?",
        options: ["♥14", "♥15", "노기루다 14"],
        answer: 1,
        explain:
          "표준 규칙에서는 무늬와 상관없이 숫자가 커야 해요. 14보다 큰 15부터 부를 수 있어요.",
      },
    ],
  },
  {
    id: "declarer",
    title: "주공이 되면",
    summary: "바닥 카드 받기와 3장 묻기",
    steps: [
      {
        kind: "explain",
        title: "바닥 카드",
        body: [
          "당선되면 가운데 엎어 둔 **바닥 카드** 3장을 가져와요. 그러면 13장이 되고, 그중 쓸모없는 3장을 다시 바닥에 묻어요(버려요).",
          "버린 카드 속 점수 카드도 여당 득점으로 쳐요.",
        ],
        terms: ["kitty"],
      },
      {
        kind: "explain",
        title: "무엇을 버릴까",
        body: [
          "마이티, 조커, 기루다는 남기세요.",
          "장수가 적은 무늬를 버려서 **비워 두면**, 그 무늬가 선으로 나올 때 기루다로 잘라 먹을 수 있어요.",
          "이때 공약을 바꿀 수도 있어요. 같은 기루다면 숫자를 올리기만 하고, 기루다를 바꾸면 **2 이상** 올려야 해요.",
        ],
      },
      {
        kind: "quiz",
        question:
          "♠15로 당선됐어요. 기루다를 ♥로 바꾸려면 최소 몇을 불러야 할까요?",
        options: ["15", "16", "17"],
        answer: 2,
        explain: "기루다를 바꾸면 2 이상 올려야 해요. 15 + 2 = 17이에요.",
      },
      {
        kind: "mission",
        title: "3장 버리기",
        objective:
          "♠14로 당선됐어요(마이티는 ◆A). **바닥 카드를 받은 13장 중 3장을 묻으세요.** 마이티·조커·기루다는 남기세요.",
        hint: "♣와 ♥가 짧아요. 그쪽 낮은 카드를 버려 보세요.",
        scenario: {
          phase: "exchange",
          declarer: 0,
          goal: { kiruda: "S", score: 14 },
          hands: [
            ["SA", "SK", "SQ", "S10", "S7", "S4", "DA", "JK", "D9", "D6"],
            [],
            [],
            [],
            [],
          ],
          kitty: ["C4", "H3", "C8"],
        },
        check: ({ events, view }) => {
          if (!events.some((e) => e.type === "exchanged")) return null;
          const mighty = mightyOf(view.rules, "S");
          const kept = (view.discarded ?? []).every(
            (c) => c !== mighty && !isJoker(c) && !c.startsWith("S"),
          );
          return kept ? "success" : "fail";
        },
        success: "좋아요! 강한 카드는 지키고 약한 카드를 버렸어요.",
        fail: "마이티·조커·기루다(♠)를 버리면 아까워요. 다시 해 볼까요?",
        solution: [
          {
            type: "exchange",
            goal: { kiruda: "S", score: 14 },
            discard: ["C4", "H3", "C8"],
          },
        ],
        mistake: [
          {
            type: "exchange",
            goal: { kiruda: "S", score: 14 },
            discard: ["DA", "C4", "H3"],
          },
        ],
      },
    ],
  },
  {
    id: "friend",
    title: "프렌드",
    summary: "같은 편을 카드로 고르기",
    steps: [
      {
        kind: "explain",
        title: "프렌드 고르기",
        body: [
          '주공은 카드 한 장을 골라 "이 카드를 가진 사람이 내 프렌드"라고 정해요. 마이티 프렌드, 조커 프렌드가 흔해요.',
          "그 카드를 낼 때까지는 주공도 프렌드가 누구인지 몰라요.",
          "**초구 프렌드**는 첫 트릭을 이긴 사람, **노프렌드**는 혼자 하는 거예요(이기면 더 많이 받아요).",
        ],
        terms: ["friend", "firstTrick"],
      },
      {
        kind: "quiz",
        question: "내 손에 마이티가 있어요. 마이티 프렌드를 부를 수 있을까요?",
        options: ["있다", "없다"],
        answer: 1,
        explain:
          "내 손이나 버린 카드는 프렌드로 고를 수 없어요. 내 손에 없는 강한 카드를 고르세요.",
      },
      {
        kind: "mission",
        title: "프렌드 정하기",
        objective:
          "♥15 주공이에요. **내 손에 없는 강한 카드로 프렌드를 정하세요.**",
        hint: "마이티(♠A)나 조커가 내 손에 없어요. 둘 중 하나를 골라 보세요.",
        scenario: {
          phase: "friend",
          declarer: 0,
          goal: { kiruda: "H", score: 15 },
          hands: [
            ["HA", "HK", "HQ", "H10", "H8", "H6", "D9", "C9", "D4", "C2"],
            [],
            [],
            [],
            [],
          ],
          discarded: ["D2", "C3", "S4"],
        },
        check: ({ events }) => {
          const declared = events.find((e) => e.type === "friendDeclared");
          if (declared?.type !== "friendDeclared") return null;
          const f = declared.friend;
          return f.kind === "card" && (f.card === "SA" || f.card === "JK")
            ? "success"
            : "fail";
        },
        success: "마이티나 조커를 가진 사람은 든든한 프렌드예요!",
        fail: "정할 수는 있지만, 마이티나 조커처럼 확실히 강한 카드를 고르는 게 좋아요.",
        solution: [{ type: "friend", friend: { kind: "card", card: "SA" } }],
        mistake: [{ type: "friend", friend: { kind: "card", card: "D10" } }],
      },
    ],
  },
  {
    id: "score",
    title: "점수 계산",
    summary: "공약이 높을수록 많이 번다",
    steps: [
      {
        kind: "explain",
        title: "얼마나 주고받나",
        body: [
          "여당이 이기면 기본 점수는 **(공약 − 13) × 2 + (득점 − 공약)**이에요. 높게 걸수록 많이 벌어요.",
          "여당이 지면 **공약 − 득점**만큼 내요.",
          "야당 한 사람이 그만큼씩 내고(받고), 주공은 2배, 프렌드는 1배를 받아요(내요).",
          "**런**(20장 다 가져오기)과 **노기루다** 승리는 2배예요.",
        ],
        terms: ["run"],
      },
      {
        kind: "quiz",
        question: "♥15 공약에 여당이 17장을 가져왔어요. 기본 점수는?",
        options: ["2", "4", "6", "8"],
        answer: 2,
        explain: "(15 − 13) × 2 + (17 − 15) = 4 + 2 = 6이에요.",
      },
      {
        kind: "quiz",
        question:
          "♥15 공약에 여당이 12장만 가져왔어요. 야당 한 사람이 받는 기본 점수는?",
        options: ["1", "3", "5"],
        answer: 1,
        explain: "지면 공약 − 득점 = 15 − 12 = 3이에요.",
      },
    ],
  },
  {
    id: "practice",
    title: "실전 한 판",
    summary: "도움말을 켜고 끝까지 해 보기",
    steps: [
      {
        kind: "explain",
        title: "이제 한 판!",
        body: [
          "배운 것을 모두 써서 컴퓨터 4명과 한 판을 끝까지 해 봐요.",
          "이번 판에는 **추천 카드**에 빛이 나요. 따라 해도 되고, 내 생각대로 해도 돼요.",
          '모르는 말이 나오면 게임 화면의 "설정"에서 다시 볼 수 있어요.',
        ],
      },
      {
        kind: "mission",
        title: "한 판 끝까지",
        objective: "**한 판을 끝까지 해 보세요.** 이기든 지든 괜찮아요.",
        hint: "빛나는 카드가 컴퓨터가 추천하는 카드예요.",
        scenario: null,
        check: ({ events }) =>
          events.some((e) => e.type === "roundScored") ? "success" : null,
        success: "튜토리얼을 모두 마쳤어요! 이제 마이티를 할 줄 알아요.",
        fail: "",
      },
    ],
  },
];

export { rules as TUTORIAL_RULES };
