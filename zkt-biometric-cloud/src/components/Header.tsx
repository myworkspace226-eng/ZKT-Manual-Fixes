import React, { useState, useEffect, useCallback } from 'react';
import { isDesktopApp, checkNetworkConnectivity } from '../services/deviceConnection';
import appIcon from '../assets/app-icon.png';
import { 
  Clock, 
  Wifi, 
  WifiOff,
  RefreshCw, 
  Monitor,
  Globe,
  Fingerprint
} from 'lucide-react';
import { Device } from '../types';

interface HeaderProps {
  devices: Device[];
  onSyncAll: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  devices,
  onSyncAll,
  isSyncing,
}) => {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isCheckingNet, setIsCheckingNet] = useState<boolean>(false);
  const isDesktop = isDesktopApp();

  // Network Connectivity Check
  const verifyNetwork = useCallback(async () => {
    setIsCheckingNet(true);
    try {
      const status = await checkNetworkConnectivity();
      setIsOnline(status);
    } catch {
      setIsOnline(false);
    } finally {
      setIsCheckingNet(false);
    }
  }, []);

  useEffect(() => {
    // Initial verification
    verifyNetwork();

    // Browser network events
    const handleOnline = () => verifyNetwork();
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic network connectivity polling (every 6 seconds)
    const netInterval = setInterval(verifyNetwork, 6000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(netInterval);
    };
  }, [verifyNetwork]);

  // Real-time Clock
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDate(now.toLocaleDateString('ar-EG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }));
    };
    updateDateTime();
    const timer = setInterval(updateDateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const connectedCount = devices.filter(d => d.status === 'connected').length;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 select-none sticky top-0 z-40">
      {/* Main Workspace Bar - Native OS frame handles window controls */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Brand & App Info */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-cyan-500/40 shadow-md bg-slate-800 flex items-center justify-center">
            <img 
              src={appIcon} 
              alt="نظام إدارة البصمة" 
              onError={(e) => {
                // Fallback to relative or hide broken img
                (e.currentTarget as HTMLImageElement).src = './icon.png';
              }}
              className="w-full h-full object-cover" 
            />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>نظام إدارة البصمة</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">V 5.4.0</span>
            </div>
            <div className="text-[10px] text-slate-400">
              المطور: <span className="text-cyan-300 font-medium">Muhammad Abdullah</span>
            </div>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-2.5 text-xs text-slate-300">
          {/* 1. Network Connectivity Indicator - Disambiguated between Web Internet and Desktop LAN */}
          <button
            onClick={verifyNetwork}
            disabled={isCheckingNet}
            title={
              isDesktop
                ? (isOnline ? 'كارت الشبكة والاتصال المحلي نشط (اضغط لإعادة الفحص)' : 'شبكة الـ LAN المحلية مفصولة (اضغط للفحص)')
                : (isOnline ? 'جهازك متصل بالإنترنت (معاينة متصفح فقط - الاتصال بماكينات البصمة LAN يتطلب تشغيل تطبيق الديسكتوب)' : 'لا يوجد اتصال بالإنترنت')
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
              isOnline 
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60' 
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300 hover:bg-rose-900/60 animate-pulse'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-500 shadow-sm shadow-rose-500/50'}`} />
            {isOnline ? (
              <Wifi className={`w-3.5 h-3.5 text-emerald-400 ${isCheckingNet ? 'animate-spin' : ''}`} />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>
              {isDesktop 
                ? (isOnline ? 'شبكة LAN: متصلة' : 'شبكة LAN: مفصولة')
                : (isOnline ? 'الإنترنت: متصل' : 'الإنترنت: مفصول')
              }
            </span>
          </button>

          {/* 2. Environment Badge */}
          {isDesktop ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px] font-medium">
              <Monitor className="w-3.5 h-3.5 text-emerald-400" />
              <span>تطبيق الديسكتوب (LAN)</span>
            </div>
          ) : (
            <div 
              title="أنت في وضع المعاينة عبر المتصفح السحابي - الاتصال المباشر بالأجهزة متاح فقط عند فتح ملف الـ EXE"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-slate-400 text-[11px] font-medium cursor-help"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>معاينة سحابية (بدون LAN)</span>
            </div>
          )}

          {/* 3. Devices Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/70 border border-slate-700/60 font-mono">
            <span className="text-[11px] text-slate-400">الأجهزة:</span>
            <span className="font-bold text-white tabular-nums">{connectedCount}/{devices.length}</span>
          </div>

          {/* 4. Live Clock & Date */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/70 border border-slate-700/60 font-mono text-[11px]">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-white tabular-nums">{time}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">{date}</span>
          </div>

          {/* 5. Sync Action */}
          <button
            onClick={onSyncAll}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'جاري الاتصال...' : 'سحب الحركات'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
