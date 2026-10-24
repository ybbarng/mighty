/** 만든 사람 표시. 시작 화면·소개·배우기 페이지 아래에 쓴다 */
export function MadeWith() {
  return (
    <>
      © 2026 ybbarng with{" "}
      <a
        href="https://claude.com/claude-code"
        target="_blank"
        rel="noopener noreferrer"
        className="whitespace-nowrap underline underline-offset-2 hover:opacity-80"
      >
        Claude Code
      </a>
    </>
  );
}
