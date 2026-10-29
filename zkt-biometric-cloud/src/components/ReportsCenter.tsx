import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Users, 
  UserCheck, 
  UserX, 
  Calendar, 
  Clock, 
  Timer, 
  AlertTriangle, 
  CheckCircle2, 
  Filter, 
  FileText, 
  BadgePercent, 
  Search, 
  Printer, 
  HardDrive, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  ChevronDown, 
  DoorOpen, 
  Info, 
  Sparkles, 
  Layers, 
  User, 
  SlidersHorizontal 
} from 'lucide-react';
import { Worker, AttendanceRecord, ShiftRule, AbsenceCategory, GatePass, Device, FactorySettings } from '../types';
import { 
  exportToExcel, 
  exportStyledExcel, 
  exportProfessionalAbsenceExcel, 
  calculateDailyPerformance 
} from '../utils/attendanceEngine';

const ARABIC_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const formatHoursAndMinutes = (hoursDecimal: number): string => {
  if (!hoursDecimal || hoursDecimal <= 0) return '0 س';
  const totalMinutes = Math.round(hoursDecimal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h} س`;
  if (h === 0) return `${m} د`;
  return `${h} س و ${m} د`;
};

interface ReportsCenterProps {
  workers: Worker[];
  attendanceRecords: AttendanceRecord[];
  shifts: ShiftRule[];
  gatePasses?: GatePass[];
  devices?: Device[];
  settings?: FactorySettings;
  factoryName?: string;
  absenceOverrides?: Record<string, { category: AbsenceCategory; note: string }>;
  onUpdateAbsenceOverrides?: (overrides: Record<string, { category: AbsenceCategory; note: string }>) => void;
  onSyncDevices?: () => void;
  isSyncing?: boolean;
}

export const ReportsCenter: React.FC<ReportsCenterProps> = ({
  workers,
  attendanceRecords,
  shifts,
  gatePasses = [],
  devices = [],
  settings,
  factoryName = 'مصنع الملابس الجاهزة',
  absenceOverrides = {},
  onUpdateAbsenceOverrides,
  onSyncDevices,
  isSyncing = false,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'daily_manager' | 'worker_dossier' | 'overtime' | 'late' | 'timesheet'>('daily_manager');
  
  // Date states
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstDayOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(firstDayOfMonthStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [quickPreset, setQuickPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom'>('month');

  const [searchQuery, setSearchQuery] = useState<string>('');

  // WORKER DOSSIER STATE
  const sortedWorkers = useMemo(() => {
    return [...workers].sort((a, b) => a.code - b.code);
  }, [workers]);

  const [dossierWorkerCode, setDossierWorkerCode] = useState<number>(() => {
    return workers.length > 0 ? Math.min(...workers.map((w) => w.code)) : 0;
  });
  const [dossierSearch, setDossierSearch] = useState<string>('');

  const filteredDossierWorkers = useMemo(() => {
    if (!dossierSearch.trim()) return sortedWorkers;
    const q = dossierSearch.trim().toLowerCase();
    return sortedWorkers.filter((w) => 
      String(w.code).includes(q) ||
      w.name.toLowerCase().includes(q) ||
      w.department.toLowerCase().includes(q)
    );
  }, [sortedWorkers, dossierSearch]);

  // ADVANCED OVERTIME CONTROLS (HOURS & MINUTES ONLY - ZERO FINANCIAL VALUES)
  const [otViewMode, setOtViewMode] = useState<'summary' | 'detailed'>('summary');
  const [otDepartureGrace, setOtDepartureGrace] = useState<number>(() => settings?.overtimeGraceMinutes ?? 30);
  const [otDeviceFilter, setOtDeviceFilter] = useState<string>('all');
  const [otDepartmentFilter, setOtDepartmentFilter] = useState<string>('all');
  const [otNationalityFilter, setOtNationalityFilter] = useState<string>('all');

  // Sync otDepartureGrace with system settings automatically
  useEffect(() => {
    if (settings?.overtimeGraceMinutes !== undefined) {
      setOtDepartureGrace(settings.overtimeGraceMinutes);
    }
  }, [settings?.overtimeGraceMinutes]);

  const handleSetPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom') => {
    setQuickPreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().slice(0, 10);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      setStartDate(oneWeekAgo);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'last_month') {
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      setStartDate(firstLastMonth);
      setEndDate(lastDayLastMonth);
    }
  };

  // --------------------------------------------------------------------------
  // TAB 1: DAILY ABSENCE REPORT FOR FACTORY MANAGER (Automated & Smart)
  // --------------------------------------------------------------------------
  const activeWorkers = useMemo(() => workers.filter((w) => w.isActive), [workers]);
  const factoryStrength = activeWorkers.length;

  const recordsOnSelectedDay = useMemo(() => {
    return attendanceRecords.filter((r) => {
      if (r.isDuplicateIgnored) return false;
      const recDate = r.displayDate || (r.timestamp ? r.timestamp.slice(0, 10) : '');
      return recDate === selectedDay;
    });
  }, [attendanceRecords, selectedDay]);

  const presentWorkerCodes = useMemo(() => {
    // If a worker has ANY valid punch on this selected day, they are 100% present and NOT absent!
    const codes = new Set<number>();
    recordsOnSelectedDay.forEach((r) => {
      if (r.workerCode) codes.add(Number(r.workerCode));
    });
    return codes;
  }, [recordsOnSelectedDay]);

  const presentWorkersList = useMemo(() => {
    return activeWorkers
      .filter((w) => {
        const direct = presentWorkerCodes.has(Number(w.code));
        const alias = Boolean(w.aliasCodes && w.aliasCodes.some((ac) => presentWorkerCodes.has(Number(ac))));
        return direct || alias;
      })
      .map((w) => {
        const workerPunches = recordsOnSelectedDay.filter(
          (r) =>
            Number(r.workerCode) === Number(w.code) ||
            Boolean(w.aliasCodes && w.aliasCodes.includes(Number(r.workerCode)))
        );
        workerPunches.sort((a, b) => (a.displayTime || '').localeCompare(b.displayTime || ''));
        const inPunch = workerPunches.find((r) => r.resolvedState === 'IN') || workerPunches[0];
        const outPunch = workerPunches.length > 1 ? workerPunches[workerPunches.length - 1] : undefined;

        return {
          ...w,
          checkInTime: inPunch ? inPunch.displayTime : '08:00',
          checkOutTime: outPunch ? outPunch.displayTime : undefined,
          deviceName: inPunch ? inPunch.deviceName : 'ماكينة البصمة',
          lateMinutes: inPunch?.lateMinutes || 0,
          isEarlyDeparture: Boolean(outPunch?.isEarlyDeparture),
          earlyDepartureMinutes: outPunch?.earlyDepartureMinutes || 0,
        };
      });
  }, [activeWorkers, presentWorkerCodes, recordsOnSelectedDay]);

  const absentWorkersList = useMemo(() => {
    return activeWorkers
      .filter((w) => {
        const direct = presentWorkerCodes.has(Number(w.code));
        const alias = Boolean(w.aliasCodes && w.aliasCodes.some((ac) => presentWorkerCodes.has(Number(ac))));
        return !direct && !alias;
      })
      .map((w) => {
        const override = absenceOverrides[`${selectedDay}_${w.code}`] || absenceOverrides[String(w.code)] || absenceOverrides[w.code];
        const hasGatePass = gatePasses.find((g) => Number(g.workerCode) === Number(w.code) && g.date === selectedDay);

        let defaultCat: AbsenceCategory = 'unexcused';
        let defaultNote = '';

        if (override) {
          defaultCat = override.category;
          defaultNote = override.note;
        } else if (hasGatePass) {
          defaultCat = 'official_pass';
          defaultNote = `تصريح: ${hasGatePass.reasonText}`;
        }

        return {
          ...w,
          absenceCategory: defaultCat,
          note: defaultNote,
        };
      });
  }, [activeWorkers, presentWorkerCodes, absenceOverrides, gatePasses, selectedDay]);

  const handleUpdateWorkerAbsence = (workerCode: number, category: AbsenceCategory, note?: string) => {
    const dayKey = `${selectedDay}_${workerCode}`;
    const existing = absenceOverrides[dayKey] || absenceOverrides[String(workerCode)] || absenceOverrides[workerCode];
    const updated = {
      ...absenceOverrides,
      [dayKey]: {
        category,
        note: note !== undefined ? note : (existing?.note || ''),
      },
      [workerCode]: {
        category,
        note: note !== undefined ? note : (existing?.note || ''),
      },
    };
    if (onUpdateAbsenceOverrides) {
      onUpdateAbsenceOverrides(updated);
    }
  };

  const handleUpdateWorkerNote = (workerCode: number, note: string) => {
    const dayKey = `${selectedDay}_${workerCode}`;
    const existing = absenceOverrides[dayKey] || absenceOverrides[String(workerCode)] || absenceOverrides[workerCode];
    const updated = {
      ...absenceOverrides,
      [dayKey]: {
        category: existing?.category || 'unexcused',
        note,
      },
      [workerCode]: {
        category: existing?.category || 'unexcused',
        note,
      },
    };
    if (onUpdateAbsenceOverrides) {
      onUpdateAbsenceOverrides(updated);
    }
  };

  const presentCount = presentWorkersList.length;
  const absentCount = absentWorkersList.length;
  const presentPercent = factoryStrength > 0 ? ((presentCount / factoryStrength) * 100).toFixed(1) : '0';
  const absentPercent = factoryStrength > 0 ? ((absentCount / factoryStrength) * 100).toFixed(1) : '0';

  const categoryBreakdown = useMemo(() => {
    const counts: Record<AbsenceCategory, number> = {
      unexcused: 0,
      excused_casual: 0,
      excused_annual: 0,
      official_pass: 0,
      medical: 0,
    };

    absentWorkersList.forEach((w) => {
      counts[w.absenceCategory] = (counts[w.absenceCategory] || 0) + 1;
    });

    return {
      unexcused: {
        count: counts.unexcused,
        pct: factoryStrength > 0 ? ((counts.unexcused / factoryStrength) * 100).toFixed(1) : '0',
      },
      excused_casual: {
        count: counts.excused_casual,
        pct: factoryStrength > 0 ? ((counts.excused_casual / factoryStrength) * 100).toFixed(1) : '0',
      },
      excused_annual: {
        count: counts.excused_annual,
        pct: factoryStrength > 0 ? ((counts.excused_annual / factoryStrength) * 100).toFixed(1) : '0',
      },
      official_pass: {
        count: counts.official_pass,
        pct: factoryStrength > 0 ? ((counts.official_pass / factoryStrength) * 100).toFixed(1) : '0',
      },
      medical: {
        count: counts.medical,
        pct: factoryStrength > 0 ? ((counts.medical / factoryStrength) * 100).toFixed(1) : '0',
      },
    };
  }, [absentWorkersList, factoryStrength]);

  // Point 2: Advanced Real-time Filters for Daily Absence Report
  const [absenceDeptFilter, setAbsenceDeptFilter] = useState<string>('all');
  const [absenceLineFilter, setAbsenceLineFilter] = useState<string>('all');
  const [absenceJobFilter, setAbsenceJobFilter] = useState<string>('all');
  const [absenceCategoryFilter, setAbsenceCategoryFilter] = useState<string>('all');

  const availableAbsenceDepartments = useMemo(() => {
    return Array.from(new Set(workers.map((w) => w.department).filter(Boolean))).sort();
  }, [workers]);

  const availableAbsenceLines = useMemo(() => {
    return Array.from(new Set(workers.map((w) => w.line).filter(Boolean))).sort();
  }, [workers]);

  const availableAbsenceJobs = useMemo(() => {
    return Array.from(new Set(workers.map((w) => w.jobTitle).filter(Boolean))).sort();
  }, [workers]);

  // Real-time filtered absent workers list (combines search query and dropdown filters)
  const filteredAbsentWorkersList = useMemo(() => {
    return absentWorkersList.filter((worker) => {
      if (absenceDeptFilter !== 'all' && worker.department !== absenceDeptFilter) return false;
      if (absenceLineFilter !== 'all' && (worker.line || '-') !== absenceLineFilter) return false;
      if (absenceJobFilter !== 'all' && worker.jobTitle !== absenceJobFilter) return false;
      if (absenceCategoryFilter !== 'all' && worker.absenceCategory !== absenceCategoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = worker.name.toLowerCase().includes(q);
        const matchCode = String(worker.code).includes(q);
        const matchDept = worker.department.toLowerCase().includes(q);
        const matchLine = (worker.line || '').toLowerCase().includes(q);
        const matchJob = (worker.jobTitle || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchDept && !matchLine && !matchJob) return false;
      }
      return true;
    });
  }, [
    absentWorkersList,
    absenceDeptFilter,
    absenceLineFilter,
    absenceJobFilter,
    absenceCategoryFilter,
    searchQuery,
  ]);

  // Exact Tailwind color-coding for Absence Categories
  // بدون إذن: خلفية حمراء bg-red-500 text-white
  // اعتيادي: خلفية خضراء bg-green-500 text-white
  // إجازة عارضة: خلفية أزرق فاتح bg-sky-300 text-black
  // إجازة مرضية: خلفية بني فاتح bg-amber-200 text-black
  // بإذن: خلفية بيضاء bg-white text-black
  const getAbsenceCategoryStyle = (category: AbsenceCategory): string => {
    switch (category) {
      case 'unexcused':
        return 'bg-red-500 text-white font-bold border-red-600';
      case 'excused_annual':
        return 'bg-green-500 text-white font-bold border-green-600';
      case 'excused_casual':
        return 'bg-sky-300 text-black font-bold border-sky-400';
      case 'medical':
        return 'bg-amber-200 text-black font-bold border-amber-300';
      case 'official_pass':
        return 'bg-white text-black font-bold border-slate-300';
      default:
        return 'bg-red-500 text-white font-bold';
    }
  };

  const handleExportManagerReport = async () => {
    const categoryLabels: Record<AbsenceCategory, string> = {
      unexcused: 'بدون إذن',
      excused_casual: 'إجازة عارضة',
      excused_annual: 'إجازة اعتيادية',
      official_pass: 'بإذن',
      medical: 'إجازة مرضية',
    };

    const targetList = filteredAbsentWorkersList;

    const exportItems = targetList.map((w, idx) => ({
      index: idx + 1,
      code: w.code,
      name: w.name,
      department: w.department,
      line: w.line || '-',
      jobTitle: w.jobTitle,
      nationality: w.nationality,
      absenceCategory: categoryLabels[w.absenceCategory] || w.absenceCategory,
      absenceKey: w.absenceCategory,
      note: w.note || '-',
    }));

    await exportProfessionalAbsenceExcel(
      {
        factoryName: factoryName || 'مصنع الملابس الجاهزة',
        reportDate: selectedDay,
        totalWorkers: factoryStrength,
        presentCount,
        absentCount,
        presentPercent,
        absentPercent,
        records: exportItems,
      },
      `تقرير_الغياب_اليومي_${selectedDay}`
    );
  };

  // --------------------------------------------------------------------------
  // POINT 12: COMPREHENSIVE WORKER DOSSIER COMPUTATION (الملف الشامل للعامل)
  // --------------------------------------------------------------------------
  const selectedDossierWorker = useMemo(() => {
    return workers.find((w) => w.code === dossierWorkerCode) || workers[0];
  }, [workers, dossierWorkerCode]);

  const dossierWorkerRecords = useMemo(() => {
    if (!selectedDossierWorker) return [];
    return attendanceRecords.filter((r) => {
      const d = r.timestamp.slice(0, 10);
      return r.workerCode === selectedDossierWorker.code && d >= startDate && d <= endDate && !r.isDuplicateIgnored;
    });
  }, [selectedDossierWorker, attendanceRecords, startDate, endDate]);

  const dossierWorkerPasses = useMemo(() => {
    if (!selectedDossierWorker) return [];
    return gatePasses.filter((g) => {
      return g.workerCode === selectedDossierWorker.code && g.date >= startDate && g.date <= endDate;
    });
  }, [selectedDossierWorker, gatePasses, startDate, endDate]);

  // Generate day-by-day calendar matrix for worker
  const dossierDailyLedger = useMemo(() => {
    if (!selectedDossierWorker || !startDate || !endDate) return [];
    const list: any[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    const shift = shifts.find((s) => s.id === selectedDossierWorker.shiftId) || shifts[0];
    const [endH, endM] = shift.endTime.split(':').map(Number);
    const scheduledEndMinutes = endH * 60 + endM;

    // Index worker records by date for O(1) lookup
    const punchesByDate = new Map<string, AttendanceRecord[]>();
    dossierWorkerRecords.forEach((r) => {
      const d = r.timestamp.slice(0, 10);
      let arr = punchesByDate.get(d);
      if (!arr) {
        arr = [];
        punchesByDate.set(d, arr);
      }
      arr.push(r);
    });

    const passesByDate = new Map<string, GatePass>();
    dossierWorkerPasses.forEach((g) => {
      passesByDate.set(g.date, g);
    });

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      const dayName = ARABIC_WEEKDAYS[dow] || '';
      const isFriday = dow === 5;

      const dayPunches = punchesByDate.get(dateStr) || [];
      const checkInPunch = dayPunches.find((p) => p.resolvedState === 'IN') || dayPunches[0];
      const checkOutPunch = dayPunches.length > 1 ? dayPunches[dayPunches.length - 1] : undefined;
      const dayPass = passesByDate.get(dateStr);

      let status = 'غائب';
      let lateMins = 0;
      let otHours = 0;
      let notes = '';

      if (isFriday) {
        if (dayPunches.length > 0) {
          const fridayMult = shift?.fridayMultiplier || 2;
          otHours = 8 * fridayMult;
          status = `عمل يوم الجمعة (${fridayMult}x)`;
          notes = `يوم جمعة مضاعف (${fridayMult}x) ${otHours} ساعة`;
        } else {
          status = 'عطلة أسبوعية (جمعة)';
        }
      } else if (dayPunches.length > 0) {
        if (checkInPunch) {
          const punchTime = new Date(checkInPunch.timestamp);
          const [sH, sM] = shift.startTime.split(':').map(Number);
          const inMins = punchTime.getHours() * 60 + punchTime.getMinutes();
          const threshold = sH * 60 + sM + shift.generalGraceMinutes + (selectedDossierWorker.customGraceMinutes || 0);
          if (inMins > threshold) {
            lateMins = inMins - (sH * 60 + sM);
            status = 'حاضر متأخر';
          } else {
            status = 'حاضر في الموعد';
          }
        }

        if (checkOutPunch) {
          const outTime = new Date(checkOutPunch.timestamp);
          const outMins = outTime.getHours() * 60 + outTime.getMinutes();
          const pastEnd = outMins - scheduledEndMinutes;
          if (pastEnd > otDepartureGrace) {
            otHours = Number((pastEnd / 60).toFixed(2));
            notes = `إضافي بعد انتهاء الوردية (${formatHoursAndMinutes(otHours)})`;
          } else if (pastEnd >= 0) {
            notes = 'انصراف طبيعي ضمن فترة السماح (4:30 - 4:45)';
          }
        }
      } else if (dayPass) {
        status = 'بتصريح خروج';
        notes = `${dayPass.reasonText} (${dayPass.exitTime} - ${dayPass.returnTime || 'نهاية اليوم'})`;
      } else {
        status = 'غائب';
      }

      list.push({
        date: dateStr,
        dayName,
        isFriday,
        checkIn: checkInPunch ? checkInPunch.displayTime : '-',
        checkOut: checkOutPunch ? checkOutPunch.displayTime : (checkInPunch ? 'لم يبصم' : '-'),
        machineName: checkInPunch ? (checkInPunch.deviceName || `ماكينة #${checkInPunch.deviceId}`) : '-',
        lateMinutes: lateMins,
        overtimeHours: otHours,
        gatePassInfo: dayPass ? `${dayPass.reasonText}` : '-',
        status,
        notes,
      });
    }

    return list;
  }, [selectedDossierWorker, startDate, endDate, dossierWorkerRecords, dossierWorkerPasses, shifts, otDepartureGrace]);

  // Totals for dossier (Hours and Minutes only - Zero financial metrics)
  const dossierSummary = useMemo(() => {
    let presentDays = 0;
    let absentDays = 0;
    let fridayWorkDays = 0;
    let totalLateMinutes = 0;
    let totalLateDays = 0;
    let totalOtHours = 0;
    let totalPasses = dossierWorkerPasses.length;

    dossierDailyLedger.forEach((row) => {
      if (row.status.startsWith('حاضر')) presentDays++;
      else if (row.status === 'غائب') absentDays++;
      else if (row.status.startsWith('عمل يوم الجمعة')) fridayWorkDays++;

      if (row.lateMinutes > 0) {
        totalLateMinutes += row.lateMinutes;
        totalLateDays++;
      }
      totalOtHours += row.overtimeHours || 0;
    });

    return {
      presentDays,
      absentDays,
      fridayWorkDays,
      totalLateMinutes,
      totalLateDays,
      totalOtHours: Number(totalOtHours.toFixed(2)),
      totalPasses,
    };
  }, [dossierDailyLedger, dossierWorkerPasses]);

  const handleExportDossier = () => {
    if (!selectedDossierWorker) return;
    const data = dossierDailyLedger.map((row) => ({
      'التاريخ': row.date,
      'اليوم': row.dayName,
      'حضور (IN)': row.checkIn,
      'انصراف (OUT)': row.checkOut,
      'الماكينة': row.machineName,
      'التأخير (دقيقة)': row.lateMinutes > 0 ? row.lateMinutes : 0,
      'الساعات الإضافية': row.overtimeHours > 0 ? row.overtimeHours : 0,
      'التصاريح': row.gatePassInfo,
      'الحالة': row.status,
      'ملاحظات': row.notes,
    }));

    exportToExcel(
      data,
      `ملف_${selectedDossierWorker.code}`,
      `الملف_الشامل_للعامل_${selectedDossierWorker.code}_${selectedDossierWorker.name}_${startDate}_${endDate}`,
      `الملف الشامل للعامل: ${selectedDossierWorker.name} (#${selectedDossierWorker.code})`
    );
  };

  // --------------------------------------------------------------------------
  // POINT 13: ADVANCED OVERTIME REPORT COMPUTATION
  // --------------------------------------------------------------------------
  const recordsInDateRange = useMemo(() => {
    return attendanceRecords.filter((r) => {
      const recordDate = r.timestamp.slice(0, 10);
      return recordDate >= startDate && recordDate <= endDate && !r.isDuplicateIgnored;
    });
  }, [attendanceRecords, startDate, endDate]);

  // Filtered workers by department, nationality, machine
  const filteredOtWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (otDepartmentFilter !== 'all' && w.department !== otDepartmentFilter) return false;
      if (otNationalityFilter !== 'all' && w.nationality !== otNationalityFilter) return false;
      if (otDeviceFilter !== 'all') {
        const devId = parseInt(otDeviceFilter, 10);
        if (!w.assignedDeviceIds?.includes(devId)) return false;
      }
      return true;
    });
  }, [workers, otDepartmentFilter, otNationalityFilter, otDeviceFilter]);

  // Advanced Overtime Analysis Per Worker & Per Day (Optimized & Non-Blocking - Hours & Minutes Only)
  const { advancedOtSummary, advancedOtDailyPunches, totalOtFactoryHours, otWorkersCount } = useMemo(() => {
    const summaryMap = new Map<number, {
      worker: Worker;
      daysWorked: number;
      otDays: number;
      shiftOtHours: number;
      fridayOtHours: number;
      totalOtHours: number;
      machineName: string;
    }>();

    const dailyPunchesList: any[] = [];

    // Pre-cache shift end times to avoid re-parsing inside loop
    const shiftMap = new Map<string, { endMinutes: number; endTime: string }>();
    shifts.forEach((s) => {
      const [endH, endM] = s.endTime.split(':').map(Number);
      shiftMap.set(s.id, { endMinutes: endH * 60 + endM, endTime: s.endTime });
    });

    // Pre-cache device names
    const deviceMap = new Map<number, string>(devices.map((d) => [d.id, d.name]));

    // Fast day-of-week cache for date strings 'YYYY-MM-DD'
    const dayOfWeekCache = new Map<string, number>();
    const getDayOfWeek = (dStr: string) => {
      let dow = dayOfWeekCache.get(dStr);
      if (dow === undefined) {
        dow = new Date(dStr + 'T00:00:00').getDay();
        dayOfWeekCache.set(dStr, dow);
      }
      return dow;
    };

    // Group records by workerCode and date
    const workerDateMap = new Map<number, Map<string, AttendanceRecord[]>>();
    recordsInDateRange.forEach((r) => {
      let dateMap = workerDateMap.get(r.workerCode);
      if (!dateMap) {
        dateMap = new Map();
        workerDateMap.set(r.workerCode, dateMap);
      }
      let punches = dateMap.get(r.displayDate);
      if (!punches) {
        punches = [];
        dateMap.set(r.displayDate, punches);
      }
      punches.push(r);
    });

    let overallFactoryHours = 0;
    let activeOtWorkers = 0;

    filteredOtWorkers.forEach((w) => {
      const shiftInfo = shiftMap.get(w.shiftId) || shiftMap.values().next().value || { endMinutes: 16 * 60 + 30, endTime: '16:30' };
      const scheduledEndMinutes = shiftInfo.endMinutes;
      const workerDates = workerDateMap.get(w.code);

      let daysWorked = 0;
      let otDays = 0;
      let shiftOt = 0;
      let fridayOt = 0;

      const primaryDevName = w.assignedDeviceIds && w.assignedDeviceIds.length > 0
        ? deviceMap.get(w.assignedDeviceIds[0])
        : undefined;
      const machineName = primaryDevName || w.enrolledOnDeviceName || 'ماكينة غير محددة';

      if (workerDates) {
        workerDates.forEach((punches, dateStr) => {
          daysWorked++;
          const dow = getDayOfWeek(dateStr);
          const isFriday = dow === 5;
          const dayName = ARABIC_WEEKDAYS[dow] || '';

          const checkIn = punches.find((p) => p.resolvedState === 'IN') || punches[0];
          const checkOut = punches.length > 1 ? punches[punches.length - 1] : undefined;

          let dayOtHours = 0;
          let statusLabel = 'انصراف اعتيادي';
          let minutesPast = 0;

          if (isFriday) {
            const workerShift = shifts.find((s) => s.id === w.shiftId) || shifts[0];
            const fridayMult = workerShift?.fridayMultiplier || 2;
            dayOtHours = 8 * fridayMult;
            fridayOt += dayOtHours;
            otDays++;
            statusLabel = `عمل يوم الجمعة (مضاعف ${fridayMult}x - ${dayOtHours} ساعة)`;
          } else if (checkOut) {
            const outDate = new Date(checkOut.timestamp);
            const outMinutes = outDate.getHours() * 60 + outDate.getMinutes();
            minutesPast = outMinutes - scheduledEndMinutes;

            if (minutesPast > otDepartureGrace) {
              dayOtHours = Number((minutesPast / 60).toFixed(2));
              shiftOt += dayOtHours;
              otDays++;
              statusLabel = `إضافي معتمد (${formatHoursAndMinutes(dayOtHours)})`;
            } else if (minutesPast >= 0) {
              statusLabel = `انصراف طبيعي ضمن السماحية (${minutesPast} د - بدون إضافي)`;
            } else {
              statusLabel = `انصراف مبكر قبل نهاية الوردية (${Math.abs(minutesPast)} د)`;
            }
          }

          if (dayOtHours > 0 || checkOut) {
            dailyPunchesList.push({
              date: dateStr,
              dayName,
              code: w.code,
              name: w.name,
              department: w.department,
              nationality: w.nationality,
              machineName: checkOut?.deviceName || machineName,
              shiftEnd: shiftInfo.endTime,
              checkInTime: checkIn?.displayTime || '-',
              checkOutTime: checkOut?.displayTime || 'لم يبصم',
              minutesPastShift: minutesPast,
              statusLabel,
              otHours: dayOtHours,
            });
          }
        });
      }

      const totalOt = Number((shiftOt + fridayOt).toFixed(2));

      if (totalOt > 0) {
        overallFactoryHours += totalOt;
        activeOtWorkers++;
      }

      summaryMap.set(w.code, {
        worker: w,
        daysWorked,
        otDays,
        shiftOtHours: Number(shiftOt.toFixed(2)),
        fridayOtHours: Number(fridayOt.toFixed(2)),
        totalOtHours: totalOt,
        machineName,
      });
    });

    const summaryArray = Array.from(summaryMap.values())
      .filter((item) => item.daysWorked > 0 || item.totalOtHours > 0)
      .sort((a, b) => b.totalOtHours - a.totalOtHours);

    dailyPunchesList.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.otHours - a.otHours;
    });

    return {
      advancedOtSummary: summaryArray,
      advancedOtDailyPunches: dailyPunchesList,
      totalOtFactoryHours: Number(overallFactoryHours.toFixed(1)),
      otWorkersCount: activeOtWorkers,
    };
  }, [recordsInDateRange, filteredOtWorkers, shifts, devices, otDepartureGrace]);

  const handleExportAdvancedOt = () => {
    if (otViewMode === 'summary') {
      const data = advancedOtSummary.map((item, idx) => ({
        'م': idx + 1,
        'كود العامل': item.worker.code,
        'الاسم': item.worker.name,
        'القسم': item.worker.department,
        'خط الإنتاج': item.worker.line || '-',
        'الجنسية': item.worker.nationality,
        'الماكينة المسجل عليها': item.machineName,
        'أيام العمل': item.daysWorked,
        'أيام الإضافي': item.otDays,
        'إضافي الوردية (ساعة)': item.shiftOtHours,
        'إضافي الجمعة والسهر (ساعة)': item.fridayOtHours,
        'إجمالي ساعات الأوفر تايم': item.totalOtHours,
        'المدة (ساعات ودقائق)': formatHoursAndMinutes(item.totalOtHours),
      }));
      exportToExcel(
        data, 
        'ملخص_الإضافي', 
        `تقرير_الإضافي_${startDate}_إلى_${endDate}`, 
        `تقرير الساعات الإضافية - الفترة من ${startDate} إلى ${endDate}`
      );
    } else {
      const data = advancedOtDailyPunches.map((item, idx) => ({
        'م': idx + 1,
        'التاريخ': item.date,
        'اليوم': item.dayName,
        'كود العامل': item.code,
        'الاسم': item.name,
        'القسم': item.department,
        'الماكينة': item.machineName,
        'نهاية الوردية': item.shiftEnd,
        'حضور': item.checkInTime,
        'انصراف': item.checkOutTime,
        'الدقائق بعد الوردية': item.minutesPastShift,
        'حالة الاحتساب': item.statusLabel,
        'ساعات الإضافي': item.otHours,
        'المدة': formatHoursAndMinutes(item.otHours),
      }));
      exportToExcel(
        data, 
        'تفاصيل_بصمات_الإضافي', 
        `سجل_بصمات_الإضافي_اليومي_${startDate}_إلى_${endDate}`, 
        `سجل بصمات الانصراف والإضافي اليومي - الفترة من ${startDate} إلى ${endDate}`
      );
    }
  };

  // --------------------------------------------------------------------------
  // TAB: LATE STATS
  // --------------------------------------------------------------------------
  const dynamicLateStats = useMemo(() => {
    const lateByWorker: Record<number, { count: number; totalMinutes: number }> = {};
    recordsInDateRange.forEach((r) => {
      if ((r.lateMinutes || 0) > 0 && !r.isDuplicateIgnored) {
        if (!lateByWorker[r.workerCode]) {
          lateByWorker[r.workerCode] = { count: 0, totalMinutes: 0 };
        }
        lateByWorker[r.workerCode].count += 1;
        lateByWorker[r.workerCode].totalMinutes += r.lateMinutes || 0;
      }
    });

    return Object.keys(lateByWorker).map((codeStr) => {
      const code = parseInt(codeStr, 10);
      const worker = workers.find((w) => w.code === code);
      const stat = lateByWorker[code];
      const avg = stat.count > 0 ? Math.round(stat.totalMinutes / stat.count) : 0;
      const customGrace = worker?.customGraceMinutes || 0;
      return {
        code,
        name: worker ? worker.name : `عامل كود ${code}`,
        department: worker ? worker.department : 'عام',
        lateDaysCount: stat.count,
        totalLateMinutes: stat.totalMinutes,
        avgMinutesPerDay: avg,
        customGrace: customGrace > 0 ? `سماحية ${customGrace}د` : 'سماحية عامة',
      };
    }).sort((a, b) => b.totalLateMinutes - a.totalLateMinutes);
  }, [recordsInDateRange, workers]);

  return (
    <div className="space-y-4">
      {/* Top Header & Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>مركز التقارير المتقدمة وتحليلات الحضور</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                V 5.4.0
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              تقارير الغياب اليومي، الملف الشامل للعامل، وحساب الساعات الإضافية المتقدم
            </p>
          </div>
        </div>

        {/* Global Date Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {activeReportTab === 'daily_manager' ? (
            <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-300 font-medium">تاريخ تقرير اليوم:</span>
              <input
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono cursor-pointer focus:border-blue-500"
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-[11px]">
                <button
                  onClick={() => handleSetPreset('today')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'today' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  اليوم
                </button>
                <button
                  onClick={() => handleSetPreset('week')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'week' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  أسبوع
                </button>
                <button
                  onClick={() => handleSetPreset('month')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'month' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  هذا الشهر
                </button>
                <button
                  onClick={() => handleSetPreset('last_month')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    quickPreset === 'last_month' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الشهر السابق
                </button>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white cursor-pointer"
                />
                <span className="text-slate-400 text-[11px]">إلى:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setQuickPreset('custom');
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Sync from devices button for past periods */}
          {onSyncDevices && (
            <button
              onClick={onSyncDevices}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium cursor-pointer transition-colors border border-slate-700 disabled:opacity-50"
              title="سحب بصمات الفترات السابقة من ماكينات البصمة مباشرة"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري السحب...' : 'سحب من الماكينات'}</span>
            </button>
          )}

          {/* Export Button */}
          <button
            onClick={() => {
              if (activeReportTab === 'daily_manager') handleExportManagerReport();
              else if (activeReportTab === 'worker_dossier') handleExportDossier();
              else if (activeReportTab === 'overtime') handleExportAdvancedOt();
              else if (activeReportTab === 'late') {
                const data = dynamicLateStats.map((item) => ({
                  'كود العامل': item.code,
                  'اسم العامل': item.name,
                  'القسم': item.department,
                  'أيام التأخير': item.lateDaysCount,
                  'إجمالي دقائق التأخير': item.totalLateMinutes,
                  'متوسط التأخير اليومي': `${item.avgMinutesPerDay} دقيقة`,
                }));
                exportToExcel(data, 'الأكثر_تأخيرا', `تقرير_التأخير_${startDate}_إلى_${endDate}`);
              } else {
                const data = workers.map((w) => ({
                  'كود العامل': w.code,
                  'الاسم': w.name,
                  'القسم': w.department,
                  'الوظيفة': w.jobTitle,
                  'الجنسية': w.nationality,
                  'الحالة': w.isActive ? 'نشط' : 'مجمد',
                }));
                exportToExcel(data, 'كشف_العاملين', `كشف_العاملين_${startDate}_إلى_${endDate}`);
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير Excel ملون</span>
          </button>
        </div>
      </div>

      {/* Primary Report Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
        <button
          onClick={() => setActiveReportTab('daily_manager')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'daily_manager' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>تقرير الغياب اليومي</span>
        </button>

        <button
          onClick={() => setActiveReportTab('worker_dossier')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'worker_dossier' ? 'bg-purple-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>الملف الشامل للعامل</span>
        </button>

        <button
          onClick={() => setActiveReportTab('overtime')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'overtime' ? 'bg-amber-600 text-white font-bold shadow-sm' : 'text-slate-300 hover:text-white'
          }`}
        >
          <Timer className="w-3.5 h-3.5" />
          <span>تقارير الإضافي المتقدمة</span>
        </button>

        <button
          onClick={() => setActiveReportTab('late')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'late' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          الأكثر تأخيراً
        </button>

        <button
          onClick={() => setActiveReportTab('timesheet')}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeReportTab === 'timesheet' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
          }`}
        >
          كشف العاملين الشامل
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* TAB 1: DAILY MANAGER ABSENCE REPORT */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'daily_manager' && (
        <div className="space-y-3.5">
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-slate-400 text-[10px] block">قوة المصنع</span>
              <span className="text-base font-bold font-mono text-white">{factoryStrength} عامل</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">العمالة النشطة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-emerald-400 text-[10px] block font-medium">الحضور الفعلي</span>
              <span className="text-base font-bold font-mono text-emerald-400">{presentCount}</span>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-mono">{presentPercent}% نسبة الحضور</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-rose-400 text-[10px] block font-medium">إجمالي الغياب</span>
              <span className="text-base font-bold font-mono text-rose-400">{absentCount}</span>
              <span className="text-[10px] text-rose-400/80 block mt-0.5 font-mono">{absentPercent}% نسبة الغياب</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-rose-300 text-[10px] block">بدون إذن</span>
              <span className="text-base font-bold font-mono text-rose-300">{categoryBreakdown.unexcused.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.unexcused.pct}% من القوة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-amber-300 text-[10px] block">إجازة عارضة</span>
              <span className="text-base font-bold font-mono text-amber-300">{categoryBreakdown.excused_casual.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.excused_casual.pct}% من القوة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-blue-300 text-[10px] block">إجازة اعتيادي</span>
              <span className="text-base font-bold font-mono text-blue-300">{categoryBreakdown.excused_annual.count}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">{categoryBreakdown.excused_annual.pct}% من القوة</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
              <span className="text-purple-300 text-[10px] block">مرضي وتصاريح</span>
              <span className="text-base font-bold font-mono text-purple-300">
                {categoryBreakdown.medical.count + categoryBreakdown.official_pass.count}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                {(Number(categoryBreakdown.medical.pct) + Number(categoryBreakdown.official_pass.pct)).toFixed(1)}% من القوة
              </span>
            </div>
          </div>

          {/* Absence Table Controls Bar (Point 2: Real-time Filters & Search) */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserX className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-bold text-white">
                  كشف العمال الغائبين اليوم
                </h3>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {filteredAbsentWorkersList.length} من إجمالي {absentWorkersList.length} غائب
                </span>
              </div>

              {(searchQuery || absenceDeptFilter !== 'all' || absenceLineFilter !== 'all' || absenceJobFilter !== 'all' || absenceCategoryFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setAbsenceDeptFilter('all');
                    setAbsenceLineFilter('all');
                    setAbsenceJobFilter('all');
                    setAbsenceCategoryFilter('all');
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  إعادة ضبط الفلاتر
                </button>
              )}
            </div>

            {/* Filter Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 pt-1">
              {/* Real-time Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="بحث باسم العامل أو الكود أو القسم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pr-8 pl-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Department Dropdown Filter */}
              <div>
                <select
                  value={absenceDeptFilter}
                  onChange={(e) => setAbsenceDeptFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                >
                  <option value="all">كل الأقسام</option>
                  {availableAbsenceDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line Dropdown Filter */}
              <div>
                <select
                  value={absenceLineFilter}
                  onChange={(e) => setAbsenceLineFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                >
                  <option value="all">كل خطوط الإنتاج</option>
                  {availableAbsenceLines.map((line) => (
                    <option key={line} value={line}>
                      خط {line}
                    </option>
                  ))}
                </select>
              </div>

              {/* Job Title Dropdown Filter */}
              <div>
                <select
                  value={absenceJobFilter}
                  onChange={(e) => setAbsenceJobFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                >
                  <option value="all">كل الوظائف</option>
                  {availableAbsenceJobs.map((job) => (
                    <option key={job} value={job}>
                      {job}
                    </option>
                  ))}
                </select>
              </div>

              {/* Absence Category Dropdown Filter */}
              <div>
                <select
                  value={absenceCategoryFilter}
                  onChange={(e) => setAbsenceCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                >
                  <option value="all">كل تصنيفات الغياب</option>
                  <option value="unexcused">بدون إذن</option>
                  <option value="excused_annual">اعتيادي</option>
                  <option value="excused_casual">إجازة عارضة</option>
                  <option value="medical">إجازة مرضية</option>
                  <option value="official_pass">بإذن</option>
                </select>
              </div>
            </div>
          </div>

          {/* Absent Workers Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {filteredAbsentWorkersList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                      <th className="py-2.5 px-3 font-semibold text-center w-12">م</th>
                      <th className="py-2.5 px-3 font-semibold">كود</th>
                      <th className="py-2.5 px-3 font-semibold">الاسم</th>
                      <th className="py-2.5 px-3 font-semibold">القسم</th>
                      <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                      <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                      <th className="py-2.5 px-3 font-semibold text-center">تصنيف الغياب</th>
                      <th className="py-2.5 px-3 font-semibold">ملاحظات والتصريح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredAbsentWorkersList.map((worker, idx) => (
                      <tr key={worker.code} className="hover:bg-slate-850/60 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-white">{worker.code}</td>
                        <td className="py-2 px-3 font-medium text-white">{worker.name}</td>
                        <td className="py-2 px-3 text-slate-300">{worker.department}</td>
                        <td className="py-2 px-3 font-mono text-slate-400">{worker.line || '-'}</td>
                        <td className="py-2 px-3 text-slate-400">{worker.jobTitle}</td>
                        <td className="py-2 px-3 text-center">
                          <select
                            value={worker.absenceCategory}
                            onChange={(e) => handleUpdateWorkerAbsence(worker.code, e.target.value as AbsenceCategory)}
                            className={`rounded px-2.5 py-1 text-xs cursor-pointer transition-all border outline-none shadow-sm ${getAbsenceCategoryStyle(worker.absenceCategory)}`}
                          >
                            <option value="unexcused" className="bg-slate-900 text-white font-normal">بدون إذن</option>
                            <option value="excused_annual" className="bg-slate-900 text-white font-normal">اعتيادي</option>
                            <option value="excused_casual" className="bg-slate-900 text-white font-normal">إجازة عارضة</option>
                            <option value="medical" className="bg-slate-900 text-white font-normal">إجازة مرضية</option>
                            <option value="official_pass" className="bg-slate-900 text-white font-normal">بإذن</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            placeholder="سبب الغياب أو رقم الإذن..."
                            value={worker.note}
                            onChange={(e) => handleUpdateWorkerNote(worker.code, e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white w-full focus:border-blue-500 outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                {absentWorkersList.length === 0 
                  ? 'لا يوجد غياب مسجل لهذا اليوم (حضور بنسبة 100%).' 
                  : 'لا توجد نتائج تطابق معايير البحث والفلترة المحددة.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 2: POINT 12 - COMPREHENSIVE WORKER DOSSIER (الملف الشامل للعامل) */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'worker_dossier' && (
        <div className="space-y-4">
          {/* Worker Selector Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">الملف الشامل والتاريخي للعامل</h3>
                <p className="text-[11px] text-slate-400">سجل مفصل عن الحضور، الغياب، التأخيرات، الأذونات، وساعات الإضافي</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {/* Search Filter for Workers (Point 4) */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="بحث بالكود أو الاسم أو القسم..."
                  value={dossierSearch}
                  onChange={(e) => setDossierSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg pr-8 pl-6 py-1.5 text-xs text-white placeholder-slate-500 w-52 focus:w-60 focus:border-purple-500 transition-all font-sans"
                />
                {dossierSearch && (
                  <button
                    onClick={() => setDossierSearch('')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sorted Worker Selector Dropdown (Point 4) */}
              <div className="flex items-center gap-1.5">
                <select
                  value={dossierWorkerCode}
                  onChange={(e) => setDossierWorkerCode(parseInt(e.target.value, 10))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-medium focus:border-purple-500 max-w-xs font-mono text-xs cursor-pointer"
                >
                  {filteredDossierWorkers.length > 0 ? (
                    filteredDossierWorkers.map((w) => (
                      <option key={w.code} value={w.code}>
                        #{w.code} - {w.name} ({w.department})
                      </option>
                    ))
                  ) : (
                    <option value="">لا يوجد عامل مطابق للبحث</option>
                  )}
                </select>
                {dossierSearch && (
                  <span className="text-[10px] text-purple-400 font-mono bg-purple-950/60 px-1.5 py-1 rounded border border-purple-800/40">
                    ({filteredDossierWorkers.length})
                  </span>
                )}
              </div>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
              >
                <Printer className="w-3.5 h-3.5 text-purple-400" />
                <span>طباعة التقرير</span>
              </button>
            </div>
          </div>

          {/* Worker Profile Card */}
          {selectedDossierWorker && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md font-mono">
                    {selectedDossierWorker.code}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{selectedDossierWorker.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-sans ${
                        selectedDossierWorker.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {selectedDossierWorker.isActive ? 'على رأس العمل' : 'مجمد'}
                      </span>
                    </h2>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 mt-1 font-sans">
                      <span>القسم: <strong className="text-slate-200">{selectedDossierWorker.department}</strong></span>
                      <span>•</span>
                      <span>الوظيفة: <strong className="text-slate-200">{selectedDossierWorker.jobTitle}</strong></span>
                      <span>•</span>
                      <span>خط الإنتاج: <strong className="text-slate-200">{selectedDossierWorker.line || '-'}</strong></span>
                      <span>•</span>
                      <span>الجنسية: <strong className="text-slate-200">{selectedDossierWorker.nationality}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
                  <div>الوردية: <span className="text-indigo-400 font-bold">{selectedDossierWorker.shiftId === 'bangladeshi' ? 'وردية بنغال (8:00 - 18:30)' : 'وردية عادية (8:00 - 16:30)'}</span></div>
                  <div>الماكينة المسجل عليها: <span className="text-amber-400 font-bold">{selectedDossierWorker.enrolledOnDeviceName || 'ماكينة المصنع'}</span></div>
                  <div>سماحية خاصة: <span className="text-emerald-400 font-bold">+{selectedDossierWorker.customGraceMinutes || 0} دقيقة</span></div>
                </div>
              </div>

              {/* Dossier KPI Cards for Selected Date Period */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-4">
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>أيام الحضور الفعلي</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {dossierSummary.presentDays} <span className="text-xs text-slate-400 font-sans">يوم</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">من {dossierDailyLedger.filter(r => !r.isFriday).length} يوم عمل</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5 text-rose-400" />
                    <span>أيام الغياب</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                    {dossierSummary.absentDays} <span className="text-xs text-slate-400 font-sans">يوم</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">بدون إذن أو إجازات</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>إجمالي التأخيرات</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                    {dossierSummary.totalLateMinutes} <span className="text-xs text-slate-400 font-sans">دقيقة</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">في {dossierSummary.totalLateDays} يوم</div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-cyan-400" />
                    <span>الساعات الإضافية</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                    {dossierSummary.totalOtHours} <span className="text-xs text-slate-400 font-sans">ساعة</span>
                  </div>
                  <div className="text-[10px] text-cyan-300 font-mono mt-0.5 font-bold">
                    {formatHoursAndMinutes(dossierSummary.totalOtHours)}
                  </div>
                </div>

                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-purple-400" />
                    <span>أذونات وتصاريح</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                    {dossierSummary.totalPasses} <span className="text-xs text-slate-400 font-sans">تصريح</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">مسجلة في الأمن</div>
                </div>
              </div>
            </div>
          )}

          {/* Daily Ledger Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <span>سجل الأيام التفصيلي للفترة</span>
                <span className="font-mono text-slate-400 font-normal">({startDate} إلى {endDate})</span>
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">{dossierDailyLedger.length} يوم</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-950/90 text-slate-400 text-[11px] border-b border-slate-800">
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">اليوم</th>
                    <th className="py-2.5 px-3 text-center">حضور (IN)</th>
                    <th className="py-2.5 px-3 text-center">انصراف (OUT)</th>
                    <th className="py-2.5 px-3">الماكينة</th>
                    <th className="py-2.5 px-3 text-center">التأخير (دقيقة)</th>
                    <th className="py-2.5 px-3 text-center">ساعات الإضافي</th>
                    <th className="py-2.5 px-3">التصريح</th>
                    <th className="py-2.5 px-3 text-center">الحالة</th>
                    <th className="py-2.5 px-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {dossierDailyLedger.map((row) => (
                    <tr 
                      key={row.date} 
                      className={`hover:bg-slate-850/60 transition-colors ${row.isFriday ? 'bg-slate-950/40 text-slate-400' : ''}`}
                    >
                      <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{row.date}</td>
                      <td className="py-2 px-3 font-sans text-slate-300 whitespace-nowrap">{row.dayName}</td>
                      <td className="py-2 px-3 text-center font-bold text-emerald-400">{row.checkIn}</td>
                      <td className="py-2 px-3 text-center font-bold text-blue-400">{row.checkOut}</td>
                      <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">{row.machineName}</td>
                      <td className="py-2 px-3 text-center">
                        {row.lateMinutes > 0 ? (
                          <span className="text-amber-400 font-bold">+{row.lateMinutes} د</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {row.overtimeHours > 0 ? (
                          <span className="text-cyan-400 font-bold font-mono">+{row.overtimeHours} س</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans text-purple-300 text-[11px]">{row.gatePassInfo}</td>
                      <td className="py-2 px-3 text-center font-sans">
                        <span className={`text-[10px] px-2 py-0.5 rounded ${
                          row.status.startsWith('حاضر في الموعد')
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : row.status.startsWith('حاضر متأخر')
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : row.status === 'غائب'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : row.status.startsWith('عمل يوم الجمعة')
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 3: POINT 13 - ADVANCED OVERTIME REPORT (تقارير الإضافي المتقدمة) */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'overtime' && (
        <div className="space-y-4">
          {/* Overtime Policy Settings & Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>محرك حساب الساعات الإضافية المتقدم (Overtime Engine)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                      معادلة المصنع
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    استخراج الإضافي بدقة بعد الـ 4:30، مع استثناء فترة سماح الخروج الطبيعي (4:45)، وحساب إضافي السهر والجمعة
                  </p>
                </div>
              </div>

              {/* View Switcher: Summary vs Detailed */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setOtViewMode('summary')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    otViewMode === 'summary' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ملخص العمال ({advancedOtSummary.length})
                </button>
                <button
                  onClick={() => setOtViewMode('detailed')}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    otViewMode === 'detailed' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  سجل البصمات اليومي ({advancedOtDailyPunches.length})
                </button>
              </div>
            </div>

            {/* Overtime Policy Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium flex items-center justify-between">
                  <span>سماحية الانصراف العادي:</span>
                  <span className="text-amber-400 font-bold font-mono">{otDepartureGrace} دقيقة</span>
                </label>
                <select
                  value={otDepartureGrace}
                  onChange={(e) => setOtDepartureGrace(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                >
                  <option value={10}>10 دقائق (حتى 4:40 مساءً)</option>
                  <option value={15}>15 دقيقة (حتى 4:45 مساءً - الموصى به)</option>
                  <option value={20}>20 دقيقة (حتى 4:50 مساءً)</option>
                  <option value={30}>30 دقيقة (حتى 5:00 مساءً)</option>
                </select>
                <span className="text-[10px] text-slate-500 block">
                  من يبصم قبل 4:45 يعتبر خروج طبيعي ولا يحسب له إضافي
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium">تصفية بماكينة البصمة:</label>
                <select
                  value={otDeviceFilter}
                  onChange={(e) => setOtDeviceFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                >
                  <option value="all">جميع الماكينات (الـ 6 أجهزة)</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.department})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block">
                  ماكينات الرجال / ماكينات السيدات
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                <label className="text-slate-300 font-medium">تصفية بالجنسية:</label>
                <select
                  value={otNationalityFilter}
                  onChange={(e) => setOtNationalityFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                >
                  <option value="all">جميع الجنسيات</option>
                  <option value="مصري">مصريين (وردية 8:00 - 16:30)</option>
                  <option value="بنغلاديشي">بنغال (وردية 8:00 - 18:30)</option>
                </select>
                <span className="text-[10px] text-slate-500 block">
                  يطبق مواعيد وردية كل جنسية بدقة
                </span>
              </div>
            </div>
          </div>

          {/* Overtime Metric Summary Cards (Hours and Minutes Only) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">إجمالي الساعات الإضافية بالمصنع</span>
              <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
                {totalOtFactoryHours} <span className="text-xs text-slate-400 font-sans">ساعة</span>
              </span>
              <span className="text-[11px] text-amber-300/80 font-mono block mt-0.5 font-bold">
                ({formatHoursAndMinutes(totalOtFactoryHours)})
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">عدد العمال المستحقين للإضافي</span>
              <span className="text-2xl font-bold font-mono text-cyan-400 mt-1 block">
                {otWorkersCount} <span className="text-xs text-slate-400 font-sans">عامل</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">من إجمالي {filteredOtWorkers.length} عامل</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-slate-400 text-[11px] block">متوسط الإضافي لكل مستحق</span>
              <span className="text-2xl font-bold font-mono text-purple-400 mt-1 block">
                {otWorkersCount > 0 ? (totalOtFactoryHours / otWorkersCount).toFixed(1) : 0} <span className="text-xs text-slate-400 font-sans">س/عامل</span>
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">خلال الفترة المحددة</span>
            </div>
          </div>

          {/* VIEW 1: SUMMARY BY WORKER */}
          {otViewMode === 'summary' && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>كشف ملخص الساعات الإضافية حسب العامل</span>
                  <span className="text-[11px] text-slate-400 font-mono">({advancedOtSummary.length} عامل)</span>
                </h4>
              </div>

              {advancedOtSummary.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800 font-medium">
                        <th className="py-2.5 px-3 text-center w-12">م</th>
                        <th className="py-2.5 px-3">كود</th>
                        <th className="py-2.5 px-3">اسم العامل</th>
                        <th className="py-2.5 px-3">القسم</th>
                        <th className="py-2.5 px-3">الجنسية</th>
                        <th className="py-2.5 px-3">الماكينة</th>
                        <th className="py-2.5 px-3 text-center">أيام العمل</th>
                        <th className="py-2.5 px-3 text-center">أيام الإضافي</th>
                        <th className="py-2.5 px-3 text-center">إضافي وردية</th>
                        <th className="py-2.5 px-3 text-center">إضافي سهر/جمعة</th>
                        <th className="py-2.5 px-3 text-center">إجمالي الإضافي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {advancedOtSummary.map((item, idx) => (
                        <tr key={item.worker.code} className="hover:bg-slate-850/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-white">{item.worker.code}</td>
                          <td className="py-2 px-3 font-sans font-medium text-white">{item.worker.name}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{item.worker.department}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{item.worker.nationality}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{item.machineName}</td>
                          <td className="py-2 px-3 text-center text-slate-300">{item.daysWorked}</td>
                          <td className="py-2 px-3 text-center text-amber-400 font-bold">{item.otDays}</td>
                          <td className="py-2 px-3 text-center text-slate-300">{item.shiftOtHours} س</td>
                          <td className="py-2 px-3 text-center text-indigo-400 font-bold">{item.fridayOtHours} س</td>
                          <td className="py-2 px-3 text-center text-amber-400 font-bold text-sm bg-amber-950/20">
                            {formatHoursAndMinutes(item.totalOtHours)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  لا توجد حركات إضافية مسجلة في هذه الفترة المطابقة لشروط البحث.
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: DETAILED DAILY PUNCHES */}
          {otViewMode === 'detailed' && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>سجل بصمات الانصراف والإضافي اليومي التفصيلي</span>
                    <span className="text-[11px] text-slate-400 font-mono">({advancedOtDailyPunches.length} حركة)</span>
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    يبيّن دقيقة بدقيقة متى بصم العامل، وهل تعتبر البصمة خروج عادي ضمن السماحية أم ساعات إضافية معتمدة
                  </p>
                </div>
              </div>

              {advancedOtDailyPunches.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800 font-medium">
                        <th className="py-2.5 px-3">التاريخ</th>
                        <th className="py-2.5 px-3">اليوم</th>
                        <th className="py-2.5 px-3">كود</th>
                        <th className="py-2.5 px-3">اسم العامل</th>
                        <th className="py-2.5 px-3">القسم</th>
                        <th className="py-2.5 px-3">الماكينة</th>
                        <th className="py-2.5 px-3 text-center">نهاية الوردية</th>
                        <th className="py-2.5 px-3 text-center">حضور</th>
                        <th className="py-2.5 px-3 text-center">انصراف</th>
                        <th className="py-2.5 px-3 text-center">بعد الوردية</th>
                        <th className="py-2.5 px-3">حالة البصمة والاحتساب</th>
                        <th className="py-2.5 px-3 text-center">الإضافي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {advancedOtDailyPunches.map((punch, idx) => (
                        <tr key={`${punch.code}-${punch.date}-${idx}`} className="hover:bg-slate-850/60 transition-colors">
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{punch.date}</td>
                          <td className="py-2 px-3 font-sans text-slate-400 whitespace-nowrap">{punch.dayName}</td>
                          <td className="py-2 px-3 font-bold text-white">{punch.code}</td>
                          <td className="py-2 px-3 font-sans font-medium text-white">{punch.name}</td>
                          <td className="py-2 px-3 font-sans text-slate-300">{punch.department}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{punch.machineName}</td>
                          <td className="py-2 px-3 text-center text-slate-400">{punch.shiftEnd}</td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-400">{punch.checkInTime}</td>
                          <td className="py-2 px-3 text-center font-bold text-blue-400">{punch.checkOutTime}</td>
                          <td className="py-2 px-3 text-center">
                            {punch.minutesPastShift > 0 ? (
                              <span className="text-amber-400 font-bold font-mono">+{punch.minutesPastShift} د</span>
                            ) : (
                              <span className="text-slate-500">{punch.minutesPastShift} د</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-sans">
                            <span className={`text-[10px] px-2 py-0.5 rounded ${
                              punch.otHours > 0
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold'
                                : punch.statusLabel.includes('ضمن السماحية')
                                ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {punch.statusLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold">
                            {punch.otHours > 0 ? (
                              <span className="text-cyan-400 font-mono">+{formatHoursAndMinutes(punch.otHours)}</span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  لا توجد حركات تفصيلية مطابقة لشروط البحث في هذه الفترة.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 4: MOST LATE REPORT */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'late' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          {dynamicLateStats.length > 0 ? (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold text-center w-12">م</th>
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold text-center">أيام التأخير</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجمالي التأخير</th>
                  <th className="py-2.5 px-3 font-semibold text-center">متوسط التأخير اليومي</th>
                  <th className="py-2.5 px-3 font-semibold text-center">السماحية المقررة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {dynamicLateStats.map((item, idx) => (
                  <tr key={item.code} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 text-white font-bold">{item.code}</td>
                    <td className="py-2 px-3 font-sans font-medium text-white">{item.name}</td>
                    <td className="py-2 px-3 font-sans text-slate-400">{item.department}</td>
                    <td className="py-2 px-3 text-center text-amber-400 font-bold">{item.lateDaysCount}</td>
                    <td className="py-2 px-3 text-center text-white">{item.totalLateMinutes} دقيقة</td>
                    <td className="py-2 px-3 text-center text-slate-300">{item.avgMinutesPerDay} د/يوم</td>
                    <td className="py-2 px-3 text-center font-sans text-slate-400">{item.customGrace}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              لا توجد تأخيرات مسجلة في هذه الفترة ({startDate} إلى {endDate}).
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* TAB 5: ALL WORKERS MASTER */}
      {/* -------------------------------------------------------------------- */}
      {activeReportTab === 'timesheet' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                <th className="py-2.5 px-3 font-semibold">كود</th>
                <th className="py-2.5 px-3 font-semibold">الاسم</th>
                <th className="py-2.5 px-3 font-semibold">القسم</th>
                <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                <th className="py-2.5 px-3 font-semibold text-center">الجنسية</th>
                <th className="py-2.5 px-3 font-semibold text-center">الماكينة</th>
                <th className="py-2.5 px-3 font-semibold text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {workers.map((w) => (
                <tr key={w.code} className="hover:bg-slate-850/60 transition-colors">
                  <td className="py-2 px-3 font-mono font-bold text-white">{w.code}</td>
                  <td className="py-2 px-3 font-medium text-white">{w.name}</td>
                  <td className="py-2 px-3 text-slate-300">{w.department}</td>
                  <td className="py-2 px-3 font-mono text-slate-400">{w.line || '-'}</td>
                  <td className="py-2 px-3 text-slate-400">{w.jobTitle}</td>
                  <td className="py-2 px-3 text-center">{w.nationality}</td>
                  <td className="py-2 px-3 text-center text-slate-400 text-[11px]">{w.enrolledOnDeviceName || 'ماكينة المصنع'}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      w.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {w.isActive ? 'نشط' : 'مجمد'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
