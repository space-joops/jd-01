import type { Metadata, Viewport } from "next";
import OrbitTracker from "../components/orbit-tracker";

export const metadata: Metadata = {
  title: "궤도 관제 // SPACE JOOPS",
  description: "냠냠샛이 지금 지구 어디를 돌고 있는지 실시간으로 추적하는 관제 화면.",
};

export const viewport: Viewport = {
  themeColor: "#070a16",
  viewportFit: "cover",
};

export default function TrackPage() {
  return <OrbitTracker />;
}
