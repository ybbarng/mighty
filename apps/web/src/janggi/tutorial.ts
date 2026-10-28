import {
  type Action,
  baseBoard,
  type GameEvent,
  type JanggiScenarioOptions,
  type JanggiView,
  type Piece,
  placeSetup,
  pointAt,
  pointName,
  pseudoTargets,
  STANDARD_RULES,
} from "@mighty/janggi-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: 놓인 기물에 더해 그림에만 쓰는 표시 */
export type JanggiScene = Omit<JanggiScenarioOptions, "rules"> & {
  /** 이 자리 기물이 갈 수 있는 곳을 점으로 보인다 */
  show?: string;
};
export type JanggiLesson = Lesson<JanggiView, GameEvent, JanggiScene, Action>;
type Context = MissionContext<JanggiView, GameEvent>;

/** 튜토리얼은 기본 규칙 한 판으로 한다 */
export const JANGGI_TUTORIAL_RULES = STANDARD_RULES;

/** 내가 처음 옮긴 수 */
function myFirstMove({ view, events }: Context) {
  const moved = events.find(
    (e) => e.type === "moved" && e.seat === view.mySeat,
  );
  return moved?.type === "moved" ? moved : null;
}

/** 첫 수가 그 자리로 갔으면 성공 */
function firstTo(name: string) {
  const target = pointAt(name);
  return (ctx: Context): MissionStatus => {
    const moved = myFirstMove(ctx);
    if (!moved) return null;
    return moved.to === target ? "success" : "fail";
  };
}

/** 판이 끝났을 때 내가 이겼으면 성공 */
function wonRound({ view, events }: Context): MissionStatus {
  const ended = events.find((e) => e.type === "roundEnded");
  if (ended?.type !== "roundEnded") return null;
  return ended.result.seat === view.mySeat ? "success" : "fail";
}

/** 내 첫 수 뒤 초 차 하나가 다섯 곳 넘게 갈 수 있으면 성공(차 길이 열렸다) */
function rookOpened(ctx: Context): MissionStatus {
  if (!myFirstMove(ctx)) return null;
  const { board } = ctx.view;
  const reach = board.map((cell, at) =>
    cell === "cR" ? pseudoTargets(board, at).length : 0,
  );
  return Math.max(...reach) >= 5 ? "success" : "fail";
}

const move = (from: string, to: string): Action => ({
  type: "move",
  from: pointAt(from),
  to: pointAt(to),
});

/** 궁 둘. 같은 세로줄에 두면 빅장이 되니 줄을 엇갈린다 */
const KINGS: Record<string, Piece> = { "95": "cK", "24": "hK" };

/** 처음 놓인 판(두 편 모두 마상마상) */
const START: JanggiScene = {
  pieces: (() => {
    const board = baseBoard();
    placeSetup(board, "c", "NENE");
    placeSetup(board, "h", "NENE");
    const pieces: Record<string, Piece> = {};
    board.forEach((cell, at) => {
      if (cell !== "") pieces[pointName(at)] = cell;
    });
    return pieces;
  })(),
};

/** 차 하나와 공짜로 잡을 수 있는 한 졸 */
const ROOK_SCENE: JanggiScene = {
  pieces: { ...KINGS, "71": "cR", "41": "hP", "17": "hP" },
  show: "71",
};

/** 포가 내 졸을 넘어 한 차를 잡는다 */
const CANNON_SCENE: JanggiScene = {
  pieces: { ...KINGS, "71": "cC", "51": "cP", "31": "hR", "18": "hP" },
  show: "71",
};

/** 마가 한 차를 잡는다. 앞 칸(63)이 비어 있어야 간다 */
const HORSE_SCENE: JanggiScene = {
  pieces: { ...KINGS, "73": "cN", "54": "hR", "19": "hP" },
  show: "73",
};

/** 멱: 마 앞 칸이 막혀 그쪽 두 곳을 못 간다 */
const BLOCKED_HORSE: JanggiScene = {
  pieces: { ...KINGS, "73": "cN", "63": "cP" },
  show: "73",
};

/** 한 차가 장군을 불렀다. 같은 줄의 내 차로 잡는다 */
const CHECK_SCENE: JanggiScene = {
  pieces: { "95": "cK", "24": "hK", "75": "hR", "71": "cR", "18": "hP" },
};

