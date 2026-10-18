"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import Link, { NavigationGuardProvider } from "@/components/NavigationGuard";
import { useStore } from "@/store/useStore";
import DeviceTheme from "@/components/DeviceTheme";

export default function AdminLayout({ children }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const fetchSettings = useStore(state => state.fetchSettings);
  const isAuthenticated = useStore(state => state.isAuthenticated);
  const settings = useStore(state => state.settings);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refreshSettings = () => fetchSettings();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSettings();
    };

    if (!settings) refreshSettings();
    window.addEventListener('focus', refreshSettings);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(refreshSettings, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', refreshSettings);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [fetchSettings, isAuthenticated, settings]);

  return (
    <AuthGuard>
      <DeviceTheme />
      <NavigationGuardProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar 
          isMobileOpen={isMobileOpen} 
          setIsMobileOpen={setIsMobileOpen} 
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="lg:hidden p-4 bg-white border-b border-gray-200 flex items-center justify-between">
             <Link href="/" className="flex items-center gap-2 font-bold text-gray-800">
               <img src="/icon.png" alt="LitePOS Warna Warni" className="w-8 h-8 object-contain" />
               LitePOS
             </Link>
             <button 
                onClick={() => setIsMobileOpen(true)}
                className="p-2 bg-gray-100 rounded-lg text-gray-600"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
             </button>
          </div>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      </NavigationGuardProvider>
    </AuthGuard>
  );
}
