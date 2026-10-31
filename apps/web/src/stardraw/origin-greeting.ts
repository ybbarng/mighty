/**
 * 특별한 출신 우주인에게 창구 직원이 놀라며 건네는 말(2026-10-31 사용자). 우리 은하의 보통 주소는 대상이 아니다
 * (남발하지 않는다). 지구·달·태양, 안드로메다은하(본 은하와 그 위성 은하·성단), 그 밖의 다른 은하, M87 블랙홀만.
 * 판정은 주소 id(places.ts)로 한다. 무작위는 넣어 받아 시험이 결정적이다
 */
import type { Astronaut } from "./astronaut/identity";
import { OTHER_GALAXY_PLACES } from "./astronaut/places";

export type Origin =
  | { kind: "earth" }
  | { kind: "moon" }
  | { kind: "sun" }
  | { kind: "blackhole" }
  | { kind: "andromeda" }
  /** 그 밖의 다른 은하. `galaxy`는 은하 이름(예: "대마젤란은하") */
  | { kind: "far"; galaxy: string };

/** 특별한 출신이면 그 갈래, 우리 은하의 보통 주소면 null */
export function originOf(
  a: Pick<Astronaut, "placeId" | "otherGalaxy">,
): Origin | null {
  const id = a.placeId;
  if (id === "earth" || (id.startsWith("earth/") && id !== "earth/moon"))
    return { kind: "earth" };
  if (id === "earth/moon") return { kind: "moon" };
  if (id === "sun") return { kind: "sun" };
  if (id === "m87/m87-bh") return { kind: "blackhole" };
  if (id === "m31" || id.startsWith("m31/")) return { kind: "andromeda" };
  if (!a.otherGalaxy) return null;
  const root = OTHER_GALAXY_PLACES.find((p) => p.id === id.split("/")[0]);
  return { kind: "far", galaxy: root?.path.at(-1) ?? "그 은하" };
}

/** 갈래마다의 말(창구 직원이 진심으로 놀라는 결, 문장 끝 마침표·물음표) */
export function originLines(o: Origin): readonly string[] {
  switch (o.kind) {
    case "earth":
      return [
        "지구인이시군요! 지구가 그렇게 아름답다는데 정말 그런가요? 저도 가 보고 싶네요.",
        "와, 지구에서 오셨어요? 바다가 하늘보다 넓다던데, 정말인가요?",
        "지구인은 처음 뵈어요! 푸른 행성이라는 말, 사실인가요?",
      ];
    case "moon":
      return [
        "달에서 오셨다고요? 창밖으로 늘 지구가 보인다던데, 정말 부러워요.",
        "세상에, 달 주민이시군요! 거기서는 몸이 가볍다던데, 여기는 무겁지 않으세요?",
      ];
    case "sun":
      return [
        "태양에서 오셨다고요? 거기서 어떻게 지내셨는지 상상도 안 돼요. 뜨겁지는 않으셨나요?",
        "세상에, 태양 출신이시라니요! 오늘 이 창구가 유난히 환한 이유가 있었네요.",
      ];
    case "blackhole":
      // 사용자가 정한 문장 하나(정말 놀라는 결)
      return [
        "세상에... 블랙홀에서 어떻게 빠져나오셨죠? 물리학 책을 새로 써야겠어요.",
      ];
    case "andromeda":
      return [
        "안드로메다에서 오셨군요! 그곳에 사람들의 개념이 모두 모여 있다던데, 정말 그런가요?",
        "와, 안드로메다라니요! 지구 사람들이 개념을 거기 두고 왔다던데, 혹시 보셨어요?",
        "안드로메다 분은 처음 뵈어요! 개념이 모여 산다는 그 동네 이야기, 꼭 듣고 싶어요.",
      ];
    case "far":
      return [
        "정말 멀리서 오셨네요! 오시는 데 얼마나 걸리셨나요?",
        `${o.galaxy} 출신은 처음 봬요! 제 말은 알아들으실 수 있나요?`,
        `${o.galaxy}에서 여기까지요? 먼 길 오시느라 정말 고생 많으셨어요.`,
      ];
  }
}

/** 특별한 출신이면 말 하나(`random`은 [0, 1)), 아니면 null */
export function originGreeting(
  a: Pick<Astronaut, "placeId" | "otherGalaxy">,
  random: () => number,
): string | null {
  const o = originOf(a);
  if (!o) return null;
  const lines = originLines(o);
  return lines[Math.floor(random() * lines.length)] ?? lines[0] ?? null;
}
