import React, { useState, useMemo } from 'react';
import { 
  Fingerprint, 
  Search, 
  Plus, 
  FileSpreadsheet,
  Eye,
  EyeOff,
  Calendar,
  Filter,
  ChevronRight,
  ChevronLeft,
  Clock,
  Layers,
  Sparkles,
  Info,
  Edit2,
  Trash2,
  Save,
  X,
  AlertCircle,
  ScanFace,
  CreditCard,
  AlertTriangle,
  History,
  ArrowRightLeft,
  HelpCircle,
  CheckCheck,
  ShieldCheck
} from 'lucide-react';
import { AttendanceRecord, Worker, Device, FactorySettings, HRAuditRecord, GatePass, PunchType } from '../types';
import { processSmartAttendanceLogs, exportToExcel } from '../utils/attendanceEngine';

interface AttendanceLogsProps {
  records: AttendanceRecord[];
  workers: Worker[];
  devices: Device[];
  shiftEndTime?: string;
  settings?: FactorySettings;
  auditLog?: HRAuditRecord[];
  gatePasses?: GatePass[];
  onAddManualRecord: (record: AttendanceRecord) => void;
  onUpdateRecord?: (record: AttendanceRecord) => void;
  onDeleteRecord?: (id: string) => void;
  onAddAuditRecord?: (record: HRAuditRecord) => void;
  onAddGatePass?: (gatePass: GatePass) => void;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const AttendanceLogs: React.FC<AttendanceLogsProps> = ({
  records,
  workers,
  devices,
  shiftEndTime = '16:30',
  settings,
  auditLog = [],
  gatePasses = [],
  onAddManualRecord,
  onUpdateRecord,
  onDeleteRecord,
  onAddAuditRecord,
  onAddGatePass,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');

  // Ambiguous Punch Resolution Modal State (Point 4 & Bug 2)
  const [resolvingRecord, setResolvingRecord] = useState<AttendanceRecord | null>(null);
  const [resolutionChoice, setResolutionChoice] = useState<'temporary_pass' | 'final_out' | 'late_in'>('temporary_pass');
  const [expectedReturnTime, setExpectedReturnTime] = useState<string>('14:30');
  const [passReason, setPassReason] = useState<string>('تصريح شخصي معتمد');

  // Missing IN Quick Override Modal State (Point 5 & Bug 1)
  const [overridingRecord, setOverridingRecord] = useState<AttendanceRecord | null>(null);
  const [missingInTime, setMissingInTime] = useState<string>('08:00');
  const [missingInEditor, setMissingInEditor] = useState<string>('مسؤول الموارد البشرية');
  const [overrideReason, setOverrideReason] = useState<string>('نسيان بصمة الصباح وتواجد بالعمل');

  // Audit Log Modal State (Point 7)
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');

  // Edit Punch Modal State
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editWorkerCode, setEditWorkerCode] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [editState, setEditState] = useState<'IN' | 'OUT'>('IN');
  const [editPunchType, setEditPunchType] = useState<PunchType>('FINGERPRINT');
  const [editDeviceId, setEditDeviceId] = useState<number>(0);
  const [editLateMinutes, setEditLateMinutes] = useState<number>(0);
  const [editOvertimeHours, setEditOvertimeHours] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Date Filtering State
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const todayISO = new Date().toISOString().slice(0, 10);
  const [customFromDate, setCustomFromDate] = useState<string>(todayISO);
  const [customToDate, setCustomToDate] = useState<string>(todayISO);

  // Real Dynamic Deduplication State
  const [filterDuplicates, setFilterDuplicates] = useState<boolean>(true);
  const [duplicateThresholdMinutes, setDuplicateThresholdMinutes] = useState<number>(10);

  // Pagination State (for 10,000+ records lightning-fast rendering)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  // Manual record form modal
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualWorkerCode, setManualWorkerCode] = useState<number>(workers.length > 0 ? workers[0].code : 101);
  const [manualType, setManualType] = useState<'IN' | 'OUT'>('IN');
  const [manualTime, setManualTime] = useState<string>('08:00');
  const [manualDate, setManualDate] = useState<string>(todayISO);
  const [manualReason, setManualReason] = useState<string>('');
  const [manualEditor, setManualEditor] = useState<string>('مسؤول الموارد البشرية');

  // Fast map lookup for worker info
  const workerMap = useMemo(() => {
    const map = new Map<number, Worker>();
    workers.forEach((w) => map.set(w.code, w));
    return map;
  }, [workers]);

  // Smart Attendance Processing (Dynamic Cooldown, 1st & Last Punch, Shift Reactivity, 3-zone Single Punch)
  const { smartRecords, detectedDuplicatesCount, missedPunchesCount, ambiguousCount, missingInCount } = useMemo(() => {
    const processed = processSmartAttendanceLogs(records, { 
      shiftEndTime: settings?.standardShiftEnd || shiftEndTime,
      bangladeshiShiftEnd: settings?.bangladeshiShiftEnd || '18:30',
      earlyDepartureWindowMinutes: settings?.earlyDepartureWindowMinutes ?? 30,
      duplicateWindowMinutes: settings?.duplicateWindowMinutes ?? 60,
      overtimeGraceMinutes: settings?.overtimeGraceMinutes ?? 30,
      overnightCutoffHour: settings?.overnightCutoffHour ?? 6,
      workers,
      workerMap,
    });
    let dupCount = 0;
    let missedCount = 0;
    let ambigCount = 0;
    let missingCount = 0;

    const enriched = processed.map((rec) => {
      const worker = workerMap.get(rec.workerCode);
      const effectiveName = (worker && worker.name && !worker.name.startsWith('عامل كود #') && !worker.name.startsWith('عامل كود'))
        ? worker.name 
        : rec.workerName;
      const effectiveDept = worker?.department || rec.department;

      if (rec.isDuplicateIgnored) dupCount++;
      if (rec.isMissedPunch) missedCount++;
      if (rec.isAmbiguousSinglePunch) ambigCount++;
      if (rec.missingInPunch) missingCount++;

      return {
        ...rec,
        workerName: effectiveName,
        department: effectiveDept,
      };
    });

    // Re-sort descending (newest records first) for the UI
    enriched.sort((a, b) => {
      const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
      const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
      if (isNaN(tA) || isNaN(tB)) return (b.id || '').localeCompare(a.id || '');
      return tB - tA;
    });

    return { 
      smartRecords: enriched, 
      detectedDuplicatesCount: dupCount, 
      missedPunchesCount: missedCount,
      ambiguousCount: ambigCount,
      missingInCount: missingCount
    };
  }, [records, workerMap, settings, shiftEndTime, workers]);

