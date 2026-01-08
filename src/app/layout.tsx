import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Abacus",
  description: "AI usage analytics for your team",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${GeistMono.variable} antialiased noise-overlay min-h-screen flex flex-col bg-[#050507]`}>
        <Providers>
          <div className="flex-1 flex flex-col">
            {children}
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
