import {
  type Action,
  type GameEvent,
  type NyrongppongScenarioOptions,
  type NyrongppongView,
  STANDARD_RULES,
} from "@mighty/nyrongppong-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면(설명 그림에도 쓴다). 0번 자리가 나다 */
export type NyrongppongScene = NyrongppongScenarioOptions;
export type NyrongppongLesson = Lesson<
  NyrongppongView,
  GameEvent,
  NyrongppongScene,
  Action
>;
type Context = MissionContext<NyrongppongView, GameEvent>;

/** 튜토리얼 규칙: 기본 규칙에 뽕 응답은 넉넉히 8초 */
export const NYRONGPPONG_TUTORIAL_RULES = {
  ...STANDARD_RULES,
  callSeconds: 8 as const,
};

/** 내가 처음 버린 카드 */
function myFirstDiscard({ view, events }: Context) {
  const e = events.find(
    (x) => x.type === "discarded" && x.seat === view.mySeat,
  );
  return e?.type === "discarded" ? e.card : null;
}

/** 처음 버린 카드가 이 달이면 성공 */
function discardedMonth(month: number) {
  return (ctx: Context): MissionStatus => {
    const card = myFirstDiscard(ctx);
    if (!card) return null;
    return Number(card.slice(0, 2)) === month ? "success" : "fail";
  };
}

/** 약을 내면 성공, 내지 않고 버리면 실패 */
function declaredYak({ view, events }: Context): MissionStatus {
  if (events.some((e) => e.type === "declared" && e.seat === view.mySeat))
    return "success";
  if (events.some((e) => e.type === "discarded" && e.seat === view.mySeat))
    return "fail";
  return null;
}

/** 뽕하면 성공, 넘기면(응답 창이 그냥 닫히면) 실패 */
function calledPpong({ view, events }: Context): MissionStatus {
  if (events.some((e) => e.type === "ppong" && e.seat === view.mySeat))
    return "success";
  if (events.some((e) => e.type === "callClosed")) return "fail";
  return null;
}

/** 스톱해서 가장 낮으면 성공, 스톱하지 않고 가져오면 실패 */
function stoppedWell({ view, events }: Context): MissionStatus {
  const ended = events.find((e) => e.type === "roundEnded");
  if (
    ended?.type === "roundEnded" &&
    ended.result.end.kind === "stop" &&
    ended.result.end.seat === view.mySeat
  )
    return ended.result.end.success ? "success" : "fail";
  if (events.some((e) => e.type === "drew" && e.seat === view.mySeat))
    return "fail";
  return null;
}

/** 한 판을 끝까지 하면 성공 */
function finishedRound({ events }: Context): MissionStatus {
  return events.some((e) => e.type === "roundEnded") ? "success" : null;
}

const rules = NYRONGPPONG_TUTORIAL_RULES;

/** 첫 차례(선): 여섯 장에서 한 장 버린다. 상대는 12월이 없다 */
const FIRST_DISCARD: NyrongppongScene = {
  rules,
  hands: [
    ["01g", "02a", "03r", "05p", "07a", "12g"],
    ["04a", "06a", "08g", "09r", "11g"],
  ],
  deck: ["10a", "10r", "11d", "04r", "06r", "08a", "09a", "11p"],
};

/** 가져온 뒤 여섯 장이 또이또이(두 장씩 세 쌍) */
const YAK_SCENE: NyrongppongScene = {
  rules,
  hands: [
    ["01g", "01r", "05a", "05p", "09a"],
    ["04a", "06a", "08g", "10r", "11g"],
  ],
  deck: ["09p", "12g", "12a", "03r", "02a", "07a"],
};

/** 상대가 3월을 버렸고 내 손에 3월 두 장 */
const PPONG_SCENE: NyrongppongScene = {
  rules,
  hands: [
    ["03r", "03p", "06a", "08g", "11g"],
    ["02a", "04a", "05a", "07a", "10a"],
  ],
  deck: ["12g", "12a", "01r", "09a", "04r", "05r"],
  openCall: { from: 1, card: "03g" },
};

/** 뽕을 한 번 하고 1월·2월이 남았다. 상대는 다섯 장이라 합이 크다 */
const STOP_SCENE: NyrongppongScene = {
  rules,
  hands: [
    ["01g", "02a"],
    ["08g", "09a", "10r", "11g", "12a"],
  ],
  melds: [[["07a", "07r", "07p"]], []],
  deck: ["04a", "05a", "06a", "03r", "04r", "05r"],
};

