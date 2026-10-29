import { type Page, ready } from "./test";

/** 옵션에서 규칙을 고른다(없으면 지금 규칙 그대로) */
export async function chooseRule(page: Page, preset?: string) {
  if (!preset) return;
  await ready(page);
  await page.getByRole("button", { name: "옵션", exact: true }).click();
  await page.getByRole("button", { name: preset, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
}

/** 첫 화면에서 나홀로 마이티를 시작한다 */
export async function startSolo(page: Page, preset?: string) {
  await chooseRule(page, preset);
  await page.getByRole("button", { name: /나홀로 마이티/ }).click();
}
