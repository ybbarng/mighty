import {
  type Action,
  type BadukScenarioOptions,
  type BadukView,
  type GameEvent,
  pointAt,
  STANDARD_RULES,
} from "@mighty/baduk-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 놓인 돌에 더해 그림에만 쓰는 표시(자리 → 글자) */
export type BadukScene = Omit<BadukScenarioOptions, "rules"> & {
  marks?: Readonly<Record<string, string>>;
};
export type BadukLesson = Lesson<BadukView, GameEvent, BadukScene, Action>;
type Context = MissionContext<BadukView, GameEvent>;

/** 튜토리얼은 9줄, 덤 7.5 한 판으로 한다 */
export const BADUK_TUTORIAL_RULES = STANDARD_RULES;
const SIZE = BADUK_TUTORIAL_RULES.size;

const at = (name: string) => pointAt(name, SIZE);

/** 내가 처음 한 행동(돌 놓기 또는 쉬기) */
function myFirstTurn({ view, events }: Context) {
  const mine = events.find(
    (e) =>
      (e.type === "placed" || e.type === "passed") && e.seat === view.mySeat,
  );
  return mine?.type === "placed" || mine?.type === "passed" ? mine : null;
}

/** 첫 수로 그 자리 돌을 따냈으면 성공 */
function capturedFirst(name: string) {
  const target = at(name);
  return (ctx: Context): MissionStatus => {
    const first = myFirstTurn(ctx);
    if (!first) return null;
    return first.type === "placed" && first.captured.includes(target)
      ? "success"
      : "fail";
  };
}

/** 첫 수가 그 자리였으면 성공 */
function firstAt(name: string) {
  const target = at(name);
  return (ctx: Context): MissionStatus => {
    const first = myFirstTurn(ctx);
    if (!first) return null;
    return first.type === "placed" && first.at === target ? "success" : "fail";
  };
}

/** 판이 끝났을 때 내가 이겼으면 성공 */
function wonRound({ view, events }: Context): MissionStatus {
  const ended = events.find((e) => e.type === "roundEnded");
  if (ended?.type !== "roundEnded") return null;
  return ended.result.seat === view.mySeat ? "success" : "fail";
}

const place = (name: string): Action => ({ type: "place", at: at(name) });

/** 한 세로줄 전부(예: "E" → E1~E9) */
const column = (c: string, skip: readonly number[] = []) =>
  Array.from({ length: SIZE }, (_, i) => i + 1)
    .filter((row) => !skip.includes(row))
    .map((row) => `${c}${row}`);

/** 백 한 점(E5)을 흑 셋이 둘러쌌다. 남은 활로는 E4 하나 */
const CAPTURE_SCENE: BadukScene = {
  black: ["D5", "E6", "F5"],
  white: ["E5"],
  marks: { E4: "×" },
};

/** E5는 백 돌로 둘러싸였지만, 흑이 두면 단수인 백 E6을 따내 둘 수 있다 */
const SUICIDE_SCENE: BadukScene = {
  black: ["D6", "F6", "E7"],
  white: ["D5", "F5", "E4", "E6"],
  marks: { E5: "A" },
};

/** 진짜 자살수: 귀 A9는 흑 둘에 둘러싸였다. 백이 두면 활로가 없다 */
const TRUE_SUICIDE: BadukScene = {
  black: ["B9", "A8"],
  white: ["E5"],
  marks: { A9: "×" },
};

/** 가운데 패 모양: 흑이 E6에 두면 백 D6을 따낸다 */
const KO_SCENE: BadukScene = {
  black: ["D7", "C6", "D5"],
  white: ["E7", "D6", "F6", "E5"],
  marks: { E6: "A" },
};

/** 흑 벽(D줄)에 D5 한 곳이 뚫렸다. 백 벽은 F줄 */
const AREA_SCENE: BadukScene = {
  black: column("D", [5]),
  white: column("F"),
  marks: { D5: "A" },
};

