/**
 * 하트 규칙. 기본값은 윈도우 하트(Microsoft Hearts)와 같다.
 * 지역마다 갈리는 부분만 옵션으로 둔다(docs/hearts/01-rules.md).
 */
export interface HeartsRules {
  /** 카드 넘기기. `cycle`은 왼쪽 → 오른쪽 → 맞은편 → 안 넘김을 되풀이한다 */
  passing: "cycle" | "left" | "none";
  /** 넘기는 장수 */
  passCount: number;
  /**
   * 문 슛(하트 13장과 ♠Q를 모두 먹기).
   * `others`: 다른 사람이 26점씩 받는다(윈도우). `self`: 내 점수에서 26점을 뺀다. `off`: 없음
   */
  moon: "others" | "self" | "off";
  /** 하트 깨기: 하트가 나오기 전에는 하트로 선을 잡을 수 없다(손에 하트뿐이면 예외) */
  heartsBreak: boolean;
  /** ♠Q가 나와도 하트가 깨진 것으로 친다 */
  queenBreaksHearts: boolean;
  /** 첫 턴에 점수 카드(하트·♠Q)를 낼 수 있다. 끄면 그것밖에 없을 때만 낸다 */
  firstTrickPoints: boolean;
  /** ◆J를 먹으면 10점을 뺀다(Omnibus 하트) */
  jackOfDiamonds: boolean;
  /** 누군가 이 점수 이상이면 게임이 끝난다 */
  endScore: number;
}

export const WINDOWS_RULES: HeartsRules = {
  passing: "cycle",
  passCount: 3,
  moon: "others",
  heartsBreak: true,
  queenBreaksHearts: false,
  firstTrickPoints: false,
  jackOfDiamonds: false,
  endScore: 100,
};

export const PLAYER_COUNT = 4;
export const HAND_SIZE = 13;
