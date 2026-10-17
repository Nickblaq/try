import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

import AppShell from "@/components/AppShell";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body 
        className={`${grotesk.variable} ${plexMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