/** 다 막힌 판: 흑 D줄, 백 F줄. 흑 9 + 27 = 36, 백 9 + 27 = 36 + 덤 */
const AREA_DONE: BadukScene = {
  black: column("D"),
  white: column("F"),
};

/** 아래 귀 흑 무리: 눈 자리 A1·B1·C1이 한 줄로 셋. 가운데 B1에 두면 눈이 둘 */
const EYES_SCENE: BadukScene = {
  black: ["A2", "B2", "C2", "D2", "D1"],
  white: ["A3", "B3", "C3", "D3", "E3", "E2", "E1"],
  marks: { B1: "A" },
};

/** 두 눈으로 산 모양: 눈 A1·C1은 백이 둘 수 없다 */
const TWO_EYES: BadukScene = {
  black: ["A2", "B2", "C2", "D2", "D1", "B1"],
  white: ["A3", "B3", "C3", "D3", "E3", "E2", "E1"],
  marks: { A1: "○", C1: "○" },
};

/** 흑 집(A~D) 안에 들어온 백 한 점(B8). 이대로 세면 흑 집이 누구 것도 아니다 */
const DEAD_SCENE: BadukScene = {
  black: [...column("E"), "A8", "B9", "C8"],
  white: [...column("G"), "B8"],
  marks: { B7: "×" },
};

