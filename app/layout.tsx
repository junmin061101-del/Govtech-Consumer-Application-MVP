import type { Metadata, Viewport } from "next";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareOS 동작구 돌봄지도",
  description: "우리 아이 나이·시간·위치에 맞는 동작구 어린이집 빈자리를 지도에서 찾고 바로 신청하세요.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