  // Filtered records by Date, Deduplication, Department, State, and Search
  const filteredRecords = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    return smartRecords.filter((rec) => {
      // 1. Deduplication filter (< 60 minutes)
      if (filterDuplicates && rec.isDuplicateIgnored) return false;

      // 2. Date presets
      if (datePreset === 'today' && rec.displayDate !== today) return false;
      if (datePreset === 'yesterday' && rec.displayDate !== yesterdayDate) return false;
      if (datePreset === 'week' && rec.displayDate < sevenDaysAgo) return false;
      if (datePreset === 'month' && rec.displayDate < monthStart) return false;
      if (datePreset === 'custom') {
        if (customFromDate && rec.displayDate < customFromDate) return false;
        if (customToDate && rec.displayDate > customToDate) return false;
      }

      // 3. Department filter
      if (selectedDept !== 'all' && rec.department !== selectedDept) return false;

      // 4. Punch state & special filters
      if (selectedState === 'IN' && rec.resolvedState !== 'IN') return false;
      if (selectedState === 'OUT' && rec.resolvedState !== 'OUT') return false;
      if (selectedState === 'AMBIGUOUS' && !rec.isAmbiguousSinglePunch) return false;
      if (selectedState === 'MISSING_IN' && !rec.missingInPunch) return false;
      if (selectedState === 'MISSED' && !rec.isMissedPunch) return false;
      if (selectedState === 'HR_OVERRIDE' && !rec.isHROverride && !rec.isManual) return false;

      // 5. Device filter
      if (selectedDeviceId !== 'all' && String(rec.deviceId) !== selectedDeviceId) return false;

      // 6. Text search query (Name, Code, Dept)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = rec.workerName.toLowerCase().includes(q);
        const matchesCode = rec.workerCode.toString().includes(q);
        const matchesDept = rec.department.toLowerCase().includes(q);
        const matchesDevice = rec.deviceName.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesDept && !matchesDevice) return false;
      }

