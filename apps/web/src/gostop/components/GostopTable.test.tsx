import {
  createGostopScenario,
  MATGO_RULES,
  viewOf,
} from "@mighty/gostop-engine";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GostopHost } from "../store";
import { useGostop } from "../store";
import { GostopTable } from "./GostopTable";

/*
 * 행동을 보낸 뒤 다음 장면이 오기 전의 화면. 멘탈 포커 판에서는 방장 자신의 행동도 상대 기기의 카드 열기 응답을
 * 기다리느라 다음 장면이 늦게 온다. 그사이 물음 창·손패가 그대로 남으면 한 번 더 내게 된다
 * (화면 시험이 부하 아래에서 사라진 「한 장만 내기」를 기다리다 멈춘 원인).
 * 여기서는 다음 장면을 일부러 보내지 않아, 기다리는 사이를 부하 없이 늘 재현한다.
 */

/** 손에 1월 석 장, 바닥에 1월이 없다: 1월을 내면 흔들기를 묻는다 */
function shakeScene() {
  const state = createGostopScenario({
    rules: MATGO_RULES,
    hands: [
      ["01g", "01r", "01p", "03g", "05a"],
      ["02a", "04a", "06a", "07a", "08a"],
    ],
    floor: ["09a", "10a"],
    deck: ["11a", "12a", "02r", "04r"],
  });
  return viewOf(state, 0);
}

let submit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  submit = vi.fn(() => ({ ok: true }) as const);
  const host = { seat: 0, submit } as unknown as GostopHost;
  useGostop.setState({
    view: shakeScene(),
    host,
    // 혼자 하기 모양(채팅 없음). 무르기는 튜토리얼처럼 막아 둔다
    local: {} as never,
    practice: true,
    queue: [],
    events: [],
    seq: 1,
    notice: null,
  });
});

afterEach(() => cleanup());

const status = () => screen.getByRole("status").textContent ?? "";
const handCard = (id: string) =>
  document.querySelector(`section[aria-label="손패"] [data-card="${id}"]`);
const shakeDialog = () => screen.queryByRole("dialog", { name: "흔들기·폭탄" });

/** 손패를 골랐다가 다시 눌러 낸다 */
function playTwice(id: string) {
  fireEvent.click(handCard(id) as Element);
  fireEvent.click(handCard(id) as Element);
}

describe("고스톱 화면: 보낸 행동의 결과를 기다리는 동안", () => {
  it("흔들기 창에서 「한 장만 내기」를 누르면 다음 장면 전이라도 창이 닫히고, 다시 낼 수 없다", () => {
    render(<GostopTable onExit={() => {}} />);
    expect(status()).toContain("내 차례");

    playTwice("01g");
    expect(shakeDialog()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "한 장만 내기" }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ type: "play", card: "01g" });
    // 다음 장면은 아직 오지 않았다
    expect(shakeDialog()).toBeNull();
    expect(status()).toBe("보내는 중…");
    // 손패는 누를 수 없어 두 번째 행동이 나가지 않는다
    expect(handCard("01r")?.tagName).not.toBe("BUTTON");
    fireEvent.click(handCard("01r") as Element);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("다음 장면이 오면 잠금이 풀린다", () => {
    render(<GostopTable onExit={() => {}} />);
    playTwice("01g");
    fireEvent.click(screen.getByRole("button", { name: "한 장만 내기" }));
    expect(status()).toBe("보내는 중…");

    act(() => {
      useGostop.setState({ view: shakeScene(), seq: 2 });
    });
    expect(status()).toContain("내 차례");
  });

  it("거절되면(장면은 그대로, 알림만 온다) 잠금이 풀려 다시 낼 수 있다", () => {
    render(<GostopTable onExit={() => {}} />);
    playTwice("01g");
    fireEvent.click(screen.getByRole("button", { name: "한 장만 내기" }));
    expect(status()).toBe("보내는 중…");

    act(() => {
      useGostop.setState({ notice: "잠깐만요" });
    });
    act(() => {
      useGostop.setState({ notice: null });
    });
    expect(status()).toContain("내 차례");
    playTwice("01g");
    expect(shakeDialog()).not.toBeNull();
  });

  it("행동이 거절되어 보내지지 않으면(ok: false) 잠그지 않는다", () => {
    submit.mockReturnValue({ ok: false, error: "잠깐만요" });
    render(<GostopTable onExit={() => {}} />);
    playTwice("03g");
    expect(status()).not.toBe("보내는 중…");
  });
});
