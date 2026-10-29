import React from 'react';
import { 
  LayoutDashboard, 
  HardDrive, 
  Fingerprint, 
  Users, 
  CalendarClock, 
  DoorOpen, 
  FileSpreadsheet, 
  Settings,
  MonitorDown,
  Activity
} from 'lucide-react';

export type ActiveTab = 
  | 'dashboard' 
  | 'devices' 
  | 'logs' 
  | 'workers' 
  | 'shifts' 
  | 'gatepasses' 
  | 'reports' 
  | 'settings';

export interface ActivityLogEntry {
  id: string;
  time: string;
  text: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  logsCount: number;
  devicesCount: number;
  workersCount: number;
  gatePassesCount: number;
  activityLogs?: ActivityLogEntry[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  logsCount,
  devicesCount,
  workersCount,
  gatePassesCount,
  activityLogs = [],
}) => {
  const menuItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'لوحة العمليات',
      icon: LayoutDashboard,
    },
    {
      id: 'devices' as ActiveTab,
      label: 'أجهزة البصمة',
      icon: HardDrive,
      badge: `${devicesCount}`,
    },
    {
      id: 'logs' as ActiveTab,
      label: 'سجل الحركات',
      icon: Fingerprint,
      badge: logsCount > 0 ? `${logsCount}` : undefined,
    },
    {
      id: 'workers' as ActiveTab,
      label: 'شؤون العاملين',
      icon: Users,
      badge: workersCount > 0 ? `${workersCount}` : undefined,
    },
    {
      id: 'gatepasses' as ActiveTab,
      label: 'أذونات وتصاريح الخروج',
      icon: DoorOpen,
      badge: gatePassesCount > 0 ? `${gatePassesCount}` : undefined,
    },
    {
      id: 'reports' as ActiveTab,
      label: 'التقارير والغياب اليومي',
      icon: FileSpreadsheet,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'إعدادات النظام ومواعيد العمل',
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 select-none h-full sticky top-0">
      {/* Menu Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer text-right ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-xs">{item.label}</span>
              </div>

              {item.badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  isActive 
                    ? 'bg-blue-700 text-white' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Activity Log (سجل العمليات الأخير) */}
      <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/40 shrink-0">
        <div className="flex items-center justify-between mb-1.5 text-[11px] font-bold text-slate-300">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>سجل العمليات الأخير</span>
          </div>
          <span className="text-[9px] text-slate-500 font-mono">{activityLogs.length}</span>
        </div>

        <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
          {activityLogs.length === 0 ? (
            <div className="text-[10px] text-slate-500 py-1 text-center">لا توجد عمليات مسجلة بعد</div>
          ) : (
            activityLogs.slice(0, 4).map((log) => (
              <div key={log.id} className="text-[10px] p-1.5 rounded bg-slate-900 border border-slate-800/80 flex items-start gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                  log.type === 'error' ? 'bg-rose-500' : log.type === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 leading-tight truncate">{log.text}</p>
                  <span className="text-[9px] text-slate-500 font-mono">{log.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800/80 text-[10px] text-slate-400 bg-slate-950/40 shrink-0">
        <div className="flex items-center justify-between font-mono">
          <span title="مطور النظام">المطور: Muhammad Abdullah</span>
          <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">V 5.4.0</span>
        </div>
      </div>
    </aside>
  );
};
