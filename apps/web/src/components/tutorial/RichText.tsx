import { Fragment } from "react";

import { SuitText } from "../SuitText";

/** `**굵게**`만 지원하는 아주 작은 글 표시. 무늬 기호는 설정한 표기 방식으로 그린다 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 글 조각은 순서가 곧 정체다
          <b key={i} className="text-amber-200">
            <SuitText text={part.slice(2, -2)} />
          </b>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 글 조각은 순서가 곧 정체다
          <Fragment key={i}>
            <SuitText text={part} />
          </Fragment>
        ),
      )}
    </>
  );
}
