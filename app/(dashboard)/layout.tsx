'use client';
import { Suspense } from 'react';
import { PlayerProvider } from '@/context/PlayerContext';
import Navbar from '@/components/ui/Navbar';
import FloatingPlayer from '@/components/player/FloatingPlayer';
import SyncReminder from '@/components/ui/SyncReminder';
import UpdateAlertModal from '@/components/ui/UpdateAlertModal';
import MobileBottomNav from '@/components/ui/MobileBottomNav';
import { DownloadProgressBar } from '@/components/ui/DownloadProgressBar';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import PullToRefresh from '@/components/ui/PullToRefresh';
import Footer from '@/components/ui/Footer';
import ScrollToTopOnNavigate from '@/components/ui/ScrollToTopOnNavigate';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <div className="min-h-screen bg-[#0b0c10] text-[#f8fafc] flex flex-col selection:bg-violet-600 selection:text-white">
        <Suspense fallback={null}>
          <ScrollToTopOnNavigate />
        </Suspense>
        <PullToRefresh />
        <OfflineBanner />
        <Suspense fallback={<header className="h-16 w-full glass-nav" />}>
          <Navbar />
        </Suspense>
        <Suspense
          fallback={
            <div className="min-h-[50vh] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <main className="flex-1">{children}</main>
        </Suspense>
        <Footer />
        <FloatingPlayer />
        <SyncReminder />
        <UpdateAlertModal />
        <DownloadProgressBar />
        <Suspense fallback={null}>
          <MobileBottomNav />
        </Suspense>
      </div>
    </PlayerProvider>
  );
}
