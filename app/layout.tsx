import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Providers } from "@/components/providers";
import { getCurrentUser } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en-AU" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-dvh font-sans antialiased`}>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <AppHeader user={user} />
            {/* Bottom padding leaves room for the mobile bottom nav */}
            <main className={user ? "flex-1 pb-24 md:pb-8" : "flex-1 pb-8"}>{children}</main>
            {user ? <BottomNav /> : null}
          </div>
        </Providers>
      </body>
    </html>
  );
}
