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

/**
 * 공개 데모의 화면 둘러보기에도 내 기록 견본(1~5등을 모두 받은 훈장·당첨증·기념 서류)이 없다(2026-10-31 사용자:
 * 데모에 보이면 스포일러). 실제로 받은 사람의 「내 기록」 화면 코드는 실려도 된다(코드를 읽어야 아는 수준)
 */
test("운영 빌드의 공개 데모 둘러보기에는 내 기록 견본이 없다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "한 번만");
  await page.goto("/stardraw/demo");
  const tour = page.getByRole("navigation", { name: "화면 둘러보기" });
  await expect(
    tour.getByRole("link", { name: "등록증", exact: true }),
  ).toBeVisible();
  await expect(
    tour.getByRole("link", { name: "내 기록", exact: true }),
  ).toHaveCount(0);
  await page.goto("/stardraw/demo#tour-records");
  await expect(tour).toBeVisible();
  await expect(page.locator("[data-my-records]")).toHaveCount(0);
  await expect(page.locator("[data-tour-screen='records']")).toHaveCount(0);
});