/** 한 궁이 모서리에 몰렸다. 차를 맨 윗줄로 올리면 외통 */
const MATE_SCENE: JanggiScene = {
  // 가운데 졸(75)이 두 궁 사이를 막아 빅장으로 끝나지 않게 한다.
  pieces: { "95": "cK", "14": "hK", "59": "cR", "28": "cR", "75": "cP" },
};

export const JANGGI_LESSONS: readonly JanggiLesson[] = [
  {
    id: "goal",
    title: "장기는 어떤 게임?",
    summary: "초가 먼저 두고, 상대 궁을 외통으로 몰면 이긴다",
    steps: [
      {
        kind: "explain",
        title: "궁을 잡으면 이겨요",
        body: [
          "장기는 **초(초록)**와 **한(빨강)**이 기물 16개씩을 들고 두는 게임이에요. **초가 먼저** 둬요.",
          "한 번에 기물 하나를 움직여요. 상대 기물이 있는 자리로 가면 그 기물을 **잡아요**.",
          "상대 **궁**을 잡을 수밖에 없게 몰면(**외통**) 이겨요.",
        ],
        scene: START,
      },
      {
        kind: "explain",
        title: "차: 가장 센 기물",
        body: [
          "**차(車)**는 가로·세로로 막힐 때까지 몇 칸이든 가요. 점이 차가 갈 수 있는 곳이에요.",
          "앞에 상대 기물이 있으면 그 기물을 잡을 수 있어요.",
        ],
        scene: ROOK_SCENE,
      },
      {
        kind: "quiz",
        question: "장기는 어떻게 이길까요?",
        options: [
          "상대 궁을 외통으로 몬다",
          "상대 기물을 모두 잡는다",
          "내 졸을 상대 끝줄까지 보낸다",
        ],
        answer: 0,
        explain:
          "궁이 어디로 가도 잡히는 상태가 **외통**이에요. 기물을 다 잡지 않아도 외통이면 끝나요.",
      },
      {
        kind: "mission",
        title: "졸 잡기",
        objective: "**차**로 공짜로 잡을 수 있는 한 **졸**을 잡으세요.",
        hint: "내 차와 같은 세로줄 위쪽(41)에 한 졸이 있어요.",
        scenario: ROOK_SCENE,
        check: firstTo("41"),
        success: "잡았어요! 상대 기물 자리로 가면 그 기물을 잡아요.",
        fail: "아직 졸을 잡지 않았어요. 차와 같은 줄에 있는 졸을 찾아보세요.",
        solution: [move("71", "41")],
        mistake: [move("71", "72")],
      },
    ],
  },
  {
    id: "cannon",
    title: "포",
    summary: "포는 기물 하나를 반드시 넘어서 간다",
    steps: [
      {
        kind: "explain",
        title: "포는 넘어서 가요",
        body: [
          "**포(包)**는 차처럼 직선으로 가지만, 가는 길에 있는 **기물 하나를 반드시 넘어야** 해요.",
          "넘은 뒤에는 빈칸으로 가거나, 처음 만나는 상대 기물을 잡아요.",
          "포는 **포를 넘을 수 없고, 포를 잡을 수도 없어요**.",
        ],
        scene: CANNON_SCENE,
      },
      {
        kind: "quiz",
        question: "포가 할 수 **없는** 것은?",
        options: [
          "내 기물을 넘어 상대 차를 잡는다",
          "상대 졸을 넘어 빈칸으로 간다",
          "상대 포를 넘어 간다",
        ],
        answer: 2,
        explain:
          "포는 포를 넘지도 잡지도 못해요. 다른 기물은 내 것이든 상대 것이든 넘을 수 있어요.",
      },
      {
        kind: "mission",
        title: "포로 차 잡기",
        objective: "**포**로 내 졸을 넘어 한 **차**를 잡으세요.",
        hint: "포 위쪽의 졸(51)을 넘으면 그 너머 한 차(31)가 있어요.",
        scenario: CANNON_SCENE,
        check: firstTo("31"),
        success: "멋져요! 포는 넘을 기물이 있어야 힘을 써요.",
        fail: "그 수로는 차를 잡지 못했어요. 포는 기물 하나를 넘어서 가요.",
        solution: [move("71", "31")],
        mistake: [move("71", "41")],
      },
    ],
  },
  {
    id: "horse",
    title: "마·상",
    summary:
      "마는 한 칸 + 대각선 한 칸, 상은 한 칸 + 대각선 두 칸. 막히면 못 간다",
    steps: [
      {
        kind: "explain",
        title: "마는 날 일(日) 자로",
        body: [
          "**마(馬)**는 앞뒤좌우로 한 칸 가고, 이어서 바깥쪽 대각선으로 한 칸 가요.",
          "**상(象)**은 한 칸 가고 대각선으로 두 칸 가요. 마보다 멀리 가지만 더 잘 막혀요.",
        ],
        scene: HORSE_SCENE,
      },
      {
        kind: "explain",
        title: "막히면 못 가요(멱)",
        body: [
          "마가 처음 가는 한 칸에 기물이 있으면 그쪽으로는 못 가요. 이것을 **멱**이라고 해요.",
          "그림에서 마 위 칸(63)을 내 졸이 막아 위쪽 두 곳에 점이 없어요.",
        ],
        scene: BLOCKED_HORSE,
      },
      {
        kind: "mission",
        title: "마로 차 잡기",
        objective: "**마**로 한 **차**를 잡으세요.",
        hint: "마 위쪽 한 칸은 비어 있어요. 그다음 오른쪽 대각선이에요.",
        scenario: HORSE_SCENE,
        check: firstTo("54"),
        success: "잡았어요! 마는 막히지 않으면 여덟 방향으로 갈 수 있어요.",
        fail: "그 자리에는 차가 없어요. 마가 갈 수 있는 곳 가운데 차가 있는 곳을 찾아보세요.",
        solution: [move("73", "54")],
        mistake: [move("73", "52")],
      },
    ],
  },
  {
    id: "check",
    title: "궁·사·졸과 장군",
    summary:
      "궁과 사는 궁성 안에서, 졸은 앞과 옆으로. 장군을 받으면 반드시 푼다",
    steps: [
      {
        kind: "explain",
        title: "궁성과 졸",
        body: [
          "**궁**과 **사(士)**는 대각선이 그려진 **궁성** 안에서만 선을 따라 한 칸씩 움직여요.",
          "**졸(卒)·병(兵)**은 앞이나 옆으로 한 칸 가요. 뒤로는 못 가요.",
          "차·포·졸은 궁성 안에서는 대각선 선을 따라서도 갈 수 있어요.",
        ],
        scene: START,
      },
      {
        kind: "explain",
        title: "장군!",
        body: [
          "상대 기물이 내 궁을 잡을 수 있게 되면 **장군**이에요. 장군을 받으면 다음 수로 꼭 풀어야 해요.",
          "궁을 비키거나, 사이를 막거나, 장군 부른 기물을 잡으면 풀려요. 궁이 잡히는 수는 둘 수 없어요.",
        ],
        scene: CHECK_SCENE,
      },
      {
        kind: "mission",
        title: "장군 풀기",
        objective:
          "한 차가 **장군**을 불렀어요. 내 **차**로 그 차를 잡아 장군을 푸세요.",
        hint: "내 차(71)와 한 차(75)는 같은 가로줄에 있어요.",
        scenario: CHECK_SCENE,
        check: firstTo("75"),
        success:
          "장군을 풀고 차까지 얻었어요! 장군 부른 기물을 잡는 것이 가장 좋은 풀기예요.",
        fail: "장군은 풀었지만 차를 잡을 기회를 놓쳤어요. 다시 해 봐요.",
        solution: [move("71", "75")],
        mistake: [move("95", "94")],
      },
    ],
  },
  {
    id: "mate",
    title: "외통",
    summary: "장군을 어떻게 해도 풀 수 없으면 외통, 그 판을 이긴다",
    steps: [
      {
        kind: "explain",
        title: "외통으로 끝내요",
        body: [
          "장군을 받았는데 궁을 비킬 곳도, 막을 기물도, 잡을 방법도 없으면 **외통**이에요. 그 판을 이겨요.",
          "그림에서 한 궁은 모서리에 몰렸고, 내 차 하나가 궁 옆 줄을 막고 있어요.",
        ],
        scene: MATE_SCENE,
      },
      {
        kind: "mission",
        title: "외통 두기",
        objective: "한 수로 **외통**을 만드세요.",
        hint: "오른쪽 차(59)를 맨 윗줄로 올리면 한 궁이 갈 곳이 없어요.",
        scenario: MATE_SCENE,
        check: (ctx) => (myFirstMove(ctx) ? (wonRound(ctx) ?? "fail") : null),
        success: "외통! 장군을 풀 수 없게 몰면 이겨요.",
        fail: "아직 외통이 아니에요. 한 궁이 피할 곳이 없게 장군을 불러 보세요.",
        solution: [move("59", "19")],
        mistake: [move("59", "58")],
      },
    ],
  },
  {
    id: "opening",
    title: "초반 원칙",
    summary: "차 길을 열고, 마·상을 꺼내고, 궁 둘레는 지킨다",
    steps: [
      {
        kind: "explain",
        title: "차 길부터 열어요",
        body: [
          "처음에는 차 앞을 졸이 막고 있어 차가 두 칸밖에 못 가요. 점이 지금 차가 갈 수 있는 곳이에요.",
          "**변 졸을 옆으로 한 칸** 비키면 차가 세로줄을 따라 쭉 나갈 수 있어요. 가장 센 기물을 일찍 쓸 수 있게 해요.",
        ],
        scene: { ...START, show: "01" },
      },
      {
        kind: "explain",
        title: "마·상을 꺼내고 궁은 지켜요",
        body: [
          "마·상은 처음 줄에 있으면 하는 일이 없어요. 앞으로 꺼내 가운데를 노리게 해요.",
          "**궁과 사는 궁성 안에서 서로 붙어** 있게 두고, 궁을 일찍 움직이지 않아요.",
          "같은 기물을 여러 번 움직이기보다 여러 기물을 하나씩 꺼내요. 포는 넘을 기물(다리)이 있어야 힘을 써요.",
        ],
        scene: START,
      },
      {
        kind: "quiz",
        question: "초반에 먼저 하면 좋은 것은?",
        options: [
          "졸을 비켜 차가 나갈 길을 연다",
          "궁을 궁성 밖으로 내보낸다",
          "같은 마를 세 번 움직인다",
        ],
        answer: 0,
        explain:
          "차는 가장 센 기물이에요. 길을 열어 일찍 쓰고, 궁은 궁성 안에서 사와 함께 지켜요.",
      },
      {
        kind: "mission",
        title: "차 길 열기",
        objective: "한 수로 **차가 쭉 나갈 길**을 여세요.",
        hint: "왼쪽 끝 졸(71)을 옆(72)으로 비켜 보세요. 오른쪽 끝 졸(79)도 돼요.",
        scenario: START,
        check: rookOpened,
        success: "길이 열렸어요! 이제 차가 세로줄을 따라 멀리 나갈 수 있어요.",
        fail: "아직 차 앞이 막혀 있어요. 차 바로 앞 졸을 옆으로 비켜 보세요.",
        solution: [move("71", "72")],
        mistake: [move("02", "83")],
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "상차림부터 입문 컴퓨터와 한 판",
    steps: [
      {
        kind: "explain",
        title: "상차림과 두는 요령",
        body: [
          "판을 시작할 때 **마·상 자리**를 넷 가운데 골라요(**상차림**). 한이 먼저 고르고 초가 골라요.",
          "한 수 두기 전에 ① 상대가 내 기물을 잡을 수 있나 ② 내가 공짜로 잡을 기물이 있나를 살펴요.",
          "차는 가장 센 기물이에요. 차를 일찍 내주지 않게 조심해요.",
        ],
      },
      {
        kind: "mission",
        title: "첫 승리",
        objective: "초로 **입문 컴퓨터**와 한 판 두어 이기세요.",
        hint: "기물 점수(차 13·포 7·마 5·상 3·사 3·졸 2)를 생각하며, 공짜로 내주지 말고 공짜는 잡아요.",
        scenario: null,
        check: wonRound,
        success: "첫 승리예요! 이제 중수·고수와 겨뤄 보세요.",
        fail: "아쉬워요. 내 기물이 잡히지 않는지 살피며 다시 해 봐요.",
      },
    ],
  },
];
