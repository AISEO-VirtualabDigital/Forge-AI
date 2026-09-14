import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forge — Lightweight Website Builder with AI & SEO",
  description:
    "A lightweight, AI-powered website builder with drag & drop, hybrid editing, custom code mode, and a full SEO toolkit. Generate sections, optimize meta tags, and ship faster.",
  keywords: [
    "website builder",
    "drag and drop builder",
    "AI website builder",
    "SEO tools",
    "landing page builder",
    "no code",
    "low code",
  ],
  authors: [{ name: "Forge" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Forge — Lightweight Website Builder with AI & SEO",
    description:
      "Drag & drop, hybrid, and custom code editing modes with a floating AI assistant and a full SEO toolkit.",
    siteName: "Forge",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Forge — Lightweight Website Builder",
    description: "AI-powered builder with full SEO toolkit.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Sonner position="bottom-center" richColors closeButton />
      </body>
    </html>
  );
}
