import React from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  ClockAlert, 
  DoorOpen, 
  Timer, 
  AlertTriangle, 
  ArrowUpRight, 
  Fingerprint, 
  ScanFace,
  FileSpreadsheet,
  Plus,
  HardDrive
} from 'lucide-react';
import { Worker, AttendanceRecord, Device, ProductionLineStatus } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';

interface DashboardHUDProps {
  workers: Worker[];
  attendanceRecords: AttendanceRecord[];
  devices: Device[];
  onNavigateToTab: (tab: any) => void;
  onSyncDevices: () => void;
}

export const DashboardHUD: React.FC<DashboardHUDProps> = ({
  workers,
  attendanceRecords,
  devices,
  onNavigateToTab,
  onSyncDevices,
}) => {
  const activeWorkers = workers.filter(w => w.isActive);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayPunches = attendanceRecords.filter(r => 
    !r.isDuplicateIgnored && (r.displayDate === todayStr || (r.timestamp && r.timestamp.slice(0, 10) === todayStr))
  );
  
  const presentWorkerCodes = new Set(
    todayPunches.map(r => Number(r.workerCode))
  );

  const presentCount = presentWorkerCodes.size;
  const absentCount = Math.max(0, activeWorkers.length - presentCount);
  const lateCount = todayPunches.filter(r => (r.lateMinutes || 0) > 0).length;
  const totalOvertime = todayPunches.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);

  const departmentMap: Record<string, { total: number; present: number; late: number; absent: number }> = {};
  
  activeWorkers.forEach(w => {
    const dept = w.department || 'عام';
    if (!departmentMap[dept]) {
      departmentMap[dept] = { total: 0, present: 0, late: 0, absent: 0 };
    }
    departmentMap[dept].total += 1;
    if (presentWorkerCodes.has(w.code)) {
      departmentMap[dept].present += 1;
    } else {
      departmentMap[dept].absent += 1;
    }
  });

  const lines: ProductionLineStatus[] = Object.keys(departmentMap).map(dept => {
    const d = departmentMap[dept];
    const rate = d.total > 0 ? Math.round((d.present / d.total) * 100) : 0;
    return {
      lineName: dept,
      department: dept,
      totalAssigned: d.total,
      presentCount: d.present,
      absentCount: d.absent,
      lateCount: d.late,
      attendanceRate: rate,
      isCritical: rate < 85 && d.total > 0,
    };
  });

  const latestRecords = [...attendanceRecords]
    .filter(r => !r.isDuplicateIgnored)
    .slice(0, 6);

  const handleExportMorningReport = () => {
    if (lines.length === 0) return;
    const reportData = lines.map(line => ({
      'القسم': line.department,
      'إجمالي العاملين': line.totalAssigned,
      'الحضور': line.presentCount,
      'الغياب': line.absentCount,
      'نسبة الحضور %': `${line.attendanceRate}%`,
    }));
    exportToExcel(reportData, 'حضور_الأقسام', `حضور_الأقسام_${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <div className="space-y-5">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs">إجمالي العاملين</span>
            <Users className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white">{activeWorkers.length}</div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs">حضور اليوم</span>
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-400">{presentCount}</div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs">غياب اليوم</span>
            <UserX className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-rose-400">{absentCount}</div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs">التأخيرات</span>
            <ClockAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-400">{lateCount}</div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs">أذونات سارية</span>
            <DoorOpen className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-purple-400">0</div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs">ساعات الإضافي</span>
            <Timer className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-cyan-400">{totalOvertime.toFixed(1)}</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Department Lines Attendance (2 Columns) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-white">نسب الحضور حسب الأقسام</h2>
            {lines.length > 0 && (
              <button
                onClick={handleExportMorningReport}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>تصدير Excel</span>
              </button>
            )}
          </div>

          {lines.length > 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800/80">
              {lines.map((line, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-850 transition-colors">
                  <div>
                    <div className="text-xs font-semibold text-white">{line.lineName}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      القوة: {line.totalAssigned} · الحضور: {line.presentCount} · الغياب: {line.absentCount}
                    </div>
                  </div>
                  <div className="text-left font-mono font-bold text-sm text-white tabular-nums">
                    {line.attendanceRate}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-500">
              لا توجد أقسام أو عمال مسجلون حالياً.
            </div>
          )}
        </div>

        {/* Live Punches (1 Column) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white">آخر الحركات</h3>
            {latestRecords.length > 0 && (
              <button
                onClick={() => onNavigateToTab('logs')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <span>السجل الكامل</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {latestRecords.length > 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-lg divide-y divide-slate-800/80">
              {latestRecords.map((record) => (
                <div key={record.id} className="p-3 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">{record.workerName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {record.workerCode} · {record.displayTime}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    record.resolvedState === 'IN' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}>
                    {record.resolvedState === 'IN' ? 'حضور' : 'انصراف'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-500">
              لا توجد حركات مسجلة حتى الآن.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