export const NYRONGPPONG_LESSONS: readonly NyrongppongLesson[] = [
  {
    id: "goal",
    title: "나이롱뽕은 어떤 게임?",
    summary: "손에 남은 카드의 달 숫자 합이 벌점. 작을수록 좋다",
    steps: [
      {
        kind: "explain",
        title: "합이 작은 사람이 이겨요",
        body: [
          "나이롱뽕은 **화투**로 하는 게임이에요. 카드마다 **달 숫자(1~12)**가 곧 값이에요.",
          "판이 끝날 때 손에 남은 카드 값의 **합이 벌점**이에요. 여러 판을 하고 합계가 **가장 낮은 사람**이 이겨요.",
          "모두 다섯 장을 받고, **선**은 여섯 장을 받아 먼저 한 장을 버려요.",
        ],
        scene: FIRST_DISCARD,
      },
      {
        kind: "explain",
        title: "가져오고, 버리고",
        body: [
          "내 차례가 오면 **더미에서 한 장 가져오고 한 장 버려요**. 가져오기는 저절로 돼요.",
          "큰 카드(11월·12월)를 들고 있으면 벌점이 커요. **큰 카드부터** 버리는 게 기본이에요.",
          "다만 **같은 달 두 장(짝)**은 남겨 두면 좋아요. 곧 배울 **뽕**을 할 수 있거든요.",
        ],
      },
      {
        kind: "quiz",
        question: "손에 3월·5월·11월이 남았어요. 벌점은?",
        options: ["8점", "19점", "11점"],
        answer: 1,
        explain: "3 + 5 + 11 = **19점**이에요. 달 숫자를 더해요.",
      },
      {
        kind: "mission",
        title: "큰 카드 버리기",
        objective: "내가 선이에요. 가장 큰 카드(**12월**)를 눌러 버리세요",
        hint: "오른쪽 끝 비 광(12월)을 누르세요. 휴대폰은 한 번 더 누르면 버려요",
        scenario: FIRST_DISCARD,
        check: discardedMonth(12),
        success: "잘했어요! 큰 카드를 먼저 버리면 벌점이 줄어요.",
        fail: "12월이 가장 커요. 다시 해 봐요.",
        solution: [{ type: "discard", card: "12g" }],
        mistake: [{ type: "discard", card: "01g" }],
      },
    ],
  },
  {
    id: "yak",
    title: "약 내기",
    summary: "여섯 장이 약이면 내려놓고 판을 끝낸다",
    steps: [
      {
        kind: "explain",
        title: "여섯 장 약",
        body: [
          "한 장을 가져와 **여섯 장**이 됐을 때 약이 되면 **약 내기**로 내려놓고 판을 끝내요.",
          "**또이또이**: 두 장씩 세 쌍(또는 석 장씩 두 쌍) → **0점**",
          "**줄**: 여섯 달이 이어짐(예: 3~8월) → 합만큼 **빼기**",
          "**10 부족**·**60 이상**: 여섯 장 합이 10 이하 또는 60 이상 → **−100점**",
          "약을 낸 사람은 약 점수, 나머지는 손패 합을 받아요.",
        ],
      },
      {
        kind: "quiz",
        question: "1월·1월·5월·5월·9월·9월을 들었어요. 무슨 약일까요?",
        options: ["또이또이", "줄", "10 부족"],
        answer: 0,
        explain: "두 장씩 세 쌍이라 **또이또이**(0점)예요.",
      },
      {
        kind: "mission",
        title: "또이또이 내기",
        objective: "9월을 가져와 또이또이가 됐어요. **약 내기**를 누르세요",
        hint: "아래 노란 **약 내기: 또이또이** 단추를 누르세요",
        scenario: YAK_SCENE,
        check: declaredYak,
        success: "약을 내 판을 끝냈어요! 이번 판 0점이에요.",
        fail: "약이 됐을 때는 버리지 말고 약을 내요.",
        solution: [{ type: "declare" }],
        mistake: [{ type: "discard", card: "09a" }],
      },
    ],
  },
  {
    id: "ppong",
    title: "뽕 부르기",
    summary: "남이 버린 카드와 같은 달 두 장이 있으면 뽕!",
    steps: [
      {
        kind: "explain",
        title: "뽕!",
        body: [
          "남이 버린 카드와 **같은 달 두 장**이 내 손에 있으면 **뽕!**을 부를 수 있어요.",
          "뽕하면 그 세 장을 내려놓고, 손에서 **한 장 더 버려요**. 손패가 한 번에 석 장 줄어요.",
          "뽕할 수 있으면 화면에 큰 **뽕!** 단추와 남은 시간이 떠요. 시간 안에 누르세요.",
          "뽕한 사람 다음 자리부터 차례가 이어져요. 사이 사람들은 차례를 건너뛰어요.",
        ],
        scene: PPONG_SCENE,
      },
      {
        kind: "quiz",
        question:
          "상대가 3월을 버렸고 내 손에 3월이 두 장 있어요. 어떻게 될까요?",
        options: [
          "뽕! 세 장을 내려놓고 한 장 더 버린다",
          "그 카드를 가져와 손에 넣는다",
          "아무것도 못 한다",
        ],
        answer: 0,
        explain: "뽕하면 석 장을 **내려놓고** 한 장을 더 버려요.",
      },
      {
        kind: "mission",
        title: "뽕 부르기",
        objective: "상대가 **3월**을 버렸어요. 시간 안에 **뽕!**을 누르세요",
        hint: "빨간 **뽕!** 단추를 누르세요. 그다음 버릴 카드도 골라요",
        scenario: PPONG_SCENE,
        check: calledPpong,
        success: "뽕! 손패가 석 장 줄었어요.",
        fail: "넘겼거나 시간이 지났어요. 다시 해 봐요.",
        solution: [{ type: "call" }],
        mistake: [{ type: "pass" }],
      },
    ],
  },
  {
    id: "stop",
    title: "스톱과 박",
    summary: "뽕한 뒤 손이 작으면 스톱, 남은 짝으로 뽕하면 박",
    steps: [
      {
        kind: "explain",
        title: "스톱",
        body: [
          "뽕을 한 번 한 뒤 손패 **합이 10 이하**면, 가져오기 전에 **스톱**할 수 있어요.",
          "스톱하면 판이 끝나요. 내가 **가장 낮으면 0점**, 아니면 **바가지 +30**이에요.",
        ],
        scene: STOP_SCENE,
      },
      {
        kind: "explain",
        title: "박(털기)",
        body: [
          "뽕한 뒤 남은 두 장이 **짝**이면, 누가 그 달을 버릴 때 다시 뽕해 **손패를 다 털어요**. 이걸 **박**이라고 해요.",
          "박하면 나는 **0점**, 그 카드를 버린 사람은 **바가지 +20**이에요.",
          "그래서 남이 두 장만 들고 있을 때는 무엇을 버릴지 조심해요.",
        ],
      },
      {
        kind: "quiz",
        question:
          "뽕을 한 번 했고 1월·2월이 남았어요. 상대는 아직 다섯 장이에요. 어떻게 할까요?",
        options: ["스톱", "그냥 한 장 가져오기"],
        answer: 0,
        explain:
          "합이 3이라 다섯 장을 든 상대보다 거의 틀림없이 낮아요. **스톱**!",
      },
      {
        kind: "mission",
        title: "스톱하기",
        objective: "합이 3이에요. **스톱**을 누르세요",
        hint: "노란 **스톱** 단추를 누르세요",
        scenario: STOP_SCENE,
        check: stoppedWell,
        success: "스톱 성공! 이번 판 0점이에요.",
        fail: "이럴 때는 가져오지 말고 스톱해요.",
        solution: [{ type: "stop" }],
        mistake: [{ type: "draw" }],
      },
    ],
  },
  {
    id: "play",
    title: "실전",
    summary: "컴퓨터 셋과 처음부터 한 판",
    steps: [
      {
        kind: "explain",
        title: "이제 한 판!",
        body: [
          "입문 컴퓨터 셋과 처음부터 한 판 해요.",
          "큰 카드부터 버리고, 짝은 남기고, 뽕할 수 있으면 뽕!",
          "손이 작아지면 스톱, 여섯 장이 약이면 약 내기를 잊지 마세요.",
        ],
      },
      {
        kind: "mission",
        title: "한 판 끝내기",
        objective: "한 판을 끝까지 해 보세요",
        hint: "버릴 카드를 누르고, 뽕 단추가 뜨면 누르세요",
        scenario: null,
        check: finishedRound,
        success: "한 판을 마쳤어요! 이제 나홀로 나이롱뽕으로 실력을 키워요.",
        fail: "다시 해 봐요.",
      },
    ],
  },
];
