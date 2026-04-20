import type { Metadata } from "next";
import "../styles/index.css";
import { PublicAudioProvider } from "@/app/components/public-audio-context";

export const metadata: Metadata = {
  title: "splotch",
  description: "splotch | our media archive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#050505] text-white" suppressHydrationWarning>
      <body className="min-h-screen bg-[#050505] text-white antialiased" suppressHydrationWarning>
        <PublicAudioProvider>
          <div className="flex min-h-screen flex-col bg-[#050505] text-white">
            <div className="flex-1">{children}</div>
            <footer className="border-t border-white/10 px-6 py-4 text-center text-[11px] uppercase tracking-[0.2em] text-gray-500">
              copyright &copy; 2026 tim gable. all rights reserved.
            </footer>
          </div>
        </PublicAudioProvider>
      </body>
    </html>
  );
}
