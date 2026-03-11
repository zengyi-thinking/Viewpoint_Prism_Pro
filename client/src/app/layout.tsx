import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/theme/ThemeProvider";
import { QueryClientProvider } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Viewpoint Prism Pro - 视频内容工作台",
  description: "一个工作台，四种生产模式。将视频并行处理为学习笔记、二创视频、多语种译制、多平台图文。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">
        <QueryClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
