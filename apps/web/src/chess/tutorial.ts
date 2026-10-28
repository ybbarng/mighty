import {
  type Action,
  type ChessScenarioOptions,
  type ChessView,
  type GameEvent,
  type Promotion,
  STANDARD_RULES,
  START_FEN,
  squareAt,
} from "@mighty/chess-engine";

import type { Lesson, MissionContext, MissionStatus } from "@/tutorial/types";

/** 튜토리얼 장면: FEN 판 모양에 더해 그림에만 쓰는 표시 */
export type ChessScene = Omit<ChessScenarioOptions, "rules"> & {
  /** 이 칸 기물이 갈 수 있는 곳을 점으로 보인다 */
  show?: string;
};
export type ChessLesson = Lesson<ChessView, GameEvent, ChessScene, Action>;
type Context = MissionContext<ChessView, GameEvent>;

/** 튜토리얼은 기본 규칙 한 판으로 한다 */
export const CHESS_TUTORIAL_RULES = STANDARD_RULES;

/** 내가 처음 옮긴 수 */
function myFirstMove({ view, events }: Context) {
  const moved = events.find(
    (e) => e.type === "moved" && e.seat === view.mySeat,
  );
  return moved?.type === "moved" ? moved : null;
}

/** 첫 수가 그 칸으로 갔으면 성공 */
function firstTo(name: string) {
  const target = squareAt(name);
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
  return ended.result.kind !== "draw" && ended.result.seat === view.mySeat
    ? "success"
    : "fail";
}

const move = (from: string, to: string, promotion?: Promotion): Action => ({
  type: "move",
  from: squareAt(from),
  to: squareAt(to),
  ...(promotion ? { promotion } : {}),
});

/** 처음 판 */
const START: ChessScene = { fen: START_FEN };

/** 룩 하나와 공짜로 잡을 수 있는 흑 폰 */
const ROOK_SCENE: ChessScene = {
  fen: "4k3/8/3p4/8/8/8/8/3RK3 w - - 0 1",
  show: "d1",
};

/** 비숍·퀸·나이트·킹이 갈 수 있는 곳 */
const BISHOP_SCENE: ChessScene = {
  fen: "4k3/8/8/8/3B4/8/8/4K3 w - - 0 1",
  show: "d4",
};
const QUEEN_SCENE: ChessScene = {
  fen: "4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1",
  show: "d4",
};
const KNIGHT_SCENE: ChessScene = {
  fen: "4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1",
  show: "c3",
};
const KING_SCENE: ChessScene = {
  fen: "4k3/8/8/8/8/4K3/8/8 w - - 0 1",
  show: "e3",
};

/** 처음 자리의 폰은 두 칸까지 */
const PAWN_SCENE: ChessScene = {
  fen: "4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1",
  show: "e2",
};
/** 앞을 막힌 폰과 대각선으로 잡는 폰 */
const PAWN_CAPTURE: ChessScene = {
  fen: "4k3/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1",
  show: "e4",
};
/** 끝줄 바로 앞의 폰 */
const PROMOTION_SCENE: ChessScene = {
  fen: "k7/4P3/8/8/8/8/8/4K3 w - - 0 1",
  show: "e7",
};

/** 흑 룩이 체크를 불렀다. 같은 가로줄의 내 룩으로 잡는다 */
const CHECK_SCENE: ChessScene = { fen: "4k3/8/8/R3r3/8/8/8/4K3 w - - 0 1" };

