// 서버를 Node가 바로 돌리는 파일 하나로 묶는다(작업 공간 패키지와 의존 패키지까지 모두 넣는다)
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/main.ts",
  platform: "node",
  output: { file: "dist/server.mjs", format: "esm" },
  // node:sqlite 같은 내장 모듈만 밖에 둔다
  external: [/^node:/],
});
