import type { Metadata, Viewport } from "next";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareOS 돌봄지도",
  description: "우리 아이 나이·필요한 시간·위치에 맞는 돌봄 시설을 지도에서 찾고, 신청하고, 자리가 나면 알림을 받으세요.",
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "CareOS", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#059669" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
