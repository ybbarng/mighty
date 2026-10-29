import type { Page } from "@playwright/test";

/**
 * 시험 속도. 화면의 "빠르게"(1.6)보다 크게 둬 컴퓨터 차례·이벤트 사이 기다림을 줄인다.
 * 기다림을 줄일 뿐 진행 순서는 같다(store의 wait가 ms / speed 로 기다린다).
 */
export const TEST_SPEED = 8;

/**
 * 카드 게임 화면 시험의 기본 준비: 움직임 줄이기(섞기·나눠 주기 연출을 실제 시간으로 기다리지 않는다),
 * 스플래시 건너뛰기, 시험 속도, 소리 끔. `storage`는 더 넣을 localStorage 값(게임별 설정 등).
 * 연출이 있는 길은 따로 한 시험(`play-round`의 "연출을 켜면")이 본다.
 */
export async function prepareFast(
  page: Page,
  storage: Record<string, unknown> = {},
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ speed, extra }) => {
      sessionStorage.setItem("mighty-splash-seen", "1");
      localStorage.setItem(
        "mighty-settings",
        JSON.stringify({ state: { speed, sound: false }, version: 0 }),
      );
      for (const [key, value] of Object.entries(extra))
        localStorage.setItem(key, JSON.stringify(value));
    },
    { speed: TEST_SPEED, extra: storage },
  );
}
