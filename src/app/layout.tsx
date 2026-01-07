import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AI Usage Tracker",
  description: "Track AI coding tool usage across your team",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased noise-overlay">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
