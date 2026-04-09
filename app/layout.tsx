import type { Metadata } from "next";
import "../styles/index.css";
import { PublicAudioProvider } from "@/app/components/public-audio-context";

export const metadata: Metadata = {
  title: "Our Media Archive",
  description: "Private invite-only media archive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-black text-white" suppressHydrationWarning>
      <body className="min-h-screen bg-black text-white antialiased" suppressHydrationWarning>
        <PublicAudioProvider>
          <div className="flex min-h-screen flex-col bg-black text-white">
            <div className="flex-1">{children}</div>
            <footer className="border-t border-white/10 px-6 py-4 text-center text-[11px] uppercase tracking-[0.2em] text-gray-500">
              Copyright &copy; 2026 Tim Gable. All rights reserved.
            </footer>
          </div>
        </PublicAudioProvider>
      </body>
    </html>
  );
}
