// 로컬 데모 봇을 Node가 바로 돌리는 파일 하나로 묶는다(운영 이미지에는 넣지 않는다)
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "scripts/demo-bots.ts",
  platform: "node",
  output: { file: "dist/demo-bots.mjs", format: "esm" },
  external: [/^node:/],
});