/** 흑 킹이 자기 폰에 갇혔다. 룩을 끝줄로 보내면 체크메이트(백랭크 메이트) */
const MATE_SCENE: ChessScene = { fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1" };

/** 스테일메이트: 흑 차례인데 체크는 아니고 둘 곳이 없다(그림만) */
const STALEMATE_SCENE: ChessScene = {
  fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
};

/** 킹과 룩 사이가 비었다. 캐슬링할 수 있다 */
const CASTLE_SCENE: ChessScene = {
  fen: "4k3/8/8/8/8/8/5PPP/4K2R w K - 0 1",
  show: "e1",
};

/** 흑 폰이 d7에서 d5로 두 칸 나왔다. e5의 백 폰이 지나간 칸(d6)으로 잡는다 */
const EN_PASSANT_SCENE: ChessScene = {
  fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2",
  show: "e5",
};

/** 오프닝 미션에서 좋은 첫 수: 가운데 폰이나 나이트 */
const GOOD_OPENINGS = new Set(["e4", "d4", "c4", "Nf3", "Nc3"]);

export const CHESS_LESSONS: readonly ChessLesson[] = [
  {
    id: "goal",
    title: "체스는 어떤 게임?",
    summary: "백이 먼저 두고, 상대 킹을 체크메이트하면 이긴다",
    steps: [
      {
        kind: "explain",
        title: "킹을 잡을 수밖에 없게 몰아요",
        body: [
          "체스는 **백(흰색)**과 **흑(검은색)**이 기물 16개씩을 들고 두는 게임이에요. **백이 먼저** 둬요.",
          "한 번에 기물 하나를 움직여요. 상대 기물이 있는 칸으로 가면 그 기물을 **잡아요**.",
          "상대 **킹**이 어디로 가도 잡히게 몰면(**체크메이트**) 이겨요.",
        ],
        scene: START,
      },
      {
        kind: "explain",
        title: "룩: 곧게 달리는 기물",
        body: [
          "**룩**은 가로·세로로 막힐 때까지 몇 칸이든 가요. 점이 룩이 갈 수 있는 곳이에요.",
          "가는 길에 상대 기물이 있으면 그 기물을 잡을 수 있어요.",
        ],
        scene: ROOK_SCENE,
      },
      {
        kind: "quiz",
        question: "체스는 어떻게 이길까요?",
        options: [
          "상대 킹을 체크메이트한다",
          "상대 기물을 모두 잡는다",
          "내 폰을 상대 끝줄까지 보낸다",
        ],
        answer: 0,
        explain:
          "킹이 어디로 가도 잡히는 상태가 **체크메이트**예요. 기물을 다 잡지 않아도 체크메이트면 끝나요.",
      },
      {
        kind: "mission",
        title: "폰 잡기",
        objective: "**룩**으로 공짜로 잡을 수 있는 흑 **폰**을 잡으세요.",
        hint: "내 룩(d1)과 같은 세로줄 위쪽(d6)에 흑 폰이 있어요.",
        scenario: ROOK_SCENE,
        check: firstTo("d6"),
        success: "잡았어요! 상대 기물 칸으로 가면 그 기물을 잡아요.",
        fail: "아직 폰을 잡지 않았어요. 룩과 같은 줄에 있는 폰을 찾아보세요.",
        solution: [move("d1", "d6")],
        mistake: [move("d1", "d2")],
      },
    ],
  },
  {
    id: "pieces",
    title: "비숍·퀸·나이트·킹",
    summary: "비숍은 대각선, 퀸은 모든 방향, 나이트는 뛰어넘고, 킹은 한 칸",
    steps: [
      {
        kind: "explain",
        title: "비숍과 퀸",
        body: [
          "**비숍**은 대각선으로 막힐 때까지 가요. 처음 선 칸 색(밝은 칸·어두운 칸)을 끝까지 벗어나지 못해요.",
          "**퀸**은 룩과 비숍을 합친 기물이에요. 가로·세로·대각선 모두 가요. 가장 센 기물이에요.",
        ],
        scene: BISHOP_SCENE,
      },
      {
        kind: "explain",
        title: "퀸은 여덟 방향",
        body: ["점을 보면 퀸이 얼마나 넓게 움직이는지 알 수 있어요."],
        scene: QUEEN_SCENE,
      },
      {
        kind: "explain",
        title: "나이트는 뛰어넘어요",
        body: [
          "**나이트**는 두 칸 곧게 가고 옆으로 한 칸, 알파벳 L 모양으로 가요.",
          "나이트만은 **다른 기물을 뛰어넘을 수 있어요**. 그래서 막혀 있어도 나갈 수 있어요.",
        ],
        scene: KNIGHT_SCENE,
      },
      {
        kind: "explain",
        title: "킹은 한 칸씩",
        body: [
          "**킹**은 어느 방향으로든 한 칸만 가요.",
          "상대 기물이 노리는 칸으로는 갈 수 없어요. 킹이 잡히면 지니까요.",
        ],
        scene: KING_SCENE,
      },
      {
        kind: "quiz",
        question: "다른 기물을 **뛰어넘을 수 있는** 기물은?",
        options: ["퀸", "나이트", "비숍"],
        answer: 1,
        explain:
          "나이트만 뛰어넘어요. 퀸·룩·비숍은 길이 막히면 그 앞에서 멈춰요.",
      },
      {
        kind: "mission",
        title: "나이트로 퀸 잡기",
        objective: "**나이트**로 흑 **퀸**을 잡으세요.",
        hint: "나이트(c3)가 L 모양으로 갈 수 있는 칸 가운데 퀸이 있는 곳(d5)이 있어요.",
        scenario: KNIGHT_SCENE,
        check: firstTo("d5"),
        success:
          "퀸을 얻었어요! 나이트는 엉뚱한 곳을 노려 큰 기물을 잡곤 해요.",
        fail: "그 칸에는 퀸이 없어요. 나이트가 갈 수 있는 칸을 다시 보세요.",
        solution: [move("c3", "d5")],
        mistake: [move("c3", "b5")],
      },
    ],
  },
  {
    id: "pawn",
    title: "폰과 승급",
    summary:
      "폰은 앞으로 한 칸(처음엔 두 칸), 잡을 때는 대각선. 끝줄에 닿으면 바뀐다",
    steps: [
      {
        kind: "explain",
        title: "폰은 앞으로만",
        body: [
          "**폰**은 앞으로 한 칸 가요. 처음 자리에 있을 때만 **두 칸**까지 갈 수 있어요.",
          "뒤로는 못 가요. 앞 칸이 막히면 멈춰 서요.",
        ],
        scene: PAWN_SCENE,
      },
      {
        kind: "explain",
        title: "잡을 때는 대각선",
        body: [
          "폰은 앞으로 가지만, **잡을 때는 앞쪽 대각선 한 칸**이에요.",
          "그림에서 e4 폰은 앞(e5)이 비었으니 갈 수 있고, d5·f5의 흑 폰을 잡을 수도 있어요.",
        ],
        scene: PAWN_CAPTURE,
      },
      {
        kind: "explain",
        title: "끝줄에 닿으면 승급",
        body: [
          "폰이 상대 끝줄에 닿으면 **퀸·룩·비숍·나이트 가운데 하나로 바뀌어요(승급)**.",
          "거의 언제나 가장 센 **퀸**을 골라요.",
        ],
        scene: PROMOTION_SCENE,
      },
      {
        kind: "quiz",
        question: "폰은 상대 기물을 어떻게 잡나요?",
        options: ["앞쪽 대각선 한 칸으로", "바로 앞 칸으로", "옆 칸으로"],
        answer: 0,
        explain: "폰은 곧게 가지만 잡을 때만 대각선이에요.",
      },
      {
        kind: "mission",
        title: "퀸으로 승급",
        objective: "폰을 끝줄로 보내 **퀸**으로 바꾸세요.",
        hint: "e7 폰을 e8로 옮기면 무엇으로 바꿀지 묻는 창이 떠요. 퀸을 고르세요.",
        scenario: PROMOTION_SCENE,
        check: (ctx) => {
          const moved = myFirstMove(ctx);
          if (!moved) return null;
          return moved.promotion === "Q" ? "success" : "fail";
        },
        success: "퀸이 하나 더 생겼어요! 끝줄에 닿은 폰은 큰 힘이 돼요.",
        fail: "아직 퀸으로 바꾸지 않았어요. 폰을 끝줄(e8)로 보내 보세요.",
        solution: [move("e7", "e8", "Q")],
        mistake: [move("e1", "d1")],
      },
    ],
  },
  {
    id: "check",
    title: "체크",
    summary: "킹이 노려지면 체크. 다음 수로 반드시 풀어야 한다",
    steps: [
      {
        kind: "explain",
        title: "체크!",
        body: [
          "상대 기물이 내 킹을 잡을 수 있게 되면 **체크**예요. 체크를 받으면 다음 수로 꼭 풀어야 해요.",
          "풀기는 셋이에요. ① 킹을 비킨다 ② 사이를 막는다 ③ 체크한 기물을 잡는다. 킹이 잡히게 되는 수는 둘 수 없어요.",
        ],
        scene: CHECK_SCENE,
      },
      {
        kind: "quiz",
        question: "체크를 받았어요. 할 수 **없는** 것은?",
        options: [
          "킹을 노리지 않는 칸으로 비킨다",
          "체크한 기물을 잡는다",
          "체크를 두고 다른 기물을 움직인다",
        ],
        answer: 2,
        explain: "체크는 무조건 풀어야 해요. 그냥 두는 수는 둘 수 없어요.",
      },
      {
        kind: "mission",
        title: "체크 풀기",
        objective:
          "흑 룩이 **체크**를 불렀어요. 내 **룩**으로 그 룩을 잡아 체크를 푸세요.",
        hint: "내 룩(a5)과 흑 룩(e5)은 같은 가로줄에 있어요.",
        scenario: CHECK_SCENE,
        check: firstTo("e5"),
        success:
          "체크를 풀고 룩까지 얻었어요! 체크한 기물을 잡는 것이 가장 좋은 풀기예요.",
        fail: "체크는 풀었지만 룩을 잡을 기회를 놓쳤어요. 다시 해 봐요.",
        solution: [move("a5", "e5")],
        mistake: [move("e1", "d1")],
      },
    ],
  },
  {
    id: "mate",
    title: "체크메이트와 스테일메이트",
    summary:
      "체크를 풀 수 없으면 체크메이트. 체크가 아닌데 둘 수가 없으면 비긴다",
    steps: [
      {
        kind: "explain",
        title: "체크메이트로 끝내요",
        body: [
          "체크를 받았는데 킹이 비킬 곳도, 막을 기물도, 잡을 방법도 없으면 **체크메이트**예요. 그 판을 이겨요.",
          "그림에서 흑 킹은 자기 폰 셋에 갇혀 앞으로 나올 수 없어요. 끝줄이 비어 있으면 위험해요.",
        ],
        scene: MATE_SCENE,
      },
      {
        kind: "explain",
        title: "스테일메이트는 비김",
        body: [
          "둘 차례인데 **체크는 아니면서 둘 수 있는 수가 하나도 없으면** 비겨요(**스테일메이트**).",
          "그림은 흑 차례예요. 흑 킹은 체크가 아니지만 어디로 가도 잡혀요. 이길 판을 비기지 않게 조심해요.",
        ],
        scene: STALEMATE_SCENE,
      },
      {
        kind: "quiz",
        question: "내 차례에 체크가 아닌데 둘 수가 없어요. 어떻게 될까요?",
        options: ["진다", "비긴다(스테일메이트)", "한 수 쉰다"],
        answer: 1,
        explain: "체스에는 쉬기가 없어요. 둘 수가 없는데 체크가 아니면 비겨요.",
      },
      {
        kind: "mission",
        title: "체크메이트 두기",
        objective: "한 수로 **체크메이트**를 만드세요.",
        hint: "룩(a1)을 흑 킹이 있는 끝줄(a8)로 보내 보세요.",
        scenario: MATE_SCENE,
        check: (ctx) => (myFirstMove(ctx) ? (wonRound(ctx) ?? "fail") : null),
        success: "체크메이트! 킹이 갈 곳이 없게 몰면 이겨요.",
        fail: "아직 체크메이트가 아니에요. 흑 킹이 피할 곳이 없게 체크해 보세요.",
        solution: [move("a1", "a8")],
        mistake: [move("a1", "a7")],
      },
    ],
  },
  {
    id: "special",
    title: "캐슬링과 앙파상",
    summary: "킹과 룩을 한 번에 옮기는 캐슬링, 지나간 폰을 잡는 앙파상",
    steps: [
      {
        kind: "explain",
        title: "캐슬링: 킹을 안전하게",
        body: [
          "킹을 룩 쪽으로 **두 칸** 옮기면 룩이 킹을 넘어 바로 옆에 와요. 이것을 **캐슬링**이라고 해요. 킹을 눌러 두 칸 옆 칸을 고르면 돼요.",
          "킹과 그 룩이 한 번도 움직이지 않았고, 사이가 비었고, 킹이 체크가 아니고, 킹이 지나가는 칸을 상대가 노리지 않을 때만 할 수 있어요.",
        ],
        scene: CASTLE_SCENE,
      },
      {
        kind: "explain",
        title: "앙파상: 지나간 폰 잡기",
        body: [
          "상대 폰이 처음 자리에서 **두 칸** 나와 내 폰 바로 옆에 서면, 바로 다음 수에만 그 폰이 **지나간 칸으로 가며 잡을 수** 있어요.",
          "그림에서 흑 폰이 d7에서 d5로 왔어요. e5의 백 폰이 d6으로 가면 d5 폰을 잡아요. 한 수 미루면 기회가 사라져요.",
        ],
        scene: EN_PASSANT_SCENE,
      },
      {
        kind: "quiz",
        question: "앙파상은 언제 할 수 있나요?",
        options: [
          "상대 폰이 두 칸 나와 내 폰 옆에 선 바로 다음 수",
          "내 폰이 끝줄에 닿았을 때",
          "아무 때나 옆 칸 폰을 잡을 때",
        ],
        answer: 0,
        explain:
          "바로 다음 수 한 번뿐이에요. 다른 수를 두면 그 기회는 사라져요.",
      },
      {
        kind: "mission",
        title: "캐슬링하기",
        objective: "킹 쪽으로 **캐슬링**하세요.",
        hint: "킹(e1)을 누르고 두 칸 오른쪽(g1)을 누르면 룩이 f1로 와요.",
        scenario: CASTLE_SCENE,
        check: (ctx) => {
          const moved = myFirstMove(ctx);
          if (!moved) return null;
          return moved.castle ? "success" : "fail";
        },
        success: "캐슬링! 킹은 구석에 숨고 룩은 가운데로 나왔어요.",
        fail: "그 수는 캐슬링이 아니에요. 킹을 룩 쪽으로 두 칸 옮겨 보세요.",
        solution: [move("e1", "g1")],
        mistake: [move("e1", "f1")],
      },
    ],
  },
  {
    id: "opening",
    title: "오프닝 원칙",
    summary: "가운데를 차지하고, 기물을 꺼내고, 일찍 캐슬링한다",
    steps: [
      {
        kind: "explain",
        title: "가운데부터",
        body: [
          "판 가운데 네 칸(d4·e4·d5·e5)을 차지하면 기물이 넓게 움직여요. 첫 수로 **e4·d4** 같은 가운데 폰을 자주 둬요.",
          "**나이트·비숍을 먼저 꺼내요**. 처음 줄에 있으면 하는 일이 없어요.",
        ],
        scene: START,
      },
      {
        kind: "explain",
        title: "퀸은 아껴 두고, 킹은 숨겨요",
        body: [
          "퀸을 일찍 꺼내면 상대 기물에 쫓기며 수를 버려요.",
          "같은 기물을 여러 번 움직이기보다 여러 기물을 하나씩 꺼내요.",
          "기물을 꺼냈으면 **캐슬링**으로 킹을 구석에 숨겨요.",
        ],
        scene: START,
      },
      {
        kind: "quiz",
        question: "첫 수로 좋은 것은?",
        options: ["e4(가운데 폰)", "a3(가장자리 폰)", "Kf2(킹 앞으로)"],
        answer: 0,
        explain: "가운데 폰은 가운데를 차지하고 비숍·퀸이 나올 길도 열어요.",
      },
      {
        kind: "mission",
        title: "좋은 첫 수",
        objective:
          "첫 수로 **가운데를 차지하거나 나이트를 꺼내세요**(e4·d4·c4·Nf3·Nc3).",
        hint: "e2 폰을 두 칸(e4) 올려 보세요.",
        scenario: START,
        check: (ctx) => {
          const moved = myFirstMove(ctx);
          if (!moved) return null;
          return GOOD_OPENINGS.has(moved.san) ? "success" : "fail";
        },
        success: "좋은 출발이에요! 이렇게 가운데를 두고 기물을 하나씩 꺼내요.",
        fail: "그 수는 가운데와 상관이 없어요. 가운데 폰이나 나이트를 움직여 보세요.",
        solution: [move("e2", "e4")],
        mistake: [move("a2", "a3")],
      },
    ],
  },
  {
    id: "real",
    title: "실전",
    summary: "처음부터 입문 컴퓨터와 한 판",
    steps: [
      {
        kind: "explain",
        title: "두는 요령",
        body: [
          "한 수 두기 전에 ① 상대가 내 기물을 잡을 수 있나 ② 내가 공짜로 잡을 기물이 있나를 살펴요.",
          "기물 점수: 폰 1·나이트 3·비숍 3·룩 5·퀸 9. 큰 기물을 작은 기물과 바꾸지 않게 조심해요.",
          "기물 차이가 크면 퀸과 룩으로 상대 킹을 가장자리로 몰아 체크메이트해요.",
        ],
      },
      {
        kind: "mission",
        title: "첫 승리",
        objective: "백으로 **입문 컴퓨터**와 한 판 두어 이기세요.",
        hint: "공짜로 내주지 말고 공짜는 잡아요. 앞서면 퀸으로 킹을 몰아요.",
        scenario: null,
        check: wonRound,
        success: "첫 승리예요! 이제 중수·고수와 겨뤄 보세요.",
        fail: "아쉬워요. 내 기물이 잡히지 않는지 살피며 다시 해 봐요.",
      },
    ],
  },
];
