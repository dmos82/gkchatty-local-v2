import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Platform Runner - A Mario-style Platformer",
  description: "2D platformer game with AI-generated pixel art sprites",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
