import type { Metadata } from "next";
import ThemeProvider from "@/components/shared/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrewAI",
  description: "DataCaffe's BrewAI Gateway",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
