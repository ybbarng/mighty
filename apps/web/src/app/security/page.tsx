import type { Metadata } from "next";

import { SecurityPage } from "@/components/security/SecurityPage";

export const metadata: Metadata = {
  title: "어떻게 지켜지나요?",
  description:
    "서버 없는 온라인 카드 게임에서 엿보기·섞기 조작·결과 조작·사칭을 어떻게 막는지, 실제 코드로 해 보는 설명",
};

export default function Security() {
  return <SecurityPage />;
}
