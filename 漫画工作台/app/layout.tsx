import type { Metadata } from "next";
import "./globals.css";
import "./interactions.css";

export const metadata: Metadata = {
  title: "小粉漫画制作台",
  description: "本地优先的漫画脚本、分镜、角色连续性与排版工作台"
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
