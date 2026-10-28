import {
  type Action,
  type GameEvent,
  type OmokScenarioOptions,
  type OmokView,
  pointAt,
  STANDARD_RULES,
} from "@mighty/omok-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 놓인 돌에 더해 그림에만 쓰는 표시 */
export type OmokScene = Omit<OmokScenarioOptions, "rules"> & {
  /** 이긴 줄처럼 빨간 줄로 이어 보일 자리 */
  line?: string[];
  /** 둘 차례인 색의 금지 자리를 ×로 보인다 */
  forbidden?: boolean;
};
export type OmokLesson = Lesson<OmokView, GameEvent, OmokScene, Action>;
type Context = MissionContext<OmokView, GameEvent>;

/** 튜토리얼은 일반 규칙 한 판으로 한다 */
export const OMOK_TUTORIAL_RULES = STANDARD_RULES;

/** 내가 처음 둔 자리 */
function myFirstPlace({ view, events }: Context): number | null {
  const placed = events.find(
    (e) => e.type === "placed" && e.seat === view.mySeat,
  );
  return placed?.type === "placed" ? placed.at : null;
}

/** 판이 끝났을 때 내가 이겼으면 성공 */
function wonRound({ view, events }: Context): MissionStatus {
  const ended = events.find((e) => e.type === "roundEnded");
  if (ended?.type !== "roundEnded") return null;
  return ended.result.kind !== "draw" && ended.result.seat === view.mySeat
    ? "success"
    : "fail";
}

/** 첫 수가 이 자리 가운데 하나면 성공 */
function firstAt(...names: string[]) {
  const targets = names.map(pointAt);
  return (ctx: Context): MissionStatus => {
    const at = myFirstPlace(ctx);
    if (at === null) return null;
    return targets.includes(at) ? "success" : "fail";
  };
}

const place = (name: string): Action => ({ type: "place", at: pointAt(name) });

/** 흑 넷이 한쪽만 막혀 있다. L8에 두면 다섯 */
const FIVE_SCENE: OmokScene = {
  black: ["H8", "I8", "J8", "K8"],
  white: ["G8", "H7", "I7", "J9"],
};

/** 백이 대각선으로 넷. 왼쪽 아래는 흑이 막았고 오른쪽 위 H8만 비었다 */
const BLOCK_SCENE: OmokScene = {
  black: ["C3", "K6", "L10", "M3"],
  white: ["D4", "E5", "F6", "G7"],
};

/** 흑 열린 셋. 양 끝 F8·J8 어느 쪽에 둬도 열린 넷 */
const OPEN_THREE_SCENE: OmokScene = {
  black: ["G8", "H8", "I8"],
  white: ["G6", "J11", "L4"],
};

/** H8에 두면 가로 셋과 세로 셋이 한꺼번에 생긴다(3·3) */
const DOUBLE_THREE_SCENE: OmokScene = {
  black: ["F8", "G8", "H9", "H10"],
  white: ["B2", "B14", "N2", "N14"],
  forbidden: true,
};

