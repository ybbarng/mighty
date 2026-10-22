import type { Metadata } from "next";

import { ProfilePage } from "@/stats/ProfilePage";

export const metadata: Metadata = {
  title: "내 기록",
  description: "이 기기에 쌓인 마이티·하트 판 기록으로 보는 승률과 명장면",
};

export default function Profile() {
  return <ProfilePage />;
}
