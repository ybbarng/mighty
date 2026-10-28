import {
  type Action,
  type GameEvent,
  type MinhwatuRules,
  type MinhwatuScenarioOptions,
  type MinhwatuView,
  STANDARD_RULES,
} from "@mighty/minhwatu-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 자리별 손패·바닥·더미·먹은 패(0번이 나) */
export type MinhwatuScene = Omit<MinhwatuScenarioOptions, "rules">;
export type MinhwatuLesson = Lesson<
  MinhwatuView,
  GameEvent,
  MinhwatuScene,
  Action
>;
type Context = MissionContext<MinhwatuView, GameEvent>;

/** 튜토리얼은 3명 한 판, 기본 약으로 한다 */
export const MINHWATU_TUTORIAL_RULES: MinhwatuRules = {
  ...STANDARD_RULES,
  rounds: 1,
};

/** 내가 처음 낸 패의 사건 */
function myFirstPlay({ view, events }: Context) {
  const played = events.find(
    (e) => e.type === "played" && e.seat === view.seat,
  );
  return played?.type === "played" ? played : null;
}

/** 내 첫 패로 이 카드를 먹었으면 성공 */
function tookWithFirst(card: string) {
  return (ctx: Context): MissionStatus => {
    const played = myFirstPlay(ctx);
    if (!played) return null;
    return played.took.includes(card) ? "success" : "fail";
  };
}

/** 내 첫 차례에 이 약을 이뤘으면 성공 */
function madeYak(yak: string) {
  return (ctx: Context): MissionStatus => {
    if (!myFirstPlay(ctx)) return null;
    const done = ctx.events.some(
      (e) => e.type === "yak" && e.seat === ctx.view.seat && e.yak === yak,
    );
    return done ? "success" : "fail";
  };
}

/** 판을 끝까지 마치면 성공 */
function finishedRound({ events }: Context): MissionStatus {
  return events.some((e) => e.type === "roundEnded") ? "success" : null;
}

const play = (card: string, target?: string): Action => ({
  type: "play",
  card,
  ...(target ? { target } : {}),
});

/** 남 둘은 한두 장씩만 쥐고, 더미는 바닥과 짝이 맞지 않는 카드로 둔다(미션 결과가 내 수로만 정해지게) */
const OTHERS = [
  ["12a", "04p"],
  ["07p", "09q"],
] as const;
const DECK = ["06p", "06q", "11q", "02q", "07q", "09p"];

/** 첫 미션: 3월 광으로 바닥 3월 피를 먹는다 */
const MATCH_SCENE: MinhwatuScene = {
  hands: [["03g", "05p", "10r"], ...OTHERS],
  floor: ["03p", "01q", "08p"],
  deck: DECK,
};

/** 같은 달 둘: 8월 열끗(기러기)을 고른다 */
const CHOOSE_SCENE: MinhwatuScene = {
  hands: [["08g", "05p", "10r"], ...OTHERS],
  floor: ["08a", "08q", "01q"],
  deck: DECK,
};

/** 뒤집기 설명용: 바닥에 6월 둘, 더미 맨 위가 6월 열끗 */
const FLIP_SCENE: MinhwatuScene = {
  hands: [["01p"], ...OTHERS],
  floor: ["06r", "06p"],
  deck: ["06a"],
};

/** 점수: 1월 광을 먹을까, 11월 피를 먹을까 */
const POINTS_SCENE: MinhwatuScene = {
  hands: [["01p", "11p", "05p"], ...OTHERS],
  floor: ["01g", "11d", "08q"],
  deck: DECK,
};

/** 약: 10월 둘을 먹어 두었다. 마지막 10월로 풍약을 마무리 */
const YAK_SCENE: MinhwatuScene = {
  hands: [["10q", "08p", "05p"], ...OTHERS],
  floor: ["10p", "08g", "01q"],
  deck: DECK,
  captured: [["10a", "10r"], [], []],
};

/** 약 막기: 1번 자리가 홍단 둘을 모았다. 3월 띠를 먼저 먹어 막는다 */
const BLOCK_SCENE: MinhwatuScene = {
  hands: [["03p", "08p", "05p"], ...OTHERS],
  floor: ["03r", "08g", "01q"],
  deck: DECK,
  captured: [[], ["01r", "02r"], []],
};

