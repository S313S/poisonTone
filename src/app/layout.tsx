import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "现场毒舌", description: "拍下眼前的破事，我替你吐槽。" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
