import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "AgentDesk AI — AI Customer Support & Sales Automation",
    template: "%s · AgentDesk AI",
  },
  description:
    "AI agents that actually work with your business. Customer support, lead qualification and automation connected to your real data, tools and workflows.",
  openGraph: {
    title: "AgentDesk AI — AI Customer Support & Sales Automation",
    description:
      "AI agents that actually work with your business. Customer support, lead qualification and automation connected to real data, tools and workflows.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const demoMode = process.env.DEMO_MODE !== "false";
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {demoMode ? (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              background: "#a15c00",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.3,
              padding: "4px 10px",
              textAlign: "center",
            }}
          >
            DEMO — fictional customers, orders and conversations. Nothing here is a real business, and the
            data resets on a schedule.
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