export const MINHWATU_LESSONS: readonly MinhwatuLesson[] = [
  {
    id: "intro",
    title: "민화투는 어떤 게임?",
    summary: "같은 달 짝 맞추기",
    steps: [
      {
        kind: "explain",
        title: "화투 48장",
        body: [
          "화투는 **열두 달 × 4장**, 모두 48장이에요. 카드 왼쪽 위 숫자가 달이에요.",
          "민화투는 고스톱의 조상 같은 놀이예요. 보통 **세 사람**이 하고, 고·스톱도 뻑도 없어요.",
          "세 사람이면 손패 **7장**, 바닥 **6장**을 깔고 나머지는 더미로 엎어 둬요.",
        ],
        scene: MATCH_SCENE,
      },
      {
        kind: "explain",
        title: "짝 맞추기",
        body: [
          "내 차례에 손패 한 장을 내요. 바닥에 **같은 달** 카드가 있으면 둘 다 가져와요.",
          "같은 달이 없으면 낸 카드는 바닥에 그냥 놓여요. 다음 사람이 먹을 수도 있어요.",
        ],
        scene: MATCH_SCENE,
      },
      {
        kind: "quiz",
        question: "손패 3월 광으로 먹을 수 있는 바닥 카드는?",
        scene: MATCH_SCENE,
        options: ["3월 피", "1월 피", "8월 피"],
        answer: 0,
        explain: "같은 **달**(3월)끼리 짝이 맞아요. 종류(광·피)는 달라도 돼요.",
      },
      {
        kind: "mission",
        title: "첫 짝 맞추기",
        objective: "**3월 광**을 내서 바닥의 **3월 피**를 먹으세요",
        hint: "손패에서 왼쪽 위 숫자가 3인 카드를 누르세요(휴대폰은 두 번)",
        scenario: MATCH_SCENE,
        check: tookWithFirst("03p"),
        success: "짝을 맞춰 두 장을 가져왔어요!",
        fail: "3월 카드로 3월 피를 먹어야 해요. 다시 해 볼까요?",
        solution: [play("03g")],
        mistake: [play("05p")],
      },
    ],
  },
  {
    id: "flip",
    title: "뒤집기와 고르기",
    summary: "더미 뒤집기, 같은 달이 둘일 때",
    steps: [
      {
        kind: "explain",
        title: "더미 뒤집기",
        body: [
          "손패를 낸 다음에는 더미에서 **한 장을 뒤집어요**. 뒤집은 카드도 바닥에 같은 달이 있으면 먹어요.",
          "그래서 한 차례에 두 번 먹을 수도, 하나도 못 먹을 수도 있어요. 컴퓨터가 알아서 뒤집어 줘요.",
        ],
        scene: FLIP_SCENE,
      },
      {
        kind: "explain",
        title: "같은 달이 둘이면 골라요",
        body: [
          "바닥에 같은 달이 **두 장** 있으면 그중 하나를 골라 먹어요. 점수가 큰 쪽을 고르세요.",
          "같은 달이 **세 장**이면 네 장을 한꺼번에 다 가져와요.",
          "뒤집은 카드가 방금 낸 카드와 같은 달이면 바닥에 남아요(민화투에는 뻑이 없어요).",
        ],
        scene: CHOOSE_SCENE,
      },
      {
        kind: "mission",
        title: "골라 먹기",
        objective:
          "8월 광을 내고 바닥 8월 두 장 중 **기러기(열끗)**를 고르세요",
        hint: "8월 광을 누른 뒤 테두리가 생긴 바닥 카드 중 새 그림(8월 기러기)을 누르세요",
        scenario: CHOOSE_SCENE,
        check: tookWithFirst("08a"),
        success: "열끗(10점)을 골랐어요. 피는 0점이에요",
        fail: "피는 0점이에요. 열끗(기러기)을 골라 보세요",
        solution: [play("08g", "08a")],
        mistake: [play("08g", "08q")],
      },
    ],
  },
  {
    id: "points",
    title: "카드 점수",
    summary: "광 20 · 열끗 10 · 띠 5 · 피 0",
    steps: [
      {
        kind: "explain",
        title: "먹은 카드의 점수",
        body: [
          "**광 20점**, **열끗 10점**, **띠 5점**, **피 0점**이에요. 쌍피도 0점이에요.",
          "48장을 다 더하면 240점이에요. 세 사람이면 한 사람 몫(**본**)이 80점이라, 판이 끝나면 내 점수에서 80을 빼요.",
          "그래서 판 점수를 모두 더하면 늘 0이에요. 남보다 많이 먹으면 플러스, 적게 먹으면 마이너스예요.",
        ],
        scene: POINTS_SCENE,
      },
      {
        kind: "quiz",
        question: "광 1장과 띠 2장을 먹었어요. 카드 점수는?",
        options: ["30점", "25점", "40점"],
        answer: 0,
        explain: "광 20 + 띠 5 + 띠 5 = **30점**이에요.",
      },
      {
        kind: "mission",
        title: "큰 점수 먹기",
        objective: "바닥의 **1월 광**(20점)을 먹으세요",
        hint: "1월 피를 내면 같은 1월인 광을 먹어요. 11월 피를 먹으면 0점이에요",
        scenario: POINTS_SCENE,
        check: tookWithFirst("01g"),
        success: "광 20점을 가져왔어요!",
        fail: "피는 0점이에요. 1월 광을 노려 보세요",
        solution: [play("01p")],
        mistake: [play("11p")],
      },
    ],
  },
  {
    id: "yak",
    title: "약",
    summary: "초약·풍약·비약, 홍단·청단·초단",
    steps: [
      {
        kind: "explain",
        title: "같은 달 4장 약(20점)",
        body: [
          "**초약**: 5월 난초 4장, **풍약**: 10월 단풍 4장, **비약**: 12월 비 4장.",
          "약을 이루면 **나머지 사람 모두에게서** 약 점수를 받아요. 세 사람이면 20점씩 두 사람에게서 40점이에요.",
        ],
        scene: YAK_SCENE,
      },
      {
        kind: "explain",
        title: "띠 3장 약(30점)",
        body: [
          "**홍단**: 1·2·3월 붉은 띠, **청단**: 6·9·10월 파란 띠, **초단**: 4·5·7월 풀 띠.",
          "초단은 동네에 따라 안 치기도 해요(옵션에서 끌 수 있어요).",
        ],
      },
      {
        kind: "quiz",
        question: "세 사람이 할 때 내가 홍단을 하면 받는 점수는?",
        options: ["30점", "60점", "90점"],
        answer: 1,
        explain: "나머지 두 사람에게서 30점씩, **60점**을 받아요.",
      },
      {
        kind: "mission",
        title: "풍약 마무리",
        objective:
          "10월 두 장을 먹어 뒀어요. 남은 10월을 먹어 **풍약**을 이루세요",
        hint: "8월 광(20점)도 탐나지만 풍약은 두 사람에게서 20점씩 받아요",
        scenario: YAK_SCENE,
        check: madeYak("pungyak"),
        success: "풍약! 두 사람에게서 20점씩 받아요",
        fail: "광보다 약이 더 커요. 10월로 풍약을 이뤄 보세요",
        solution: [play("10q")],
        mistake: [play("08p")],
      },
    ],
  },
  {
    id: "block",
    title: "남의 약 막기",
    summary: "약이 될 카드는 먼저 먹는다",
    steps: [
      {
        kind: "explain",
        title: "막기",
        body: [
          "남이 약에 한 장 모자라면, 그 마지막 카드를 **내가 먼저 먹어** 막을 수 있어요.",
          "남의 홍단을 막으면 30점씩 내지 않아도 돼요. 광 하나보다 클 때가 많아요.",
          "내가 낸 카드가 바닥에 놓이면 다음 사람이 먹을 수 있으니, 남이 노리는 카드는 함부로 내지 마세요.",
        ],
        scene: BLOCK_SCENE,
      },
      {
        kind: "mission",
        title: "홍단 막기",
        objective:
          "옆 사람이 1·2월 붉은 띠를 모았어요. **3월 띠**를 먹어 홍단을 막으세요",
        hint: "3월 피를 내면 바닥 3월 띠를 가져와요",
        scenario: BLOCK_SCENE,
        check: tookWithFirst("03r"),
        success: "홍단을 막았어요!",
        fail: "3월 띠를 남기면 옆 사람이 홍단을 할 수 있어요",
        solution: [play("03p")],
        mistake: [play("08p")],
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "컴퓨터 둘과 처음부터 한 판",
    steps: [
      {
        kind: "explain",
        title: "한 판 해 봐요",
        body: [
          "입문 컴퓨터 둘과 처음부터 한 판 해요. 바닥에 짝이 있는 카드를 추천해 줘요.",
          "판이 끝나면 광·열끗·띠, 약, 본을 계산한 점수표가 나와요.",
        ],
      },
      {
        kind: "mission",
        title: "끝까지 한 판",
        objective: "판이 끝날 때까지 해 보세요",
        hint: "짝이 맞는 카드가 없으면 점수가 낮은 피부터 내세요",
        scenario: null,
        check: finishedRound,
        success: "한 판을 마쳤어요! 점수표를 확인해 보세요",
        fail: "다시 해 볼까요?",
      },
    ],
  },
];
