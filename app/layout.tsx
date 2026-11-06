import type { Metadata } from 'next';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/ui/ServiceWorkerRegistration';
import { TvProvider } from '@/context/TvContext';

export const metadata: Metadata = {
  title: 'AGUENATV | Reprodução Inteligente e Privada',
  description: 'Sistema moderno e seguro de reprodução IPTV com busca relativa, catálogo rápido e histórico sincronizado.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full bg-[#0b0c10] text-[#f8fafc] dark">
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <TvProvider>
          {children}
        </TvProvider>
      </body>
    </html>
  );
}
