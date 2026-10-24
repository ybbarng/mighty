export const REPO_URL = "https://github.com/ybbarng/mighty";

function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="whitespace-nowrap underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  );
}

/** 만든 사람 표시와 저장소 링크. 시작 화면·소개·배우기 페이지 아래에 쓴다 */
export function MadeWith() {
  return (
    <>
      © 2026 ybbarng with{" "}
      <OutLink href="https://claude.com/claude-code">Claude Code</OutLink> ·{" "}
      <OutLink href={REPO_URL}>GitHub</OutLink>
    </>
  );
}

/** 라이선스 링크(저장소의 LICENSE) */
export function LicenseLink() {
  return <OutLink href={`${REPO_URL}/blob/main/LICENSE`}>MIT License</OutLink>;
}
