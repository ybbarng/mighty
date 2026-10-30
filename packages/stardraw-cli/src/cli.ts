// 묶은 파일(dist/stardraw-verify.mjs)의 시작점. 시험은 main.ts를 직접 불러 쓴다
import { main } from "./main";

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
