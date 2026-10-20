"use client";

import type { Card } from "@mighty/engine";

import { CardArt } from "./CardArt";
import { CLASSIC, FACE_DEMO_THEMES } from "./themes";

const FACES: Card[] = [
  "SK",
  "SQ",
  "SJ",
  "HK",
  "HQ",
  "HJ",
  "DK",
  "DQ",
  "DJ",
  "CK",
  "CQ",
  "CJ",
];

const NOTES: Record<string, string> = {
  classic: "지금 쓰는 글자형",
  "demo-court": "직접 그린 전통풍 인물. 저작권 걱정 없음",
  "demo-traditional":
    "위키미디어 공용, Dmitry Fomin, CC0. 원본 비율(2:3)을 늘려 맞춤",
  "demo-original": "원작 그림(71×96)을 Scale3x로 9배. 저장소에 올리지 않음",
};

/** 그림 카드 그리는 방법 비교(/cards/faces). 고른 방법만 테마로 넣는다 */
export function FaceComparison() {
  const rows = [CLASSIC, ...FACE_DEMO_THEMES];
  return (
    <main className="min-h-dvh bg-[#0a3622] p-4">
      <h1 className="mb-1 font-bold text-lg">그림 카드 비교</h1>
      <p className="mb-4 text-sm opacity-70">
        J·Q·K를 그리는 세 가지 방법을 지금 모양과 나란히 놓았다.
      </p>
      <div className="flex flex-col gap-6">
        {rows.map((theme) => (
          <section key={theme.id} className="flex flex-col gap-2">
            <h2 className="font-semibold">
              {theme.id === "classic" ? "지금" : theme.name}
              <span className="ml-2 font-normal text-xs opacity-60">
                {NOTES[theme.id]}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {FACES.map((card) => (
                <div key={card} className="aspect-[5/7] w-28 drop-shadow-lg">
                  <CardArt card={card} theme={theme} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