export const BADUK_LESSONS: readonly BadukLesson[] = [
  {
    id: "goal",
    title: "바둑은 어떤 게임?",
    summary: "흑이 먼저, 번갈아 돌을 놓고, 활로를 모두 막으면 따낸다",
    steps: [
      {
        kind: "explain",
        title: "더 넓게 차지하면 이겨요",
        body: [
          "바둑은 **흑**과 **백**이 줄이 만나는 점(교차점)에 돌을 하나씩 번갈아 놓는 게임이에요. **흑이 먼저** 둬요.",
          "놓은 돌은 움직이지 않아요. 판을 더 넓게 차지한 쪽이 이겨요.",
          "흑이 먼저 두는 만큼 백은 **덤** 7.5점을 더 받아요.",
        ],
      },
      {
        kind: "explain",
        title: "활로와 따내기",
        body: [
          "돌 바로 위·아래·왼쪽·오른쪽의 빈 점을 **활로**(숨 쉴 곳)라고 해요. 같은 색 돌이 붙어 있으면 활로를 함께 써요.",
          "상대가 활로를 **모두 막으면** 그 돌은 판에서 들려 나가요. 이것이 **따내기**예요.",
          "그림의 백 한 점은 활로가 × 한 곳만 남았어요(**단수**).",
        ],
        scene: CAPTURE_SCENE,
      },
      {
        kind: "quiz",
        question: "상대 돌은 언제 따낼 수 있을까요?",
        options: [
          "그 돌의 활로를 모두 막았을 때",
          "그 돌 옆에 내 돌을 하나 놓았을 때",
          "그 돌을 대각선으로 둘러쌌을 때",
        ],
        answer: 0,
        explain:
          "위·아래·왼쪽·오른쪽 빈 점이 활로예요. 대각선은 활로가 아니에요. 활로를 모두 막아야 따내요.",
      },
      {
        kind: "mission",
        title: "한 점 따내기",
        objective: "백 한 점의 마지막 **활로**를 막아 따내세요.",
        hint: "백 돌 아래쪽(E4)이 비어 있어요.",
        scenario: CAPTURE_SCENE,
        check: capturedFirst("E5"),
        success: "따냈어요! 따낸 돌은 판에서 들려 나가요.",
        fail: "아직 따내지 못했어요. 백 돌 곁에 남은 빈 점을 찾아보세요.",
        solution: [place("E4")],
        mistake: [place("A1")],
      },
    ],
  },
  {
    id: "suicide",
    title: "둘 수 없는 자리",
    summary: "활로가 없는 자리에는 둘 수 없다. 따내면서 두면 된다",
    steps: [
      {
        kind: "explain",
        title: "자살수는 둘 수 없어요",
        body: [
          "놓자마자 활로가 하나도 없는 자리에는 둘 수 없어요. 이것을 **자살수**라고 해요.",
          "그림에서 백은 귀 ×에 둘 수 없어요. 놓으면 흑 둘에 막혀 숨 쉴 곳이 없어요.",
        ],
        scene: TRUE_SUICIDE,
      },
      {
        kind: "explain",
        title: "따내면 둘 수 있어요",
        body: [
          "둘러싸인 자리라도, 놓는 순간 **상대 돌을 따내면** 활로가 생겨서 둘 수 있어요.",
          "그림의 A는 백 돌에 둘러싸였지만, 위쪽 백 한 점(E6)은 활로가 A 하나뿐이에요. 흑이 A에 두면 그 백을 따내요.",
        ],
        scene: SUICIDE_SCENE,
      },
      {
        kind: "quiz",
        question: "활로가 없는 자리에 둘 수 있는 때는?",
        options: [
          "그 수로 상대 돌을 따낼 때",
          "판 가장자리일 때",
          "언제든 둘 수 있다",
        ],
        answer: 0,
        explain:
          "따내는 순간 그 자리에 활로가 생겨요. 따내지 못하면 자살수라 둘 수 없어요.",
      },
      {
        kind: "mission",
        title: "따내며 들어가기",
        objective: "백 돌에 둘러싸인 **A(E5)**에 두어 백 한 점을 따내세요.",
        hint: "E5에 두면 위쪽 백 E6의 마지막 활로를 막아요.",
        scenario: SUICIDE_SCENE,
        check: capturedFirst("E6"),
        success: "들어가며 따냈어요! 따내는 수는 자살수가 아니에요.",
        fail: "그 수로는 백을 따내지 못했어요. 둘러싸인 E5를 다시 보세요.",
        solution: [place("E5")],
        mistake: [place("A1")],
      },
    ],
  },
  {
    id: "ko",
    title: "패",
    summary: "한 점을 따낸 바로 다음에 되따내 같은 모양을 만들 수는 없다",
    steps: [
      {
        kind: "explain",
        title: "서로 한 점씩 따낼 수 있는 모양",
        body: [
          "그림에서 흑이 A에 두면 백 D6 한 점을 따내요. 그런데 그러면 흑 A 한 점도 활로가 하나뿐이라, 백이 곧바로 D6에 두면 다시 따낼 수 있어요.",
          "이렇게 서로 끝없이 되따낼 수 있는 모양을 **패**라고 해요.",
        ],
        scene: KO_SCENE,
      },
      {
        kind: "explain",
        title: "바로 되따낼 수 없어요",
        body: [
          "끝나지 않는 것을 막으려고, **판 모양을 이번 판에 나왔던 모양으로 되돌리는 수는 둘 수 없어요**.",
          "그래서 패를 따내면 상대는 **다른 곳에 한 수 둔 뒤**에야 되따낼 수 있어요. 그 사이 상대가 꼭 받아야 하는 곳에 두는 것을 **팻감**이라고 해요.",
        ],
        scene: KO_SCENE,
      },
      {
        kind: "quiz",
        question: "패를 따낸 바로 다음, 상대는?",
        options: [
          "다른 곳에 한 수 둔 뒤에 되따낼 수 있다",
          "곧바로 되따낼 수 있다",
          "그 판에서 다시는 둘 수 없다",
        ],
        answer: 0,
        explain:
          "곧바로 되따내면 앞의 판 모양이 되돌아와서 둘 수 없어요. 다른 곳을 한 번 거치면 판 모양이 달라져 둘 수 있어요.",
      },
      {
        kind: "mission",
        title: "패 따내기",
        objective:
          "**A(E6)**에 두어 패를 따내세요. 백은 바로 되따낼 수 없어요.",
        hint: "백 D6은 활로가 E6 하나뿐이에요.",
        scenario: KO_SCENE,
        check: capturedFirst("D6"),
        success:
          "패를 따냈어요! 이제 백은 다른 곳에 한 번 둬야 되따낼 수 있어요.",
        fail: "아직 패를 따내지 않았어요. 백 D6의 마지막 활로를 막아 보세요.",
        solution: [place("E6")],
        mistake: [place("J1")],
      },
    ],
  },
  {
    id: "area",
    title: "집과 세기",
    summary: "판이 끝나면 내 돌 + 내 돌로만 둘러싼 빈 점을 센다",
    steps: [
      {
        kind: "explain",
        title: "둘이 이어 쉬면 끝나요",
        body: [
          "더 둘 곳이 없다고 생각하면 **쉬기**를 눌러요. **두 사람이 이어서 쉬면** 판이 끝나요.",
          "그때 판 위 **내 돌 수**와 **내 돌로만 둘러싸인 빈 점 수**를 더해 세요. 백은 덤 7.5를 더해요. 많은 쪽이 이겨요.",
          "흑과 백 돌에 함께 닿은 빈 점은 누구 것도 아니에요.",
        ],
        scene: AREA_DONE,
      },
      {
        kind: "quiz",
        question:
          "그림에서 흑은 D줄 9점과 왼쪽 빈 점 27, 백은 F줄 9점과 오른쪽 빈 점 27을 가졌어요. 누가 이길까요?",
        options: ["백(덤 7.5 때문에)", "흑", "비긴다"],
        answer: 0,
        explain:
          "둘 다 36이지만 백은 덤 7.5를 더해 43.5예요. 가운데 E줄은 흑백 모두에 닿아 누구 것도 아니에요. 덤에 0.5가 붙어 비기는 일은 없어요.",
        scene: AREA_DONE,
      },
      {
        kind: "mission",
        title: "벽 닫기",
        objective: "흑 벽의 뚫린 곳 **A**를 막아 왼쪽을 흑 자리로 만드세요.",
        hint: "D5가 비어 있으면 왼쪽 빈 점이 백 쪽과 이어져 누구 것도 아니에요.",
        scenario: AREA_SCENE,
        check: firstAt("D5"),
        success: "벽이 닫혔어요! 왼쪽 빈 점 27이 모두 흑 자리가 됐어요.",
        fail: "아직 왼쪽이 열려 있어요. 흑 벽에서 빈 곳을 찾아보세요.",
        solution: [place("D5")],
        mistake: [place("A1")],
      },
    ],
  },
  {
    id: "eyes",
    title: "두 눈으로 살기",
    summary: "따로 떨어진 눈이 둘이면 그 무리는 결코 따낼 수 없다",
    steps: [
      {
        kind: "explain",
        title: "눈이란?",
        body: [
          "내 돌로 둘러싸인 빈 점을 **눈**이라고 해요. 상대가 눈에 두면 대개 자살수라 둘 수 없어요.",
          "그런데 눈이 **하나**뿐이면, 바깥 활로를 다 막은 뒤 그 눈에 두면 따내는 수라서 둘 수 있어요. 눈 하나로는 살 수 없어요.",
        ],
        scene: EYES_SCENE,
      },
      {
        kind: "explain",
        title: "눈이 둘이면 살아요",
        body: [
          "떨어진 눈이 **둘**이면 상대는 어느 눈에도 먼저 둘 수 없어요(둘 다 자살수). 그 무리는 **영원히 살아요**.",
          "그림의 흑 무리는 ○ 두 눈이 있어 살았어요.",
        ],
        scene: TWO_EYES,
      },
      {
        kind: "quiz",
        question: "무리가 확실히 살려면 눈이 몇 개 있어야 할까요?",
        options: ["따로 떨어진 눈 둘", "눈 하나", "눈이 없어도 돌이 많으면"],
        answer: 0,
        explain:
          "눈이 하나면 결국 따낼 수 있어요. 떨어진 눈 둘이 있어야 상대가 어느 쪽에도 둘 수 없어요.",
      },
      {
        kind: "mission",
        title: "두 눈 만들기",
        objective: "귀의 흑 무리에 **눈 둘**을 만들어 살리세요.",
        hint: "빈 점 셋(A1·B1·C1) 가운데에 두면 양쪽에 눈이 하나씩 생겨요.",
        scenario: EYES_SCENE,
        check: firstAt("B1"),
        success:
          "살았어요! A1과 C1 두 눈이 있어 백은 이 무리를 따낼 수 없어요.",
        fail: "아직 눈이 둘이 아니에요. 빈 점 셋의 가운데를 보세요.",
        solution: [place("B1")],
        mistake: [place("J9")],
      },
    ],
  },
  {
    id: "cleanup",
    title: "끝내기 전에 따내기",
    summary: "판 위 그대로 세니, 쉬기 전에 내 집 안의 죽은 돌은 따낸다",
    steps: [
      {
        kind: "explain",
        title: "죽은 돌도 그대로 세요",
        body: [
          "이 바둑은 판이 끝나면 **판 위에 놓인 그대로** 세요. 살 수 없는 돌(죽은 돌)을 따로 들어내 주지 않아요.",
          "그래서 내 집 안에 상대 돌이 남아 있으면 그 둘레 빈 점은 흑백 모두에 닿아 **누구 것도 아니에요**.",
          "**끝내기 전에 죽은 돌은 따내야 해요.** 그 뒤에 쉬어요.",
        ],
        scene: DEAD_SCENE,
      },
      {
        kind: "quiz",
        question:
          "내 집 안에 상대 돌이 하나 남았는데 상대가 쉬었어요. 어떻게 할까요?",
        options: [
          "그 돌을 따낸 뒤에 쉰다",
          "곧바로 쉰다",
          "상대 집에 들어가 본다",
        ],
        answer: 0,
        explain:
          "곧바로 쉬면 그 돌이 판 위에 남은 채로 세서 내 집이 줄어요. 따내고 쉬면 집이 모두 내 것이 돼요.",
      },
      {
        kind: "mission",
        title: "죽은 돌 따내기",
        objective: "흑 집 안의 백 한 점(B8)을 **쉬기 전에** 따내세요.",
        hint: "B8 아래(B7)가 마지막 활로예요.",
        scenario: DEAD_SCENE,
        check: capturedFirst("B8"),
        success: "따냈어요! 이제 왼쪽 빈 점이 모두 흑 집이에요.",
        fail: "백 돌을 남긴 채 쉬면 그 둘레가 흑 집으로 세지지 않아요. 먼저 따내요.",
        solution: [place("B7")],
        mistake: [{ type: "pass" }],
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "9줄에서 입문 컴퓨터와 한 판",
    steps: [
      {
        kind: "explain",
        title: "두는 요령",
        body: [
          "처음에는 **귀 → 변 → 가운데** 순서로 넓게 자리를 잡아요. 귀는 적은 돌로 집을 짓기 쉬워요.",
          "한 수 두기 전에 ① 내 돌이 **단수**(활로 하나)인가 ② 상대 돌을 따낼 수 있나를 살펴요.",
          "더 둘 곳이 없으면 내 집 안 죽은 돌을 따낸 뒤 **쉬기**를 눌러요. 상대도 쉬면 판 위 그대로 세요.",
        ],
      },
      {
        kind: "mission",
        title: "첫 승리",
        objective: "흑으로 **입문 컴퓨터**와 9줄 한 판을 두어 이기세요.",
        hint: "귀부터 자리를 잡고, 단수에 걸린 돌은 달아나고, 따낼 돌은 따내요.",
        scenario: null,
        check: wonRound,
        success: "첫 승리예요! 이제 중수·고수와 겨뤄 보세요.",
        fail: "아쉬워요. 단수를 조심하고 넓은 곳을 먼저 차지해 봐요.",
      },
    ],
  },
];
