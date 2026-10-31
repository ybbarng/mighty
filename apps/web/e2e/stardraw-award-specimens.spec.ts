import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "./test";

/**
 * 기념 서류·훈장 견본 화면은 받기 전에는 무엇이 있는지 모르게 운영 빌드에 넣지 않는다(docs/36 11-19, 사용자).
 * 화면 시험이 쓰는 빌드(out/)는 CI·운영과 같은 설정이라, 견본 주소가 없고 견본 표시(data-award-specimen)가
 * 어떤 파일에도 들어가지 않았는지 본다. 로컬에서 NEXT_PUBLIC_STARDRAW_SPECIMENS=1로 빌드했으면 건너뛴다
 */
test.skip(
  process.env.NEXT_PUBLIC_STARDRAW_SPECIMENS === "1",
  "견본을 켠 로컬 빌드",
);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("운영 빌드에는 기념 서류 견본 화면이 없다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "빌드 검사는 한 번만");
  const res = await page.goto("/stardraw/awards");
  expect(res?.status()).toBe(404);
  const out = join(process.cwd(), "out");
  const leaked = files(out).filter(
    (f) =>
      /\.(html|js|txt)$/.test(f) &&
      readFileSync(f, "utf8").includes("data-award-specimen"),
  );
  expect(leaked).toEqual([]);
});
