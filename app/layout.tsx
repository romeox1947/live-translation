import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveLingo — Live video translation",
  description: "Watch videos with real-time spoken translation.",
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
