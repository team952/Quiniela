import type { Metadata } from "next";
import { Geist_Mono, Anton, Archivo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Quiniela Mundial 2026',
  description: 'Pronostica los resultados del Mundial 2026 y compite con tus amigos.',
  icons: {
    icon: [
      { url: `${SITE_URL}/favicon.svg`,    type: 'image/svg+xml' },
      { url: `${SITE_URL}/favicon-32.png`, sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: `${SITE_URL}/apple-touch-icon.png` },
    other: [
      { rel: 'icon', url: `${SITE_URL}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { rel: 'icon', url: `${SITE_URL}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Quiniela Mundial 2026',
    description: 'Pronostica los resultados del Mundial 2026 y compite con tus amigos.',
    images: [{ url: `${SITE_URL}/og-quiniela.jpg`, width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: [`${SITE_URL}/og-quiniela.jpg`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${anton.variable} ${archivo.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-[#081225] text-[#eef4fb] font-[family-name:var(--font-archivo)]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