      return true;
    });
  }, [
    smartRecords,
    filterDuplicates,
    datePreset,
    customFromDate,
    customToDate,
    selectedDept,
    selectedState,
    selectedDeviceId,
    searchQuery,
  ]);

  // Departments list for dropdown
  const departments = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => set.add(w.department));
    records.forEach((r) => set.add(r.department));
    return Array.from(set).filter(Boolean);
  }, [workers, records]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(() => {
    const startIndex = (validPage - 1) * pageSize;
    return filteredRecords.slice(startIndex, startIndex + pageSize);
  }, [filteredRecords, validPage, pageSize]);

  // Handle Export to Excel with full details
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;
    const exportData = filteredRecords.map((r) => ({
      'كود العامل': r.workerCode,
      'اسم العامل': r.workerName,
      'القسم': r.department,
      'التاريخ': r.displayDate,
      'الوقت': r.displayTime,
      'الحالة': r.resolvedState === 'IN' ? 'حضور' : 'انصراف',
      'طريقة التسجيل': r.punchType === 'FACE' ? 'بصمة وجه' : r.punchType === 'CARD' ? 'كارت' : r.punchType === 'MANUAL' ? 'يدوي (HR)' : 'بصمة إصبع',
      'الماكينة': r.deviceName,
      'حالة الحركة': r.isMissedPunch ? 'بصمة ناقصة' : r.isHROverride ? 'معتمد HR' : r.isDuplicateIgnored ? 'تكرار مستبعد' : 'حركة سليمة',
      'ملاحظات': r.manualNote || '',
    }));

    const dateLabel = datePreset === 'today' ? 'اليوم' : datePreset === 'all' ? 'الكل' : datePreset;
    exportToExcel(
      exportData, 
      'سجل_الحركات', 
      `سجل_حركات_البصمة_${dateLabel}_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const worker = workers.find((w) => w.code === manualWorkerCode);
    if (!worker) return;

    const newRecord: AttendanceRecord = {
      id: `man-${Date.now()}`,
      workerCode: worker.code,
      workerName: worker.name,
      department: worker.department,
      timestamp: `${manualDate}T${manualTime}:00`,
      displayDate: manualDate,
      displayTime: manualTime,
      rawState: manualType,
      resolvedState: manualType,
      deviceId: 0,
      deviceName: 'تسجيل يدوي',
      punchType: 'MANUAL',
      isManual: true,
      isHROverride: true,
      isMissedPunch: false,
      isDuplicateIgnored: false,
      manualNote: manualReason || 'تسجيل يدوي بواسطة HR',
      manualEditor: manualEditor,
    };

    onAddManualRecord(newRecord);

    // Audit Log Entry (Point 7)
    if (onAddAuditRecord) {
      onAddAuditRecord({
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        displayTime: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        displayDate: new Date().toISOString().slice(0, 10),
        modifiedBy: manualEditor || 'مسؤول الموارد البشرية',
        workerCode: worker.code,
        workerName: worker.name,
        recordId: newRecord.id,
        recordDate: manualDate,
        recordTime: manualTime,
        actionType: 'ADD_MANUAL_PUNCH',
        oldValue: 'لا يوجد',
        newValue: `${manualType === 'IN' ? 'حضور' : 'انصراف'} (${manualTime})`,
        reason: manualReason || 'إضافة حركة يدوية مباشرة',
      });
    }

    setShowManualModal(false);
    setManualReason('');
  };

  const handleStartEdit = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditWorkerCode(rec.workerCode);
    setEditDate(rec.displayDate);
    setEditTime(rec.displayTime);
    setEditState(rec.resolvedState);
    setEditPunchType(rec.punchType || 'FINGERPRINT');
    setEditDeviceId(rec.deviceId);
    setEditLateMinutes(rec.lateMinutes || 0);
    setEditOvertimeHours(rec.overtimeHours || 0);
    setEditNote(rec.manualNote || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const worker = workerMap.get(editWorkerCode);
    const device = devices.find((d) => d.id === editDeviceId);

    const oldDesc = `${editingRecord.resolvedState === 'IN' ? 'حضور' : 'انصراف'} (${editingRecord.displayTime})`;
    const newDesc = `${editState === 'IN' ? 'حضور' : 'انصراف'} (${editTime})`;

    const updatedRecord: AttendanceRecord = {
      ...editingRecord,
      workerCode: editWorkerCode,
      workerName: worker ? worker.name : editingRecord.workerName,
      department: worker ? worker.department : editingRecord.department,
      displayDate: editDate,
      displayTime: editTime,
      timestamp: `${editDate}T${editTime}:00`,
      rawState: editState,
      resolvedState: editState,
      punchType: editPunchType,
      deviceId: editDeviceId,
      deviceName: device ? device.name : editingRecord.deviceName,
      isManual: true,
      isHROverride: true,
      isMissedPunch: false,
      missingInPunch: false,
      isDuplicateIgnored: false,
      lateMinutes: editState === 'IN' && editLateMinutes > 0 ? editLateMinutes : undefined,
      overtimeHours: editOvertimeHours > 0 ? editOvertimeHours : undefined,
      isOvertime: editOvertimeHours > 0,
      manualNote: editNote.trim() ? editNote.trim() : 'تم التعديل والاعتماد يدوياً (HR Override)',
    };

    if (onUpdateRecord) {
      onUpdateRecord(updatedRecord);
    }

    // Audit Log Entry (Point 7)
    if (onAddAuditRecord) {
      onAddAuditRecord({
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        displayTime: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        displayDate: new Date().toISOString().slice(0, 10),
        modifiedBy: 'مسؤول الموارد البشرية',
        workerCode: editWorkerCode,
        workerName: worker ? worker.name : editingRecord.workerName,
        recordId: editingRecord.id,
        recordDate: editDate,
        recordTime: editTime,
        actionType: 'MANUAL_EDIT',
        oldValue: oldDesc,
        newValue: newDesc,
        reason: editNote.trim() || 'تعديل بيانات البصمة يدوياً',
      });
    }

    setEditingRecord(null);
  };

  const handleDeletePunch = (id: string) => {
    const target = records.find((r) => r.id === id);
    if (onDeleteRecord) {
      onDeleteRecord(id);
    }

    // Audit Log Entry (Point 7)
    if (onAddAuditRecord && target) {
      onAddAuditRecord({
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        displayTime: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        displayDate: new Date().toISOString().slice(0, 10),
        modifiedBy: 'مسؤول الموارد البشرية',
        workerCode: target.workerCode,
        workerName: target.workerName,
        recordId: target.id,
        recordDate: target.displayDate,
        recordTime: target.displayTime,
        actionType: 'DELETE_PUNCH',
        oldValue: `${target.resolvedState === 'IN' ? 'حضور' : 'انصراف'} (${target.displayTime})`,
        newValue: 'حذف نهائي من السجلات',
        reason: 'حذف حركة بصمة خاطئة أو مكررة يدوياً',
      });
    }

    setDeleteConfirmId(null);
  };

  // Point 4: Ambiguous Window Resolution Popup Handler (Bug 2 & 3: 3 Choices)
  const handleConfirmAmbiguousResolution = () => {
    if (!resolvingRecord || !onUpdateRecord) return;
    const worker = workerMap.get(resolvingRecord.workerCode);
    const workerName = worker?.name || resolvingRecord.workerName;
    const nowIso = new Date().toISOString();
    const curTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const curDate = new Date().toISOString().slice(0, 10);

    if (resolutionChoice === 'temporary_pass') {
      const passId = `pass-${Date.now()}`;
      const updated: AttendanceRecord = {
        ...resolvingRecord,
        rawState: 'OUT',
        resolvedState: 'OUT',
        isAmbiguousSinglePunch: false,
        ambiguousResolution: 'temporary_pass',
        expectedReturnTime: expectedReturnTime,
        linkedPermissionId: passId,
        isHROverride: true,
        isManual: true,
        isMissedPunch: false,
        missedPunchReason: undefined,
        manualNote: `تصريح خروج مؤقت (عودة متوقعة: ${expectedReturnTime}) - ${passReason}`,
      };
      onUpdateRecord(updated);

      // Create Gate Pass automatically
      if (onAddGatePass) {
        const newPass: GatePass = {
          id: passId,
          workerCode: resolvingRecord.workerCode,
          workerName: workerName,
          department: resolvingRecord.department,
          date: resolvingRecord.displayDate,
          exitTime: resolvingRecord.displayTime,
          returnTime: expectedReturnTime,
          type: 'temporary',
          reason: 'personal_excused',
          reasonText: passReason,
          approvedBy: 'مسؤول الموارد البشرية',
          status: 'active',
        };
        onAddGatePass(newPass);
      }

      // Record in Audit Log (Point 7)
      if (onAddAuditRecord) {
        onAddAuditRecord({
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          displayTime: curTime,
          displayDate: curDate,
          modifiedBy: 'مسؤول الموارد البشرية',
          workerCode: resolvingRecord.workerCode,
          workerName: workerName,
          recordId: resolvingRecord.id,
          recordDate: resolvingRecord.displayDate,
          recordTime: resolvingRecord.displayTime,
          actionType: 'RESOLVE_AMBIGUOUS_PASS',
          oldValue: `بصمة في نافذة الغموض (${resolvingRecord.displayTime})`,
          newValue: `تصريح مؤقت حتى ${expectedReturnTime}`,
          reason: passReason,
        });
      }
    } else if (resolutionChoice === 'late_in') {
      // Choice 3 (Bug 2 & 3): Late IN
      const [sH, sM] = (settings?.standardShiftStart || '08:00').split(':').map((v) => parseInt(v, 10) || 0);
      const shiftStartMinutes = sH * 60 + sM;
      const [pHStr, pMStr] = (resolvingRecord.displayTime || '12:00').split(':');
      const punchMinutes = (parseInt(pHStr, 10) || 12) * 60 + (parseInt(pMStr, 10) || 0);
      const rawLateMinutes = Math.max(0, punchMinutes - shiftStartMinutes);

      // Point 1: Search GatePasses for delay permissions for this worker on this date
      const delayPass = gatePasses.find((gp) =>
        gp.workerCode === resolvingRecord.workerCode &&
        gp.date === resolvingRecord.displayDate &&
        (gp.type === 'delay' || (gp.reasonText && gp.reasonText.includes('تأخير')) || (gp.reasonText && gp.reasonText.includes('إذن تأخير')))
      );

      let approvedDelayMinutes = 0;
      if (delayPass) {
        if (delayPass.returnTime && delayPass.exitTime) {
          const [eH, eM] = delayPass.exitTime.split(':').map((v) => parseInt(v, 10) || 0);
          const [rH, rM] = delayPass.returnTime.split(':').map((v) => parseInt(v, 10) || 0);
          approvedDelayMinutes = Math.max(0, (rH * 60 + rM) - (eH * 60 + eM));
        } else if (delayPass.returnTime) {
          const [rH, rM] = delayPass.returnTime.split(':').map((v) => parseInt(v, 10) || 0);
          approvedDelayMinutes = Math.max(0, (rH * 60 + rM) - shiftStartMinutes);
        } else {
          approvedDelayMinutes = 120; // 2 hours default if unspecified
        }
      }

      let calculatedLateMinutes = rawLateMinutes;
      let lateNote = `اعتماد حضور متأخر (+${rawLateMinutes} د تأخير من ${settings?.standardShiftStart || '08:00'})`;

      if (delayPass && approvedDelayMinutes > 0) {
        if (rawLateMinutes <= approvedDelayMinutes) {
          calculatedLateMinutes = 0;
          lateNote = `حضور متأخر بإذن (تمت تغطية التأخير بالكامل بموجب إذن التأخير حتى ${delayPass.returnTime || '-'})`;
        } else {
          calculatedLateMinutes = rawLateMinutes - approvedDelayMinutes;
          lateNote = `حضور متأخر بإذن جزئي: تم خصم ${approvedDelayMinutes} دقيقة إذن، والمتبقي ${calculatedLateMinutes} دقيقة تأخير`;
        }
      }

      if (passReason) {
        lateNote += ` - ${passReason}`;
      }

      const updated: AttendanceRecord = {
        ...resolvingRecord,
        rawState: 'IN',
        resolvedState: 'IN',
        isAmbiguousSinglePunch: false,
        ambiguousResolution: 'late_in',
        lateMinutes: calculatedLateMinutes,
        linkedPermissionId: delayPass?.id,
        isHROverride: true,
        isManual: true,
        isMissedPunch: false,
        missingInPunch: false,
        missedPunchReason: undefined,
        manualNote: lateNote,
      };
      onUpdateRecord(updated);

      if (onAddAuditRecord) {
        onAddAuditRecord({
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          displayTime: curTime,
          displayDate: curDate,
          modifiedBy: 'مسؤول الموارد البشرية',
          workerCode: resolvingRecord.workerCode,
          workerName: workerName,
          recordId: resolvingRecord.id,
          recordDate: resolvingRecord.displayDate,
          recordTime: resolvingRecord.displayTime,
          actionType: 'RESOLVE_AMBIGUOUS_LATE_IN',
          oldValue: `بصمة في نافذة الغموض (${resolvingRecord.displayTime})`,
          newValue: calculatedLateMinutes === 0 
            ? `حضور متأخر بإذن (0 د تأخير - مغطى بإذن)` 
            : `اعتماد كحضور متأخر (+${calculatedLateMinutes} د تأخير)`,
          reason: lateNote,
        });
      }
    } else {
      // Choice 2: Final OUT
      const updated: AttendanceRecord = {
        ...resolvingRecord,
        rawState: 'OUT',
        resolvedState: 'OUT',
        isAmbiguousSinglePunch: false,
        ambiguousResolution: 'final_out',
        isHROverride: true,
        isManual: true,
        isMissedPunch: false,
        missedPunchReason: undefined,
        manualNote: 'انصراف نهائي معتمد (إغلاق يوم العامل)',
      };
      onUpdateRecord(updated);

      // Record in Audit Log (Point 7)
      if (onAddAuditRecord) {
        onAddAuditRecord({
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          displayTime: curTime,
          displayDate: curDate,
          modifiedBy: 'مسؤول الموارد البشرية',
          workerCode: resolvingRecord.workerCode,
          workerName: workerName,
          recordId: resolvingRecord.id,
          recordDate: resolvingRecord.displayDate,
          recordTime: resolvingRecord.displayTime,
          actionType: 'RESOLVE_AMBIGUOUS_OUT',
          oldValue: `بصمة في نافذة الغموض (${resolvingRecord.displayTime})`,
          newValue: 'انصراف نهائي',
          reason: 'اعتماد انصراف نهائي وإغلاق اليوم',
        });
      }
    }

    setResolvingRecord(null);
  };

  // Point 5 & Bug 1 Fix: Missing IN Manual Addition Handler (Zero mutation of original OUT machine punch!)
  const handleConfirmOverrideToIn = () => {
    if (!overridingRecord || !onAddManualRecord) return;
    const worker = workerMap.get(overridingRecord.workerCode);
    const workerName = worker?.name || overridingRecord.workerName;
    const nowIso = new Date().toISOString();
    const curTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const curDate = new Date().toISOString().slice(0, 10);

    // CRITICAL: DO NOT MUTATE THE ORIGINAL OUT RECORD!
    // Create a new manual punch for the morning IN:
    const newInRecord: AttendanceRecord = {
      id: `manual-in-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      workerCode: overridingRecord.workerCode,
      workerName: workerName,
      department: worker?.department || overridingRecord.department,
      timestamp: `${overridingRecord.displayDate}T${missingInTime}:00`,
      displayDate: overridingRecord.displayDate,
      displayTime: missingInTime,
      rawState: 'IN',
      resolvedState: 'IN',
      punchType: 'MANUAL',
      deviceId: 0,
      deviceName: 'تسجيل يدوي (تصحيح حضور صباحي)',
      isManual: true,
      isHROverride: true,
      manualEditor: missingInEditor,
      manualNote: `تصحيح حضور ناقص (مرتبط بانصراف ${overridingRecord.displayTime}) - السبب: ${overrideReason}`,
      missingInPunch: false,
      isMissedPunch: false,
    };

    onAddManualRecord(newInRecord);

    // Record in Audit Log (Point 7)
    if (onAddAuditRecord) {
      onAddAuditRecord({
        id: `audit-${Date.now()}`,
        timestamp: nowIso,
        displayTime: curTime,
        displayDate: curDate,
        modifiedBy: missingInEditor,
        workerCode: overridingRecord.workerCode,
        workerName: workerName,
        recordId: overridingRecord.id,
        recordDate: overridingRecord.displayDate,
        recordTime: overridingRecord.displayTime,
        actionType: 'RESOLVE_MISSING_IN',
        oldValue: `بصمة انصراف منفردة (${overridingRecord.displayTime}) دون حضور صباحي`,
        newValue: `إضافة بصمة حضور جديدة الساعة (${missingInTime}) والإبقاء على الانصراف دون تغيير`,
        reason: overrideReason,
      });
    }

    setOverridingRecord(null);
  };

  return (
    <div className="space-y-3.5">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Fingerprint className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>سجل حركات البصمة</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 font-mono border border-slate-700">
                {filteredRecords.length.toLocaleString('ar-EG')} حركة
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              إجمالي السجلات المسحوبة: <span className="font-mono text-slate-300 font-bold">{records.length.toLocaleString('ar-EG')}</span>
              {detectedDuplicatesCount > 0 && (
                <span className="text-amber-400 mr-2">
                  (تم رصد {detectedDuplicatesCount} بصمة مكررة)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Deduplication Toggle (Smart 1-Hour Rule) */}
          <button
            onClick={() => {
              setFilterDuplicates(!filterDuplicates);
              setCurrentPage(1);
            }}
            title="تجاهل تكرار البصمة الأقل من ساعة واحدة (Smart Deduplication)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
              filterDuplicates
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {filterDuplicates ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>استبعاد التكرار (&lt; 1 ساعة)</span>
            {detectedDuplicatesCount > 0 && filterDuplicates && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-800 text-[10px] font-mono">
                -{detectedDuplicatesCount}
              </span>
            )}
          </button>

          {/* Add Manual Record */}
          {workers.length > 0 && (
            <button
              onClick={() => {
                setManualWorkerCode(workers[0].code);
                setShowManualModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة حركة يدوية</span>
            </button>
          )}

          {/* Export to Excel */}
          {filteredRecords.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير Excel ({filteredRecords.length})</span>
            </button>
          )}

          {/* HR Audit Log Modal Button (Point 7) */}
          <button
            onClick={() => setShowAuditModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 text-xs font-medium border border-purple-700/50 transition-colors cursor-pointer"
            title="سجل تدقيق تعديلات الموارد البشرية (Audit Log)"
          >
            <History className="w-3.5 h-3.5 text-purple-400" />
            <span>سجل التدقيق ({auditLog.length})</span>
          </button>
        </div>
      </div>

      {/* Date Range Selection Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1 ml-1">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>نطاق العرض:</span>
          </span>

          <button
            onClick={() => { setDatePreset('all'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'all'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            كل السجلات (الأرشيف)
          </button>

          <button
            onClick={() => { setDatePreset('today'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'today'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            اليوم فقط
          </button>

          <button
            onClick={() => { setDatePreset('yesterday'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'yesterday'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            أمس
          </button>

          <button
            onClick={() => { setDatePreset('week'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'week'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            آخر 7 أيام
          </button>

          <button
            onClick={() => { setDatePreset('month'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'month'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            الشهر الحالي
          </button>

          <button
            onClick={() => { setDatePreset('custom'); setCurrentPage(1); }}
            className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
              datePreset === 'custom'
                ? 'bg-blue-600 text-white font-medium shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            فترة مخصصة
          </button>
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">من:</span>
            <input
              type="date"
              value={customFromDate}
              onChange={(e) => { setCustomFromDate(e.target.value); setCurrentPage(1); }}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs"
            />
            <span className="text-slate-400">إلى:</span>
            <input
              type="date"
              value={customToDate}
              onChange={(e) => { setCustomToDate(e.target.value); setCurrentPage(1); }}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Advanced Search & Filtering Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="بحث باسم العامل، الكود، أو القسم..."
            className="w-full bg-slate-950 border border-slate-800 rounded pr-8 pl-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {departments.length > 0 && (
          <select
            value={selectedDept}
            onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">كل الأقسام</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        <select
          value={selectedState}
          onChange={(e) => { setSelectedState(e.target.value); setCurrentPage(1); }}
          className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="all">كل الحركات</option>
          <option value="IN">حضور فقط</option>
          <option value="OUT">انصراف فقط</option>
          <option value="AMBIGUOUS">بصمات غامضة تحتاج قرار HR ({ambiguousCount})</option>
          <option value="MISSING_IN">بصمات حضور ناقصة ({missingInCount})</option>
          <option value="MISSED">بصمات ناقصة ({missedPunchesCount})</option>
          <option value="HR_OVERRIDE">معتمد ومعدل يدوياً (HR)</option>
        </select>

        {devices.length > 0 && (
          <select
            value={selectedDeviceId}
            onChange={(e) => { setSelectedDeviceId(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">كل الماكينات</option>
            {devices.map((d) => (
              <option key={d.id} value={String(d.id)}>{d.name} ({d.ip})</option>
            ))}
          </select>
        )}

        {/* Page Size */}
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
          className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value={50}>50 في الصفحة</option>
          <option value={100}>100 في الصفحة</option>
          <option value={250}>250 في الصفحة</option>
          <option value={500}>500 في الصفحة</option>
        </select>
      </div>

      {/* Main Records Table with High-Performance Rendering */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        {paginatedRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود العامل</th>
                  <th className="py-2.5 px-3 font-semibold">اسم العامل</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">التاريخ</th>
                  <th className="py-2.5 px-3 font-semibold">الوقت</th>
                  <th className="py-2.5 px-3 font-semibold text-center">نوع الحركة</th>
                  <th className="py-2.5 px-3 font-semibold text-center">طريقة البصمة</th>
                  <th className="py-2.5 px-3 font-semibold">الماكينة</th>
                  <th className="py-2.5 px-3 font-semibold">ملاحظات</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {paginatedRecords.map((record) => (
                  <tr 
                    key={record.id} 
                    className={`hover:bg-slate-850 transition-colors ${
                      record.isDuplicateIgnored 
                        ? 'bg-amber-950/20 opacity-75' 
                        : record.isAmbiguousSinglePunch
                          ? 'bg-amber-950/30 border-l-2 border-amber-500'
                          : record.isMissedPunch 
                            ? 'bg-rose-950/15' 
                            : ''
                    }`}
                  >
                    <td className="py-2 px-3 text-slate-300 font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 text-[11px]">
                        {record.workerCode}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-white font-sans font-medium">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span>{record.workerName}</span>
                          {record.isHROverride && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-sans font-normal" title="حركة معتمدة أو مضافة يدوياً بواسطة HR">
                              معتمد HR
                            </span>
                          )}
                        </div>
                        {record.missingInPunch ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-600 text-white font-sans font-bold flex items-center gap-1 border border-rose-700 animate-pulse">
                              <AlertCircle className="w-3 h-3" />
                              <span>بصمة حضور ناقصة (Missing IN)</span>
                            </span>
                            <button
                              onClick={() => {
                                setOverridingRecord(record);
                                setMissingInTime('08:00');
                                setMissingInEditor('مسؤول الموارد البشرية');
                                setOverrideReason('نسيان بصمة الصباح وتواجد بالعمل');
                              }}
                              className="px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-700 text-[10px] font-sans font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="إضافة بصمة حضور صباحية جديدة للعامل دون المساس ببصمة الانصراف"
                            >
                              <Plus className="w-3 h-3" />
                              <span>إضافة حضور صباحي (IN)</span>
                            </button>
                          </div>
                        ) : record.isAmbiguousSinglePunch ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-sans font-bold flex items-center gap-1 border border-amber-500/40">
                              <HelpCircle className="w-3 h-3 text-amber-400" />
                              <span>نافذة الغموض (12:00-15:59)</span>
                            </span>
                            {onUpdateRecord && (
                              <button
                                onClick={() => {
                                  setResolvingRecord(record);
                                  setResolutionChoice('temporary_pass');
                                  setExpectedReturnTime('14:30');
                                  setPassReason('تصريح شخصي معتمد');
                                }}
                                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-sans font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                                title="تحديد نوع البصمة: تصريح مؤقت أم انصراف نهائي؟"
                              >
                                <HelpCircle className="w-3 h-3" />
                                <span>تحديد نوع الحركة (HR)</span>
                              </button>
                            )}
                          </div>
                        ) : record.isReturnFromPass ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-sans font-bold border border-cyan-500/40 flex items-center gap-1 w-fit">
                            <CheckCheck className="w-2.5 h-2.5" />
                            <span>حضور بعد تصريح</span>
                          </span>
                        ) : record.ambiguousResolution === 'temporary_pass' ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-sans font-medium border border-amber-500/30 flex items-center gap-1 w-fit">
                            <span>تصريح مؤقت (خروج)</span>
                          </span>
                        ) : record.isMissedPunch ? (
                          <span className="text-[9px] text-rose-400 font-sans flex items-center gap-1" title={record.missedPunchReason}>
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span>{record.missedPunchReason || 'بصمة ناقصة'}</span>
                          </span>
                        ) : null}
                        {record.isDuplicateIgnored && (
                          <span className="text-[9px] text-amber-400/80 font-sans">
                            {record.duplicateReason || 'تكرار مستبعد (أقل من ساعة)'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">
                      {record.department}
                    </td>
                    <td className="py-2 px-3 text-slate-300 text-[11px]">
                      {record.displayDate}
                    </td>
                    <td className="py-2 px-3 text-slate-200 font-bold text-xs">
                      {record.displayTime}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {record.isAmbiguousSinglePunch ? (
                          <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded inline-block bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            بانتظار قرار HR
                          </span>
                        ) : (
                          <>
                            <span className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded inline-block ${
                              record.resolvedState === 'IN'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            }`}>
                              {record.resolvedState === 'IN' ? 'حضور' : 'انصراف'}
                            </span>
                            {record.isEarlyDeparture && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans" title={record.earlyDepartureReason}>
                                انصراف مبكر (-{record.earlyDepartureMinutes || 0} د)
                              </span>
                            )}
                            {record.isOvertime && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-sans font-bold" title={`إضافي: ${record.overtimeHours} ساعة`}>
                                +{record.overtimeHours} س إضافي
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {record.punchType === 'FACE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          <ScanFace className="w-3 h-3 text-purple-400 shrink-0" />
                          <span>بصمة وجه</span>
                        </span>
                      ) : record.punchType === 'CARD' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <CreditCard className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>كارت</span>
                        </span>
                      ) : record.punchType === 'MANUAL' || record.isManual ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          <Edit2 className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>يدوي (HR)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                          <Fingerprint className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>بصمة إصبع</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-300 font-sans text-[11px]">
                      {record.deviceName}
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">
                      {record.manualNote || '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleStartEdit(record)}
                          className="p-1 rounded bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-400 transition-colors cursor-pointer"
                          title="تعديل بصمة العامل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteRecord && (
                          <button
                            onClick={() => setDeleteConfirmId(record.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-600/30 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
                            title="حذف الحركة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-xs text-slate-400 space-y-2">
            <Info className="w-7 h-7 mx-auto text-slate-600 mb-1" />
            <p className="font-medium text-slate-300">لا توجد حركات مسجلة تطابق خيارات التصفية الحالية.</p>
            <p className="text-[11px] text-slate-500">
              جرّب اختيار "كل السجلات (الأرشيف)" أو إلغاء تفعيل "استبعاد التكرار" للاطلاع على كامل السجلات.
            </p>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredRecords.length > pageSize && (
          <div className="bg-slate-950 p-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-slate-400 font-mono text-[11px]">
              عرض السجلات من <span className="text-white font-bold">{((validPage - 1) * pageSize) + 1}</span> إلى{' '}
              <span className="text-white font-bold">{Math.min(validPage * pageSize, filteredRecords.length)}</span> من أصل{' '}
              <span className="text-blue-400 font-bold">{filteredRecords.length.toLocaleString('ar-EG')}</span>
            </div>

            <div className="flex items-center gap-1.5 font-mono">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage <= 1}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="font-sans text-xs">السابق</span>
              </button>

              <span className="text-slate-300 px-2 text-[11px]">
                صفحة <span className="text-white font-bold">{validPage}</span> من{' '}
                <span className="text-white font-bold">{totalPages}</span>
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage >= totalPages}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
              >
                <span className="font-sans text-xs">التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-5 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>إضافة حركة يدوية (تصحيح HR)</span>
              </h3>
              <button 
                onClick={() => setShowManualModal(false)} 
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">العامل:</label>
                <select
                  value={manualWorkerCode}
                  onChange={(e) => setManualWorkerCode(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white cursor-pointer"
                >
                  {workers.map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.code} - {w.name} ({w.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 block mb-1">نوع الحركة:</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white cursor-pointer"
                  >
                    <option value="IN">حضور</option>
                    <option value="OUT">انصراف</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">الوقت:</label>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">التاريخ:</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">سبب التسجيل اليدوي:</label>
                <input
                  type="text"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"
                  placeholder="مثلاً: عطل قارئ البصمة، نسيان البصمة، مأمورية عمل..."
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
                >
                  حفظ الحركة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Punch Modal (Point 5) */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  تعديل بصمة العامل #{editingRecord.workerCode} ({editingRecord.workerName})
                </h3>
              </div>
              <button 
                onClick={() => setEditingRecord(null)} 
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">كود العامل:</label>
                  <select
                    value={editWorkerCode}
                    onChange={(e) => setEditWorkerCode(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    {workers.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">نوع الحركة (حضور / انصراف):</label>
                  <select
                    value={editState}
                    onChange={(e) => setEditState(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    <option value="IN">حضور (Check-In)</option>
                    <option value="OUT">انصراف (Check-Out)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">التاريخ:</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">الوقت الدقيق (ساعة:دقيقة:ثانية):</label>
                  <input
                    type="time"
                    step="1"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">طريقة البصمة:</label>
                  <select
                    value={editPunchType}
                    onChange={(e) => setEditPunchType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    <option value="FINGERPRINT">بصمة يد (Fingerprint)</option>
                    <option value="FACE">بصمة وجه (Face)</option>
                    <option value="CARD">كارت (Card)</option>
                    <option value="MANUAL">يدوي / تصحيح إدارة (Manual)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">الماكينة المسجل عليها:</label>
                  <select
                    value={editDeviceId}
                    onChange={(e) => setEditDeviceId(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white cursor-pointer"
                  >
                    <option value={0}>تسجيل يدوي (بدون ماكينة)</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} (#{d.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editState === 'IN' && (
                <div>
                  <label className="text-slate-300 block mb-1">دقائق التأخير المرصودة (0 إذا كان في الموعد):</label>
                  <input
                    type="number"
                    min="0"
                    value={editLateMinutes}
                    onChange={(e) => setEditLateMinutes(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                  />
                </div>
              )}

              {editState === 'OUT' && (
                <div>
                  <label className="text-slate-300 block mb-1">ساعات العمل الإضافي المعتمدة (اختياري):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editOvertimeHours}
                    onChange={(e) => setEditOvertimeHours(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono"
                    placeholder="مثلاً: 1.5 أو 2"
                  />
                </div>
              )}

              <div>
                <label className="text-slate-300 block mb-1">ملاحظات وسبب التعديل:</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white"
                  placeholder="مثلاً: تصحيح خطأ بصمة خروج بدلاً من دخول، مأمورية عمل..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ التعديل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تأكيد حذف حركة البصمة</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من حذف هذه الحركة نهائياً من سجل الحركات؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleDeletePunch(deleteConfirmId)}
                className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Point 4: Ambiguous Window Resolution Modal */}
      {resolvingRecord && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <HelpCircle className="w-5 h-5" />
                <h3 className="text-sm font-bold text-white">
                  نافذة الغموض والتصاريح (12:00 - 15:59)
                </h3>
              </div>
              <button 
                onClick={() => setResolvingRecord(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Worker Details Card */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">العامل:</span>
                <span className="font-bold text-white font-sans">
                  {resolvingRecord.workerName} (كود #{resolvingRecord.workerCode})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">وقت وتاريخ البصمة:</span>
                <span className="font-mono text-amber-300 font-bold">
                  {resolvingRecord.displayDate} @ {resolvingRecord.displayTime}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">القسم:</span>
                <span className="text-slate-300 font-sans">{resolvingRecord.department}</span>
              </div>
            </div>

            {/* Question Prompt */}
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200">
              <p className="font-bold mb-1">سؤال الموارد البشرية (HR Decision):</p>
              <p>البصمة دي تصريح مؤقت (بعودة) ولا انصراف نهائي؟</p>
            </div>

            {/* Selection Options */}
            <div className="space-y-2.5 text-xs">
              <label 
                onClick={() => setResolutionChoice('temporary_pass')}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  resolutionChoice === 'temporary_pass' 
                    ? 'bg-amber-950/40 border-amber-500 text-white' 
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="ambiguous_choice"
                  checked={resolutionChoice === 'temporary_pass'}
                  onChange={() => setResolutionChoice('temporary_pass')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div className="space-y-1">
                  <span className="font-bold text-sm block text-amber-300">1. تصريح خروج مؤقت (بعودة)</span>
                  <span className="text-[11px] text-slate-400 block">
                    تسجيل خروج مؤقت وإصدار تصريح، واستثناء بصمة العودة من قاعدة التكرار لتسجيلها كـ "حضور بعد تصريح".
                  </span>
                </div>
              </label>

              {resolutionChoice === 'temporary_pass' && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5 text-xs mr-4">
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">وقت العودة المتوقع:</label>
                    <input
                      type="time"
                      value={expectedReturnTime}
                      onChange={(e) => setExpectedReturnTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1 font-medium">سبب أو مبرر التصريح:</label>
                    <input
                      type="text"
                      value={passReason}
                      onChange={(e) => setPassReason(e.target.value)}
                      placeholder="مثلاً: مهمة عمل رسمية، عيادة التأمين، إذن شخصي..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      required
                    />
                  </div>
                </div>
              )}

              <label 
                onClick={() => setResolutionChoice('final_out')}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  resolutionChoice === 'final_out' 
                    ? 'bg-blue-950/40 border-blue-500 text-white' 
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="ambiguous_choice"
                  checked={resolutionChoice === 'final_out'}
                  onChange={() => setResolutionChoice('final_out')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="space-y-1">
                  <span className="font-bold text-sm block text-blue-300">2. انصراف نهائي</span>
                  <span className="text-[11px] text-slate-400 block">
                    تسجيل انصراف نهائي للعامل وإغلاق اليوم بدون انتظار عودة، واحتساب الانصراف المبكر إن وُجد.
                  </span>
                </div>
              </label>

              {/* Bug 2 Fix: Option 3 (Late IN) */}
              <label 
                onClick={() => setResolutionChoice('late_in')}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  resolutionChoice === 'late_in' 
                    ? 'bg-emerald-950/40 border-emerald-500 text-white' 
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="ambiguous_choice"
                  checked={resolutionChoice === 'late_in'}
                  onChange={() => setResolutionChoice('late_in')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="space-y-1">
                  <span className="font-bold text-sm block text-emerald-300">3. اعتماد كحضور متأخر (Late IN)</span>
                  <span className="text-[11px] text-slate-400 block">
                    اعتماد البصمة كـ حضور (IN)، ويحسب النظام التأخير آلياً من موعد بداية الوردية ({settings?.standardShiftStart || '08:00'} صباحاً) حتى وقت البصمة ({resolvingRecord.displayTime}).
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setResolvingRecord(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmAmbiguousResolution}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer transition-colors"
              >
                تأكيد واعتماد القرار وتوثيق التدقيق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Point 5 & Bug 1 Fix: Missing IN Manual Addition Modal */}
      {overridingRecord && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Plus className="w-5 h-5" />
                <h3 className="text-sm font-bold text-white">
                  إضافة بصمة حضور صباحي مفقودة (Missing IN)
                </h3>
              </div>
              <button 
                onClick={() => setOverridingRecord(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-emerald-300">
                <CheckCheck className="w-4 h-4" />
                <span>حماية بيانات الماكينة الأصلية:</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                لن يتم تغيير بصمة الانصراف الأصلية المسجلة من الماكينة (<span className="font-mono font-bold text-white">{overridingRecord.displayTime}</span>). سيقوم النظام بإضافة بصمة حضور صباحية جديدة ومستقلة لهذا اليوم لتوثيق حضور العامل مع الحفاظ الكامل على دقة السجلات.
              </p>
            </div>

            {/* Worker Info */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">العامل:</span>
                <span className="font-bold text-white">{overridingRecord.workerName} (#{overridingRecord.workerCode})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">بصمة الانصراف الأصلية:</span>
                <span className="font-mono text-blue-300 font-bold">{overridingRecord.displayDate} @ {overridingRecord.displayTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">القسم:</span>
                <span className="text-slate-300">{overridingRecord.department}</span>
              </div>
            </div>

            {/* Input for missing morning check-in time */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 block font-medium">وقت بصمة الحضور الصباحية:</label>
                <input
                  type="time"
                  value={missingInTime}
                  onChange={(e) => setMissingInTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 block font-medium">المسؤول المنفذ:</label>
                <input
                  type="text"
                  value={missingInEditor}
                  onChange={(e) => setMissingInEditor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Override Reason Input */}
            <div className="text-xs space-y-1">
              <label className="text-slate-300 block font-medium">سبب ومبرر إضافة الحضور (يوثق بسجل التدقيق):</label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="مثلاً: نسيان البصمة الصباحية وتواجده بالعمل، عطل بالماكينة..."
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setOverridingRecord(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmOverrideToIn}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer transition-colors"
              >
                إضافة بصمة الحضور الصباحية وتوثيق التدقيق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Point 7: HR Audit Log Modal (سجل تدقيق التعديلات) */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>سجل تدقيق تعديلات الموارد البشرية (HR Audit Log)</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 text-xs font-mono border border-purple-700/50">
                      {auditLog.length} تعديل موثق
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    توثيق كامل لكافة التعديلات اليدوية، تغيير نوع الحركات، واعتمادات نافذة الغموض
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-white text-base cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Audit Toolbar */}
            <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  placeholder="بحث في سجل التدقيق باسم العامل أو الكود أو نوع الإجراء..."
                  className="w-full bg-slate-900 border border-slate-800 rounded pr-8 pl-3 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500"
                />
              </div>

              {auditLog.length > 0 && (
                <button
                  onClick={() => {
                    const exportData = auditLog.map((item, idx) => ({
                      'م': idx + 1,
                      'التاريخ والوقت': `${item.displayDate} ${item.displayTime}`,
                      'المنفذ': item.modifiedBy,
                      'كود العامل': item.workerCode,
                      'اسم العامل': item.workerName,
                      'نوع الإجراء': item.actionType === 'RESOLVE_AMBIGUOUS_PASS'
                        ? 'اعتماد تصريح مؤقت'
                        : item.actionType === 'RESOLVE_AMBIGUOUS_OUT'
                        ? 'اعتماد انصراف نهائي'
                        : item.actionType === 'RESOLVE_AMBIGUOUS_LATE_IN'
                        ? 'اعتماد حضور متأخر'
                        : (item.actionType === 'RESOLVE_MISSING_IN' || item.actionType === 'OVERRIDE_OUT_TO_IN')
                        ? 'إضافة حضور صباحي مفقود'
                        : item.actionType === 'MANUAL_EDIT'
                        ? 'تعديل يدوي'
                        : item.actionType === 'ADD_MANUAL_PUNCH'
                        ? 'إضافة حركة يدوية'
                        : 'حذف بصمة',
                      'القيمة السابقة': item.oldValue,
                      'القيمة الجديدة': item.newValue,
                      'سبب ومبرر التعديل': item.reason,
                    }));
                    exportToExcel(exportData, 'سجل_التدقيق_HR', `سجل_تدقيق_تعديلات_HR_${new Date().toISOString().slice(0, 10)}`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تصدير سجل التدقيق إلى Excel</span>
                </button>
              )}
            </div>

            {/* Audit Log Table */}
            <div className="flex-1 overflow-y-auto p-3">
              {auditLog.length > 0 ? (
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                        <th className="py-2.5 px-3 font-semibold text-center w-10">م</th>
                        <th className="py-2.5 px-3 font-semibold">تاريخ ووقت الإجراء</th>
                        <th className="py-2.5 px-3 font-semibold">المسؤول (المنفذ)</th>
                        <th className="py-2.5 px-3 font-semibold">العامل</th>
                        <th className="py-2.5 px-3 font-semibold text-center">نوع الإجراء</th>
                        <th className="py-2.5 px-3 font-semibold">القيمة السابقة</th>
                        <th className="py-2.5 px-3 font-semibold">القيمة الجديدة</th>
                        <th className="py-2.5 px-3 font-semibold">السبب والمبرر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {auditLog
                        .filter((item) => {
                          if (!auditSearchQuery.trim()) return true;
                          const q = auditSearchQuery.toLowerCase();
                          return (
                            item.workerName.toLowerCase().includes(q) ||
                            String(item.workerCode).includes(q) ||
                            item.reason.toLowerCase().includes(q) ||
                            item.actionType.toLowerCase().includes(q)
                          );
                        })
                        .map((entry, idx) => (
                          <tr key={entry.id} className="hover:bg-slate-850/60 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 text-slate-300 font-mono text-[11px]">
                              {entry.displayDate} {entry.displayTime}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-200">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                                {entry.modifiedBy}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-bold text-white block">{entry.workerName}</span>
                              <span className="text-[10px] text-blue-400 font-mono">#{entry.workerCode}</span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              {entry.actionType === 'RESOLVE_AMBIGUOUS_PASS' ? (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                  تصريح مؤقت
                                </span>
                              ) : entry.actionType === 'RESOLVE_AMBIGUOUS_OUT' ? (
                                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold">
                                  انصراف نهائي
                                </span>
                              ) : entry.actionType === 'RESOLVE_AMBIGUOUS_LATE_IN' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  حضور متأخر
                                </span>
                              ) : (entry.actionType === 'RESOLVE_MISSING_IN' || entry.actionType === 'OVERRIDE_OUT_TO_IN') ? (
                                <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                                  إضافة حضور صباحي مفقود
                                </span>
                              ) : entry.actionType === 'ADD_MANUAL_PUNCH' ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                  إضافة يدوية
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                                  تعديل حركة
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-400 text-[11px]">
                              {entry.oldValue}
                            </td>
                            <td className="py-2 px-3 font-medium text-emerald-300 text-[11px]">
                              {entry.newValue}
                            </td>
                            <td className="py-2 px-3 text-slate-300 text-[11px]">
                              {entry.reason}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center text-xs text-slate-400 space-y-1">
                  <ShieldCheck className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                  <p className="font-bold text-slate-300">لا توجد تعديلات يدوية مسجلة في سجل التدقيق حتى الآن.</p>
                  <p className="text-[11px] text-slate-500">
                    أي تعديل يقوم به مسؤول HR على البصمات الغامضة أو تصحيح الحركات سيظهر هنا تلقائياً بتوثيق كامل.
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
