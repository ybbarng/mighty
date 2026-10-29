"use client";

import { useEffect, useState } from "react";

/**
 * 보낸 행동의 결과를 기다리는 동안 화면을 잠근다(화투 세 게임 공통).
 *
 * 멘탈 포커 판에서는 행동을 보낸 뒤 다음 장면이 오기까지 상대 기기의 카드 열기 응답을 기다린다.
 * 그사이 결정(`view.decision`)은 아직 예전 것이라, 잠그지 않으면 물음 창·손패·단추가 그대로 남아
 * 한 번 더 누르게 된다(두 번째 행동은 거절되어 "잘못된 행동"이 난다).
 *
 * - `scene`: 지금 장면을 나타내는 값. 새 장면이면 달라져야 한다(장면 번호, 또는 장면마다 새로 만드는 `view`).
 * - `mark()`: 행동이 받아들여진 직후 부른다. 지금 장면을 기억한다.
 * - `waiting`: 기억한 장면이 지금 장면이면 참. 다음 장면이 오면 저절로 풀린다.
 * - 거절 알림(`notice`)이 오면 바로 푼다. 거절은 장면을 바꾸지 않아 이것이 없으면 영영 잠긴다.
 *
 * 혼자 하기처럼 행동이 곧바로 다음 장면을 만들면, 다음 그리기에서 장면이 이미 달라 잠기지 않는다.
 */
export function useSentLock(scene: unknown, notice: string | null) {
  const [sentAt, setSentAt] = useState<{ scene: unknown } | null>(null);
  useEffect(() => {
    if (notice) setSentAt(null);
  }, [notice]);
  return {
    waiting: sentAt !== null && sentAt.scene === scene,
    mark: () => setSentAt({ scene }),
  };
}