export const OMOK_LESSONS: readonly OmokLesson[] = [
  {
    id: "goal",
    title: "오목은 어떤 게임?",
    summary: "흑부터 번갈아 두고, 다섯을 먼저 잇는 사람이 이긴다",
    steps: [
      {
        kind: "explain",
        title: "다섯을 먼저 이어요",
        body: [
          "오목은 가로·세로 **15줄** 판의 줄이 만나는 점에 돌을 두는 게임이에요.",
          "**흑이 먼저** 두고, 흑과 백이 한 수씩 번갈아 둬요. 한번 둔 돌은 옮기지 않아요.",
          "가로·세로·대각선 어느 쪽이든 내 돌 **다섯 개를 한 줄로** 먼저 이으면 이겨요.",
        ],
        scene: {
          black: ["E4", "F5", "G6", "H7", "I8"],
          white: ["E5", "F6", "G7", "J9"],
          line: ["E4", "I8"],
        },
      },
      {
        kind: "quiz",
        question: "다섯을 이은 것으로 치지 **않는** 것은?",
        options: ["가로 한 줄", "세로 한 줄", "대각선 한 줄", "ㄱ자로 꺾인 줄"],
        answer: 3,
        explain:
          "다섯은 **곧은 한 줄**이어야 해요. 꺾이거나 사이에 빈칸이 있으면 다섯이 아니에요.",
      },
      {
        kind: "mission",
        title: "다섯 잇기",
        objective: "흑 넷이 나란히 있어요. 한 수로 **다섯**을 만들어 이기세요.",
        hint: "왼쪽 끝은 백이 막았어요. **오른쪽 끝**에 두세요.",
        scenario: FIVE_SCENE,
        // 첫 수로 다섯이 되지 않았으면 실패
        check: (ctx) =>
          myFirstPlace(ctx) === null ? null : (wonRound(ctx) ?? "fail"),
        success: "다섯을 이었어요! 이렇게 한 줄을 먼저 완성하면 이겨요.",
        fail: "아직 다섯이 아니에요. 넷의 비어 있는 끝을 찾아보세요.",
        solution: [place("L8")],
        mistake: [place("A1")],
      },
    ],
  },
  {
    id: "block",
    title: "막기",
    summary: "상대의 넷은 바로, 열린 셋은 미리 막는다",
    steps: [
      {
        kind: "explain",
        title: "넷은 바로 막아요",
        body: [
          "상대가 넷을 만들면 다음 수에 다섯이 돼요. 그 끝을 **바로 막아야** 해요.",
          "그림의 백 넷은 왼쪽 아래를 흑이 막아 두었어요. 남은 끝은 하나뿐이에요.",
        ],
        scene: BLOCK_SCENE,
      },
      {
        kind: "explain",
        title: "열린 셋은 미리 막아요",
        body: [
          "양쪽 끝이 다 빈 넷을 **열린 넷**이라고 해요. 한 번에 한 곳만 막을 수 있어서, 열린 넷이 생기면 막을 수 없어요.",
          "그래서 상대가 양쪽이 빈 셋(**열린 셋**)을 만들면, 넷이 되기 전에 한쪽 끝을 막아 두는 게 좋아요.",
        ],
      },
      {
        kind: "quiz",
        question: "상대가 **열린 넷**을 만들었어요. 어떻게 될까요?",
        options: [
          "한쪽만 막을 수 있어 다음 수에 진다",
          "두 끝을 한 번에 막을 수 있다",
          "넷은 그냥 둬도 괜찮다",
        ],
        answer: 0,
        explain:
          "한 번에 돌 하나만 두니 두 끝을 다 막을 수 없어요. 그래서 **열린 셋일 때** 막아야 해요.",
      },
      {
        kind: "mission",
        title: "넷 막기",
        objective:
          "백이 대각선으로 넷을 만들었어요. 다섯이 되기 전에 **막으세요**.",
        hint: "백 넷의 **오른쪽 위 끝**이 비어 있어요.",
        scenario: BLOCK_SCENE,
        check: firstAt("H8"),
        success: "막았어요! 상대 넷을 보면 무엇보다 먼저 막아요.",
        fail: "그 수로는 백이 다섯을 만들 수 있어요. 백 넷의 빈 끝을 찾아보세요.",
        solution: [place("H8")],
        mistake: [place("A15")],
      },
    ],
  },
  {
    id: "attack",
    title: "열린 넷 만들기",
    summary: "열린 셋을 열린 넷으로 키우면 상대가 막을 수 없다",
    steps: [
      {
        kind: "explain",
        title: "이기는 길: 열린 넷",
        body: [
          "내 열린 셋의 끝에 하나를 더 두면 **열린 넷**이 돼요. 상대가 한쪽을 막아도 다른 쪽에 두면 다섯이에요.",
          "그래서 상대가 내 열린 셋을 막지 않았다면, 바로 열린 넷을 만들어 이길 수 있어요.",
        ],
        scene: OPEN_THREE_SCENE,
      },
      {
        kind: "quiz",
        question: "그림의 흑 셋을 **열린 넷**으로 만드는 자리는?",
        scene: OPEN_THREE_SCENE,
        options: ["F8 또는 J8", "H9", "E8", "H7"],
        answer: 0,
        explain:
          "셋의 **바로 옆** F8이나 J8에 두면 넷의 양쪽이 모두 비어 있어 열린 넷이 돼요. E8은 사이가 떠서 한쪽만 막으면 끝나요.",
      },
      {
        kind: "mission",
        title: "열린 넷",
        objective: "흑 열린 셋이 있어요. 한 수로 **열린 넷**을 만드세요.",
        hint: "셋의 **바로 왼쪽이나 오른쪽**에 두세요.",
        scenario: OPEN_THREE_SCENE,
        check: firstAt("F8", "J8"),
        success:
          "열린 넷이에요! 이제 백이 어느 쪽을 막아도 다른 쪽에 두면 이겨요.",
        fail: "그 수로는 열린 넷이 되지 않아요. 셋 바로 옆 끝을 찾아보세요.",
        solution: [place("J8")],
        mistake: [place("E8")],
      },
    ],
  },
  {
    id: "forbidden",
    title: "금지 수",
    summary: "일반 규칙은 3·3 금지, 렌주는 흑만 3·3·4·4·장목 금지",
    steps: [
      {
        kind: "explain",
        title: "3·3은 둘 수 없어요",
        body: [
          "한 수로 **열린 셋 두 개**가 한꺼번에 생기는 자리를 **3·3**이라고 해요. 막을 수 없는 공격이라 금지예요.",
          "그림의 × 자리 H8에 흑을 두면 가로 셋과 세로 셋이 동시에 생겨요. **일반 규칙**에서는 흑과 백 모두 3·3에 둘 수 없어요.",
          "게임에서는 내 차례에 금지 자리를 ×로 보여 줘요(시작 화면에서 끌 수 있어요).",
        ],
        scene: DOUBLE_THREE_SCENE,
      },
      {
        kind: "explain",
        title: "규칙 셋",
        body: [
          "**일반**: 정확히 다섯이어야 이겨요(여섯 이상은 아니에요). 흑백 모두 3·3 금지.",
          "**자유**: 다섯 이상이면 이겨요. 금지가 없어요.",
          "**렌주**: 먼저 두는 흑이 유리해서 **흑만** 3·3, 4·4(넷 두 개), 장목(여섯 이상)이 금지예요. 백은 다섯 이상이면 이겨요.",
        ],
      },
      {
        kind: "quiz",
        question: "× 자리(H8)에 흑을 두면 어떻게 될까요?",
        scene: DOUBLE_THREE_SCENE,
        options: ["둘 수 없다(3·3 금지)", "바로 이긴다", "백 돌 하나를 따낸다"],
        answer: 0,
        explain:
          "열린 셋이 둘 생기는 **3·3**이라 둘 수 없어요. 오목에는 바둑처럼 돌을 따내는 규칙이 없어요.",
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "입문 컴퓨터와 처음부터 한 판",
    steps: [
      {
        kind: "explain",
        title: "두는 순서",
        body: [
          "한 수 두기 전에 이 차례로 살펴요.",
          "① 내가 **다섯**을 만들 수 있나? ② 상대 **넷**을 막아야 하나? ③ 내가 **열린 넷**을 만들 수 있나? ④ 상대 **열린 셋**을 막아야 하나?",
          "넷 다 아니면 내 돌 근처에 두어 셋을 키워요. 첫 수는 가운데(H8)가 좋아요.",
        ],
      },
      {
        kind: "mission",
        title: "첫 승리",
        objective: "흑으로 **입문 컴퓨터**와 한 판 두어 이기세요.",
        hint: "상대 넷과 열린 셋을 먼저 막고, 내 셋을 열린 넷으로 키우세요.",
        scenario: null,
        check: wonRound,
        success: "첫 승리예요! 이제 단계를 올려 중수·고수와 겨뤄 보세요.",
        fail: "아쉬워요. 상대 셋과 넷을 놓치지 않았는지 살피며 다시 해 봐요.",
      },
    ],
  },
];
