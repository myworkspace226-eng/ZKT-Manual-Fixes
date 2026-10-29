import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  UserCheck, 
  UserX, 
  RefreshCcw, 
  Fingerprint, 
  Search, 
  ArrowRightLeft,
  FileSpreadsheet,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  X,
  Radio,
  Tag,
  Upload,
  Edit3,
  Save,
  Sparkles,
  Clock,
  Check,
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Worker, Device } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';
import { 
  uploadUserToDevice, 
  pullDeviceUsers, 
  isDesktopApp 
} from '../services/deviceConnection';

// Helper to find the first unused worker code (Gap Filling)
export function getFirstUnusedWorkerCode(workersList: Worker[]): number {
  const existingCodes = new Set(
    workersList
      .map((w) => w.code)
      .filter((c) => typeof c === 'number' && !isNaN(c) && c > 0)
  );
  if (existingCodes.size === 0) return 1;
  let code = 1;
  while (existingCodes.has(code)) {
    code++;
  }
  return code;
}

// Helper to normalize Arabic names for duplicate detection
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/عبد\s+/g, 'عبد')
    .replace(/[\s\-_.]+/g, ' ')
    .trim();
}

interface WorkersManagerProps {
  workers: Worker[];
  devices: Device[];
  onUpdateWorker: (worker: Worker) => void;
  onAddWorker: (worker: Worker) => void;
  onDeleteWorker?: (workerCode: number) => void;
  onMergeWorkers?: (primaryCode: number, aliasCode: number) => void;
}

export const WorkersManager: React.FC<WorkersManagerProps> = ({
  workers,
  devices,
  onUpdateWorker,
  onAddWorker,
  onDeleteWorker,
  onMergeWorkers,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'frozen' | 'pendingSync'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [notification, setNotification] = useState<string | null>(null);

  // Modals
  const [deactivatingWorker, setDeactivatingWorker] = useState<Worker | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [reactivatingWorker, setReactivatingWorker] = useState<Worker | null>(null);
  const [targetDeviceIds, setTargetDeviceIds] = useState<number[]>([101, 102, 103, 104, 105, 106]);
  const [transferringWorker, setTransferringWorker] = useState<Worker | null>(null);
  const [newDepartment, setNewDepartment] = useState<string>('تعبئة وتغليف');
  const [newLine, setNewLine] = useState<string>('');

  // Duplicate Resolver Modal State (Smart Worker Merge)
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
  const [selectedPrimaryMap, setSelectedPrimaryMap] = useState<Record<string, number>>({});
  const [manualPrimaryCode, setManualPrimaryCode] = useState<number | ''>('');
  const [manualAliasCode, setManualAliasCode] = useState<number | ''>('');

  // Edit Worker Modal State (Point 6)
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [editWorkerName, setEditWorkerName] = useState<string>('');
  const [editWorkerCode, setEditWorkerCode] = useState<number>(0);
  const [editWorkerDept, setEditWorkerDept] = useState<string>('');
  const [editWorkerLine, setEditWorkerLine] = useState<string>('');
  const [editWorkerJob, setEditWorkerJob] = useState<string>('');
  const [editWorkerNat, setEditWorkerNat] = useState<'مصري' | 'بنغلاديشي' | 'أخرى'>('مصري');
  const [editWorkerShift, setEditWorkerShift] = useState<'standard' | 'bangladeshi' | 'custom'>('standard');
  const [editWorkerGrace, setEditWorkerGrace] = useState<number>(0);
  const [editWorkerPhone, setEditWorkerPhone] = useState<string>('');
  const [editWorkerAssignedDevices, setEditWorkerAssignedDevices] = useState<number[]>([]);
  const [uploadToDeviceAfterSave, setUploadToDeviceAfterSave] = useState<boolean>(true);

  // Add Worker Modal
  const [showAddWorkerModal, setShowAddWorkerModal] = useState<boolean>(false);
  const [newWorkerCode, setNewWorkerCode] = useState<number | ''>(() => {
    return getFirstUnusedWorkerCode(workers);
  });
  const [newWorkerName, setNewWorkerName] = useState<string>('');
  const [newWorkerDept, setNewWorkerDept] = useState<string>('إنتاج رجال');
  const [newWorkerLine, setNewWorkerLine] = useState<string>('');
  const [newWorkerJob, setNewWorkerJob] = useState<string>('فني خياطة');
  const [newWorkerNat, setNewWorkerNat] = useState<'مصري' | 'بنغلاديشي'>('مصري');
  const [newWorkerShift, setNewWorkerShift] = useState<'standard' | 'bangladeshi'>('standard');
  const [newWorkerGrace, setNewWorkerGrace] = useState<number>(0);
  const [newWorkerPhone, setNewWorkerPhone] = useState<string>('');

  // Biometric Sync Modal (Download / Upload Users & FP Templates)
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [syncAction, setSyncAction] = useState<'download' | 'upload'>('download');
  const [syncTargetDeviceId, setSyncTargetDeviceId] = useState<number | 'all'>('all');
  const [isSyncingProcess, setIsSyncingProcess] = useState<boolean>(false);
  const [customEnrolledCode, setCustomEnrolledCode] = useState<string>('');

  // Smart Duplicate Worker Detection (Groups workers with identical normalized names but different codes)
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Worker[]>();
    for (const w of workers) {
      if (!w.name) continue;
      const cleanName = w.name.trim();
      if (cleanName.startsWith('عامل #') || cleanName.startsWith('عامل كود') || cleanName.startsWith('موظف #')) {
        continue;
      }
      const norm = normalizeArabicText(cleanName);
      if (norm.length < 3) continue;

      const group = map.get(norm) || [];
      group.push(w);
      map.set(norm, group);
    }

    const duplicates: { normalizedKey: string; sampleName: string; workers: Worker[] }[] = [];
    map.forEach((wList, key) => {
      const distinctCodes = new Set(wList.map((w) => w.code));
      if (distinctCodes.size > 1) {
        duplicates.push({
          normalizedKey: key,
          sampleName: wList[0].name,
          workers: wList,
        });
      }
    });

    return duplicates;
  }, [workers]);

  const isAdministrativeDept = useMemo(() => {
    const adminDepts = ['إدارة', 'الإدارة', 'حسابات', 'مشتريات', 'أمن', 'صيانة', 'مخازن', 'نظافة', 'بوفيه'];
    return adminDepts.some(d => newWorkerDept.includes(d));
  }, [newWorkerDept]);

  const departments = useMemo(() => {
    return Array.from(new Set(workers.map((w) => w.department)));
  }, [workers]);

  const pendingSyncWorkers = useMemo(() => {
    return workers.filter((w) => w.isActive && !w.isNameSyncedToDevice);
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (filterTab === 'active' && !w.isActive) return false;
      if (filterTab === 'frozen' && w.isActive) return false;
      if (filterTab === 'pendingSync' && (w.isNameSyncedToDevice || !w.isActive)) return false;
      if (selectedDept !== 'all' && w.department !== selectedDept) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = w.name.toLowerCase().includes(q);
        const matchesCode = w.code.toString().includes(q);
        const matchesLine = w.line ? w.line.toLowerCase().includes(q) : false;
        const matchesDept = w.department.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesLine && !matchesDept) return false;
      }

      return true;
    });
  }, [workers, filterTab, selectedDept, searchQuery]);

  const handleConfirmDeactivate = () => {
    if (!deactivatingWorker) return;
    onUpdateWorker({
      ...deactivatingWorker,
      isActive: false,
      deactivationDate: new Date().toISOString().slice(0, 10),
    });
    setDeactivatingWorker(null);
  };

  const handleConfirmReactivate = () => {
    if (!reactivatingWorker) return;
    onUpdateWorker({
      ...reactivatingWorker,
      isActive: true,
      assignedDeviceIds: targetDeviceIds,
      deactivationDate: undefined,
    });
    setReactivatingWorker(null);
  };

  const handleConfirmTransfer = () => {
    if (!transferringWorker) return;
    onUpdateWorker({
      ...transferringWorker,
      department: newDepartment,
      line: newLine.trim() || '-',
    });
    setTransferringWorker(null);
  };

  // Open Full Worker Edit Modal (Point 6)
  const handleOpenEditWorker = (w: Worker) => {
    setEditingWorker(w);
    setEditWorkerName(w.name);
    setEditWorkerCode(w.code);
    setEditWorkerDept(w.department);
    setEditWorkerLine(w.line === '-' ? '' : w.line);
    setEditWorkerJob(w.jobTitle);
    setEditWorkerNat(w.nationality || 'مصري');
    setEditWorkerShift(w.shiftId || 'standard');
    setEditWorkerGrace(w.customGraceMinutes || 0);
    setEditWorkerPhone(w.phone || '');
    setEditWorkerAssignedDevices(w.assignedDeviceIds || []);
    setUploadToDeviceAfterSave(true);
  };

  const handleSaveWorkerEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorker || !editWorkerName.trim()) return;

    const isEnglishName = /^[A-Za-z\s.'-]+$/.test(editWorkerName.trim()) && editWorkerName.trim().length > 2;
    const finalNat = editWorkerNat === 'مصري' && isEnglishName ? 'بنغلاديشي' : editWorkerNat;
    const finalShift = editWorkerShift === 'standard' && isEnglishName ? 'bangladeshi' : editWorkerShift;
    const primaryDevice = devices.find(d => editWorkerAssignedDevices.includes(d.id));

    const updated: Worker = {
      ...editingWorker,
      name: editWorkerName.trim(),
      code: editWorkerCode,
      department: editWorkerDept.trim(),
      line: editWorkerLine.trim() || '-',
      jobTitle: editWorkerJob.trim(),
      nationality: finalNat,
      shiftId: finalShift,
      customGraceMinutes: editWorkerGrace,
      phone: editWorkerPhone.trim(),
      assignedDeviceIds: editWorkerAssignedDevices,
      enrolledOnDeviceName: primaryDevice ? primaryDevice.name : editingWorker.enrolledOnDeviceName,
      isNameSyncedToDevice: uploadToDeviceAfterSave ? true : editingWorker.isNameSyncedToDevice,
    };

    onUpdateWorker(updated);

    if (uploadToDeviceAfterSave && editWorkerAssignedDevices.length > 0) {
      handleQuickUploadWorkerName(updated);
    } else {
      setNotification(`✅ تم حفظ وتحديث بيانات العامل (${updated.name}) بنجاح.`);
      setTimeout(() => setNotification(null), 5000);
    }

    setEditingWorker(null);
  };

  // Auto-Fix Bangladeshi Shifts (Point 7)
  const handleAutoFixBangladeshiShifts = () => {
    let fixCount = 0;
    workers.forEach((w) => {
      const isEnglish = /^[A-Za-z\s.'-]+$/.test(w.name) && w.name.length > 2;
      const isBangladeshi = w.nationality === 'بنغلاديشي' || isEnglish;
      
      if (isBangladeshi && (w.shiftId !== 'bangladeshi' || w.nationality !== 'بنغلاديشي')) {
        onUpdateWorker({
          ...w,
          nationality: 'بنغلاديشي',
          shiftId: 'bangladeshi',
        });
        fixCount++;
      }
    });

    if (fixCount > 0) {
      setNotification(`✅ تم فحص السجلات وتصحيح ورديات (${fixCount}) عامل بنغالي إلى وردية بنغال (8:00 - 18:30) بنجاح.`);
    } else {
      setNotification(`ℹ️ جميع العمال البنغال مضبوطون بالفعل على وردية بنغال (8:00 - 18:30).`);
    }
    setTimeout(() => setNotification(null), 6000);
  };

  // Quick 1-click single worker upload to machines via real hardware IPC
  const handleQuickUploadWorkerName = async (worker: Worker) => {
    if (!isDesktopApp()) {
      setNotification(`❌ رفع وتثبيت الاسم على الماكينة يتطلب تشغيل البرنامج داخل تطبيق الديسكتوب (Electron) على شبكة المصنع.`);
      setTimeout(() => setNotification(null), 6000);
      return;
    }

    const targetDevices = devices.length > 0 ? devices : [];
    if (targetDevices.length === 0) {
      setNotification(`❌ لا توجد ماكينات مسجلة في النظام للرفع إليها.`);
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    setNotification(`جاري الاتصال بماكينات البصمة ورفع اسم (${worker.name} - كود #${worker.code})...`);

    let successCount = 0;
    let lastError = '';

    for (const d of targetDevices) {
      try {
        const res = await uploadUserToDevice(d.ip, d.port, {
          code: worker.code,
          name: worker.name,
          id: worker.id,
        });
        if (res.success) {
          successCount++;
        } else {
          lastError = res.error || res.message;
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    if (successCount > 0) {
      onUpdateWorker({
        ...worker,
        isNameSyncedToDevice: true,
        assignedDeviceIds: devices.map((d) => d.id),
      });
      setNotification(`✅ تم بنجاح رفع وتثبيت اسم (${worker.name}) على الماكينات! سيظهر اسمه الآن فوراً عند البصم على الماكينة.`);
    } else {
      setNotification(`❌ فشل رفع الاسم إلى الماكينة: ${lastError || 'الماكينة غير متصلة أو كابل الشبكة مفصول'}.`);
    }
    setTimeout(() => setNotification(null), 6000);
  };

  const handleCreateWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;

    // Point 5: Gap Filling Code Resolution
    const resolvedCode = (typeof newWorkerCode === 'number' && newWorkerCode > 0)
      ? newWorkerCode
      : getFirstUnusedWorkerCode(workers);

    if (workers.some(w => w.code === resolvedCode)) {
      setNotification(`❌ الكود #${resolvedCode} مستخدم بالفعل لموظف آخر. يرجى اختيار كود غير مستخدم.`);
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    // Point 7: Detect English name for Bengali workers automatically
    const isEnglishName = /^[A-Za-z\s.'-]+$/.test(newWorkerName.trim()) && newWorkerName.trim().length > 2;
    const finalNat = newWorkerNat === 'مصري' && isEnglishName ? 'بنغلاديشي' : newWorkerNat;
    const finalShift = newWorkerShift === 'standard' && isEnglishName ? 'bangladeshi' : newWorkerShift;

    const newWorker: Worker = {
      id: `w-${resolvedCode}`,
      code: resolvedCode,
      name: newWorkerName.trim(),
      department: newWorkerDept.trim(),
      line: newWorkerLine.trim() || '-',
      jobTitle: newWorkerJob.trim(),
      nationality: finalNat,
      shiftId: finalShift,
      customGraceMinutes: newWorkerGrace,
      isActive: true,
      hasFingerprint: true,
      hasFace: false,
      assignedDeviceIds: devices.map(d => d.id),
      phone: newWorkerPhone.trim(),
      joinDate: new Date().toISOString().slice(0, 10),
      isNameSyncedToDevice: false, // Starts as pending until pushed to machine
    };

    onAddWorker(newWorker);

    setShowAddWorkerModal(false);
    const nextCode = getFirstUnusedWorkerCode([...workers, newWorker]);
    setNewWorkerCode(nextCode);
    setNewWorkerName('');
    setNewWorkerLine('');
    setNewWorkerPhone('');
    setNotification(`تم حفظ بيانات (${newWorker.name}) بكود #${newWorker.code}. اضغط على "رفع الاسم للماكينة" لربطه بالماكينة فوراً.`);
    setTimeout(() => setNotification(null), 6000);
  };

  const handleStartNamingCode = (code: number) => {
    setNewWorkerCode(code);
    setNewWorkerName('');
    setNewWorkerLine('');
    setShowSyncModal(false);
    setShowAddWorkerModal(true);
  };

  // Execute Batch Sync (Upload or Download) using real hardware IPC
  const handleExecuteBiometricSync = async () => {
    const targetDevices = syncTargetDeviceId === 'all'
      ? devices
      : devices.filter((d) => d.id === syncTargetDeviceId);

    if (targetDevices.length === 0) {
      setNotification('❌ لا توجد ماكينات معرفة في النظام لتنفيذ المزامنة.');
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    if (!isDesktopApp()) {
      setNotification('❌ مزامنة ورفع بيانات العمال مع ماكينات البصمة تتطلب تشغيل البرنامج داخل بيئة الديسكتوب (Electron) على شبكة المصنع.');
      setTimeout(() => setNotification(null), 7000);
      return;
    }

    setIsSyncingProcess(true);

    if (syncAction === 'upload') {
      const activeWorkersToSync = workers.filter(w => w.isActive);
      if (activeWorkersToSync.length === 0) {
        setIsSyncingProcess(false);
        setNotification('لا يوجد عمال نشطين في النظام لرفعهم للماكينة.');
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      let totalSuccess = 0;
      let totalFailed = 0;
      let lastErrorMessage = '';

      for (const dev of targetDevices) {
        for (const w of activeWorkersToSync) {
          try {
            const res = await uploadUserToDevice(dev.ip, dev.port, {
              code: w.code,
              name: w.name,
              id: w.id,
            });

            if (res.success) {
              totalSuccess++;
              onUpdateWorker({
                ...w,
                isNameSyncedToDevice: true,
                assignedDeviceIds: Array.from(new Set([...w.assignedDeviceIds, dev.id])),
              });
            } else {
              totalFailed++;
              lastErrorMessage = res.error || res.message;
            }
          } catch (err: any) {
            totalFailed++;
            lastErrorMessage = err?.message || String(err);
          }
        }
      }

      setIsSyncingProcess(false);
      setShowSyncModal(false);

      if (totalSuccess > 0) {
        const targetName = syncTargetDeviceId === 'all' 
          ? `جميع ماكينات المصنع (${targetDevices.length} ماكينات)` 
          : targetDevices[0]?.name || `ماكينة #${syncTargetDeviceId}`;

        setNotification(`✅ تم بنجاح رفع وتثبيت بيانات (${totalSuccess}) عملية على (${targetName})! عند بصم العامل سيظهر اسمه فوراً على شاشة الجهاز.`);
      } else {
        setNotification(`❌ فشل رفع الأسماء إلى الماكينة: ${lastErrorMessage || 'الماكينة غير متصلة أو كابل الشبكة مفصول'}.`);
      }
      setTimeout(() => setNotification(null), 7000);
    } else {
      // Download Mode: Pull users registered on device
      let totalPulled = 0;
      let lastError = '';

      for (const dev of targetDevices) {
        try {
          const res = await pullDeviceUsers(dev.ip, dev.port);
          if (res.success && res.users) {
            totalPulled += res.users.length;
            res.users.forEach((u: any) => {
              const uCode = Number(u.userId) || Number(u.uid);
              if (uCode && !workers.some(w => w.code === uCode)) {
                const isEng = /^[A-Za-z\s.'-]+$/.test(u.name) && u.name.length > 2;
                onAddWorker({
                  id: `w-${uCode}-${Date.now()}`,
                  code: uCode,
                  name: u.name || `عامل #${uCode}`,
                  department: 'إنتاج',
                  line: '-',
                  jobTitle: 'عامل تشغيل',
                  nationality: isEng ? 'بنغلاديشي' : 'مصري',
                  shiftId: isEng ? 'bangladeshi' : 'standard',
                  customGraceMinutes: 0,
                  isActive: true,
                  hasFingerprint: true,
                  hasFace: false,
                  assignedDeviceIds: [dev.id],
                  joinDate: new Date().toISOString().slice(0, 10),
                  isNameSyncedToDevice: true,
                });
              }
            });
          } else {
            lastError = res.error || res.message;
          }
        } catch (err: any) {
          lastError = err?.message || String(err);
        }
      }

      setIsSyncingProcess(false);
      setShowSyncModal(false);

      if (totalPulled > 0) {
        setNotification(`✅ تم بنجاح فحص وسحب (${totalPulled}) كود ومستخدم مسجلين على ذاكرة الماكينات.`);
      } else {
        setNotification(`❌ لم يتم سحب أي بيانات من الماكينة: ${lastError || 'الماكينة غير متصلة'}.`);
      }
      setTimeout(() => setNotification(null), 7000);
    }
  };

  const handleExportWorkers = () => {
    if (filteredWorkers.length === 0) return;
    const data = filteredWorkers.map((w) => ({
      'الكود': w.code,
      'الاسم': w.name,
      'القسم': w.department,
      'خط الإنتاج': w.line || '-',
      'الوظيفة': w.jobTitle,
      'الجنسية': w.nationality,
      'الوردية': w.shiftId === 'bangladeshi' ? 'بنغلاديشي' : 'مصري',
      'سماحية مخصصة': w.customGraceMinutes ? `${w.customGraceMinutes} دقيقة` : 'افتراضي',
      'حالة الاسم على الماكينة': w.isNameSyncedToDevice ? 'مربوط على الماكينة' : 'في انتظار الرفع',
      'الحالة': w.isActive ? 'نشط' : 'مجمد',
    }));
    exportToExcel(data, 'العاملين', `سجل_الموظفين_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleImportExcelWorkers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          setNotification('الملف فارغ أو بتنسيق غير متوافق.');
          return;
        }

        let updatedCount = 0;
        let addedCount = 0;

        data.forEach((row, idx) => {
          const rawCode = row['كود'] ?? row['الكود'] ?? row['كود العامل'] ?? row['code'] ?? row['Code'] ?? row['ID'] ?? row['id'];
          const codeNum = Number(rawCode);
          if (!codeNum || isNaN(codeNum)) return;

          const rawName = row['اسم'] ?? row['الاسم'] ?? row['اسم العامل'] ?? row['الموظف'] ?? row['name'] ?? row['Name'];
          const nameStr = rawName ? String(rawName).trim() : `عامل #${codeNum}`;

          const rawDept = row['القسم'] ?? row['department'] ?? row['Dept'] ?? 'إنتاج';
          const deptStr = rawDept ? String(rawDept).trim() : 'إنتاج';

          const existing = workers.find((w) => w.code === codeNum);
          if (existing) {
            onUpdateWorker({
              ...existing,
              name: nameStr,
              department: deptStr || existing.department,
              isNameSyncedToDevice: false,
            });
            updatedCount++;
          } else {
            const newW: Worker = {
              id: `w-imp-${codeNum}-${idx}`,
              code: codeNum,
              name: nameStr,
              department: deptStr,
              line: row['الخط'] ? String(row['الخط']) : 'خط 1',
              jobTitle: row['الوظيفة'] ? String(row['الوظيفة']) : 'عامل تشغيل',
              nationality: 'مصري',
              shiftId: 'standard',
              customGraceMinutes: 15,
              isActive: true,
              assignedDeviceIds: devices.map((d) => d.id),
              hasFingerprint: true,
              hasFace: false,
              joinDate: new Date().toISOString().slice(0, 10),
              isNameSyncedToDevice: false,
            };
            onAddWorker(newW);
            addedCount++;
          }
        });

        setNotification(`✅ تم بنجاح استيراد وتحديث (${updatedCount + addedCount}) عامل بأسمائهم العربية!`);
        setTimeout(() => setNotification(null), 6000);
      } catch (err: any) {
        setNotification(`❌ حدث خطأ أثناء قراءة ملف الإكسيل: ${err?.message || String(err)}`);
        setTimeout(() => setNotification(null), 6000);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3.5">
      {/* Toast Notification (Floating bottom-right: Zero Layout Shift) */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-emerald-950/95 border border-emerald-700/80 text-emerald-200 p-3 rounded-xl text-xs flex items-center justify-between shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 pointer-events-auto">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium leading-relaxed">{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-emerald-400 hover:text-white cursor-pointer mr-2 p-1">✕</button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>شؤون العاملين والموظفين</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              ({filteredWorkers.length})
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Import Workers from Excel */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>استيراد أسماء من Excel</span>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={handleImportExcelWorkers}
            />
          </label>

          {/* Biometric Sync / Download / Upload */}
          <button
            onClick={() => {
              setSyncAction('download');
              setShowSyncModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-medium border border-blue-500/30 transition-colors cursor-pointer"
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            <span>سحب بيانات من الماكينة</span>
          </button>

          <button
            onClick={() => {
              setSyncAction('upload');
              setShowSyncModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-500/30 transition-colors cursor-pointer relative"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>رفع وتثبيت الأسماء للماكينات</span>
            {pendingSyncWorkers.length > 0 && (
              <span className="bg-amber-500 text-slate-950 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {pendingSyncWorkers.length}
              </span>
            )}
          </button>

          {/* Point 7: Auto-Fix Bangladeshi Shifts */}
          <button
            onClick={handleAutoFixBangladeshiShifts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium border border-amber-500/30 transition-colors cursor-pointer"
            title="فحص العمال وضبط وردية بنغال (8:00 - 18:30) تلقائياً لأصحاب الأسماء الإنجليزية والجنسية البنغالية"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>ضبط ورديات البنغال تلقائياً</span>
          </button>

          {/* Smart Duplicate Names & Code Merger Button (Point 3) */}
          <button
            onClick={() => setShowDuplicateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium border border-indigo-500/30 transition-colors cursor-pointer relative"
            title="فحص تشابه الأسماء وتوحيد الأكواد البديلة"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span>فحص الأسماء المكررة ودمج الأكواد</span>
            {duplicateGroups.length > 0 && (
              <span className="bg-amber-500 text-slate-950 font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {duplicateGroups.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowAddWorkerModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>إضافة موظف / عامل جديد</span>
          </button>

          {filteredWorkers.length > 0 && (
            <button
              onClick={handleExportWorkers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 rounded-lg p-2.5">
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              filterTab === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            الكل ({workers.length})
          </button>
          <button
            onClick={() => setFilterTab('active')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              filterTab === 'active' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            نشط ({workers.filter((w) => w.isActive).length})
          </button>
          <button
            onClick={() => setFilterTab('pendingSync')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1 ${
              filterTab === 'pendingSync' ? 'bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>في انتظار رفع الاسم</span>
            {pendingSyncWorkers.length > 0 && (
              <span className="text-[10px] bg-amber-500 text-slate-950 font-bold px-1 rounded-full font-mono">
                {pendingSyncWorkers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterTab('frozen')}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              filterTab === 'frozen' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            مجمد ({workers.filter((w) => !w.isActive).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {departments.length > 0 && (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white"
            >
              <option value="all">كل الأقسام</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالاسم، الكود، القسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded pr-8 pl-3 py-1 text-xs text-white placeholder-slate-500 w-48 focus:w-60 transition-all"
            />
          </div>
        </div>
      </div>



      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {filteredWorkers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                  <th className="py-2.5 px-3 font-semibold">كود</th>
                  <th className="py-2.5 px-3 font-semibold">الاسم</th>
                  <th className="py-2.5 px-3 font-semibold">القسم</th>
                  <th className="py-2.5 px-3 font-semibold">خط الإنتاج</th>
                  <th className="py-2.5 px-3 font-semibold">الوظيفة</th>
                  <th className="py-2.5 px-3 font-semibold">الجنسية والوردية</th>
                  <th className="py-2.5 px-3 font-semibold text-center">الماكينة والربط</th>
                  <th className="py-2.5 px-3 font-semibold text-center">الحالة</th>
                  <th className="py-2.5 px-3 font-semibold text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-slate-850 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-white">
                      <div>{worker.code}</div>
                      {worker.aliasCodes && worker.aliasCodes.length > 0 && (
                        <div className="text-[9px] text-amber-400 font-normal font-sans" title="أكواد بديلة مدمجة">
                          (بديل: #{worker.aliasCodes.join(', #')})
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 font-medium text-white">{worker.name}</td>
                    <td className="py-2 px-3 text-slate-300">{worker.department}</td>
                    <td className="py-2 px-3 text-slate-400 font-mono">
                      {worker.line && worker.line !== '-' ? worker.line : <span className="text-slate-600">-</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-400">{worker.jobTitle}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {worker.nationality} ({worker.shiftId === 'bangladeshi' ? '8:00 - 18:30' : '8:00 - 16:30'})
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {worker.enrolledOnDeviceName ? (
                          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                            {worker.enrolledOnDeviceName}
                          </span>
                        ) : worker.assignedDeviceIds && worker.assignedDeviceIds.length > 0 ? (
                          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40" title={`ماكينات: ${worker.assignedDeviceIds.join(', ')}`}>
                            {worker.assignedDeviceIds.length === 1 
                              ? (devices.find(d => d.id === worker.assignedDeviceIds[0])?.name || `ماكينة #${worker.assignedDeviceIds[0]}`)
                              : `${worker.assignedDeviceIds.length} ماكينات`}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">غير محدد</span>
                        )}

                        {worker.isNameSyncedToDevice ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>مربوط</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleQuickUploadWorkerName(worker)}
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.2 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                            title="اضغط لرفع الاسم وتثبيته على الماكينة"
                          >
                            <UploadCloud className="w-2.5 h-2.5" />
                            <span>رفع الاسم</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                        worker.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                      }`}>
                        {worker.isActive ? 'نشط' : 'مجمد'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {worker.isActive ? (
                          <>
                            <button
                              onClick={() => handleOpenEditWorker(worker)}
                              className="p-1 rounded bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-400 transition-colors cursor-pointer"
                              title="تعديل بيانات العامل بالكامل"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setTransferringWorker(worker);
                                setNewDepartment(worker.department);
                                setNewLine(worker.line === '-' ? '' : worker.line);
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                              title="نقل قسم / تعديل خط"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeactivatingWorker(worker)}
                              className="px-2 py-0.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 text-[11px] border border-amber-800/40 transition-colors cursor-pointer"
                              title="تجميد العامل مؤقتاً"
                            >
                              تجميد
                            </button>
                            {onDeleteWorker && (
                              <button
                                onClick={() => setWorkerToDelete(worker)}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer border border-slate-700/60"
                                title="حذف العامل نهائياً من قاعدة بيانات البرنامج (آمن - لا يمس الماكينة)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setReactivatingWorker(worker);
                                setTargetDeviceIds(worker.assignedDeviceIds.length ? worker.assignedDeviceIds : [101, 102]);
                              }}
                              className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCcw className="w-3 h-3" />
                              <span>إعادة تنشيط</span>
                            </button>
                            {onDeleteWorker && (
                              <button
                                onClick={() => setWorkerToDelete(worker)}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-600/30 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer border border-slate-700/60"
                                title="حذف العامل نهائياً من قاعدة بيانات البرنامج (آمن - لا يمس الماكينة)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            لا يوجد موظفون أو عمال يطابقون خيارات البحث الحالية.
          </div>
        )}
      </div>

      {/* Add Worker Modal */}
      {showAddWorkerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">إضافة موظف / عامل جديد</h3>
              <button onClick={() => setShowAddWorkerModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorker} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">كود العامل (ID):</label>
                  <input
                    type="number"
                    min="1"
                    value={newWorkerCode}
                    onChange={(e) => setNewWorkerCode(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="كود فارغ للتوليد الذكي"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {newWorkerCode === '' 
                      ? `سيتم سد الفراغ بالكود (#${getFirstUnusedWorkerCode(workers)})` 
                      : `أول كود شاغر متاح: #${getFirstUnusedWorkerCode(workers)}`}
                  </span>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-300 font-medium block mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    placeholder="اسم الموظف أو العامل"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">القسم:</label>
                  <input
                    type="text"
                    value={newWorkerDept}
                    onChange={(e) => setNewWorkerDept(e.target.value)}
                    placeholder="إنتاج، إدارة، حسابات، مخازن..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1 flex items-center justify-between">
                    <span>خط الإنتاج:</span>
                    <span className="text-[10px] text-slate-500">
                      {isAdministrativeDept ? '(غير مطلوب للإداريين)' : '(اختياري)'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newWorkerLine}
                    onChange={(e) => setNewWorkerLine(e.target.value)}
                    placeholder={isAdministrativeDept ? 'يترك فارغاً للإداريين' : 'مثال: خط 1 أو يترك فارغاً'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الوظيفة:</label>
                  <input
                    type="text"
                    value={newWorkerJob}
                    onChange={(e) => setNewWorkerJob(e.target.value)}
                    placeholder="محاسب، مشرف، فني خياطة..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الجنسية والوردية:</label>
                  <select
                    value={newWorkerNat}
                    onChange={(e) => {
                      const nat = e.target.value as any;
                      setNewWorkerNat(nat);
                      setNewWorkerShift(nat === 'بنغلاديشي' ? 'bangladeshi' : 'standard');
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  >
                    <option value="مصري">مصري (8:00 - 16:30)</option>
                    <option value="بنغلاديشي">بنغلاديشي (8:00 - 18:30)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">سماحية مخصصة (دقيقة):</label>
                  <input
                    type="number"
                    min="0"
                    value={newWorkerGrace}
                    onChange={(e) => setNewWorkerGrace(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">رقم الهاتف (اختياري):</label>
                <input
                  type="text"
                  value={newWorkerPhone}
                  onChange={(e) => setNewWorkerPhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddWorkerModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer / Edit Line Modal */}
      {transferringWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-white">تعديل القسم وخط الإنتاج</h3>
            <p className="text-xs text-slate-400">
              تعديل بيانات الموظف: <strong className="text-white">{transferringWorker.name}</strong> (#{transferringWorker.code})
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">القسم الجديد:</label>
                <input
                  type="text"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-300 block mb-1">خط الإنتاج (اختياري):</label>
                <input
                  type="text"
                  value={newLine}
                  onChange={(e) => setNewLine(e.target.value)}
                  placeholder="اتركه فارغاً إذا كان إدارياً أو بدون خط"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setTransferringWorker(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmTransfer}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
              >
                تطبيق التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {deactivatingWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <UserX className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تجميد الموظف / العامل</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من تجميد <strong className="text-white">{deactivatingWorker.name}</strong>؟ سيتم إيقاف صلاحيته على ماكينات البصمة مع الاحتفاظ بجميع بياناته وحركاته السابقة.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDeactivatingWorker(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDeactivate}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
              >
                تأكيد التجميد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Modal */}
      {reactivatingWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-400">
              <UserCheck className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">إعادة تنشيط الموظف</h3>
            </div>
            <p className="text-xs text-slate-300">
              إعادة تفعيل <strong className="text-white">{reactivatingWorker.name}</strong> وإرسال اسمه وبصمته المخزنة إلى الماكينات المحددة.
            </p>
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-400 block">اختيار ماكينات العمل المصرح بها:</label>
              <div className="space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800 max-h-36 overflow-y-auto">
                {devices.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={targetDeviceIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTargetDeviceIds([...targetDeviceIds, d.id]);
                        } else {
                          setTargetDeviceIds(targetDeviceIds.filter((id) => id !== d.id));
                        }
                      }}
                    />
                    <span>{d.name} (#{d.id})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setReactivatingWorker(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmReactivate}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
              >
                تنشيط وإرسال البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Sync Modal (Download / Upload) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">مزامنة وربط بيانات العمال بالماكينات</h3>
                  <p className="text-[11px] text-slate-400">سحب الأكواد المسجلة على الماكينات ورفع وتثبيت الأسماء</p>
                </div>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Action Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSyncAction('download')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    syncAction === 'download' ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>1. سحب بيانات من الماكينة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSyncAction('upload')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    syncAction === 'upload' ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>2. رفع وتثبيت الأسماء للماكينة</span>
                </button>
              </div>

              {/* Download Mode */}
              {syncAction === 'download' && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">ماكينة المصدر للسحب:</label>
                    <select
                      value={syncTargetDeviceId}
                      onChange={(e) => setSyncTargetDeviceId(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    >
                      <option value="all">كل الماكينات المتاحة بالمصنع ({devices.length})</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} (#{d.id} - {d.ip}:{d.port})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t border-slate-800/60 pt-2.5 space-y-2">
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      💡 <strong>كيف تعمل هذه الخطوة؟</strong> عند إضافة عامل جديد على الماكينة في المصنع وتسجيل بصمته برقم كود، اضغط زر السحب ليقوم البرنامج بفحص الماكينة واكتشاف الكود تلقائياً لتسميته وإضافته لشؤون العاملين.
                    </p>

                    {/* Manual enrolled code entry helper */}
                    <div className="bg-slate-900 p-2.5 rounded border border-slate-800 space-y-2">
                      <label className="text-slate-400 block text-[11px]">
                        أو أدخل رقم كود قمت بتسجيله الآن على الماكينة فوراً:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="مثال: 125"
                          value={customEnrolledCode}
                          onChange={(e) => setCustomEnrolledCode(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-white text-xs w-32 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const codeNum = parseInt(customEnrolledCode, 10);
                            if (codeNum) {
                              handleStartNamingCode(codeNum);
                              setCustomEnrolledCode('');
                            }
                          }}
                          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs cursor-pointer font-medium"
                        >
                          تسمية هذا الكود الآن
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Mode */}
              {syncAction === 'upload' && (
                <div className="space-y-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">الماكينة المستهدفة للرفع والتثبيت:</label>
                    <select
                      value={syncTargetDeviceId}
                      onChange={(e) => setSyncTargetDeviceId(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    >
                      <option value="all">جميع ماكينات المصنع الـ ({devices.length}) [مستحسن]</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} (#{d.id} - {d.ip})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-800/30 text-[11px] text-emerald-200 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ربط الأسماء بالأكواد على الماكينة (SetUserInfo)</span>
                    </p>
                    <p className="text-slate-300">
                      سيتم إرسال الأسماء وتثبيتها بجانب كل كود. بعد إتمام الرفع، عندما يضع العامل إصبعه على الماكينة ستنطق وترحب به وتكتب اسمه بالكامل على شاشتها!
                    </p>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 font-mono text-[11px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">أسماء في انتظار الرفع:</span>
                      <span className="text-amber-400 font-bold">{pendingSyncWorkers.length} موظف</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-sans">إجمالي العمال النشطين للتعميم:</span>
                      <span className="text-white font-bold">{workers.filter(w => w.isActive).length} موظف</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBiometricSync}
                  disabled={isSyncingProcess}
                  className={`px-4 py-1.5 rounded-lg text-white font-medium cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                    syncAction === 'upload' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {syncAction === 'upload' ? <UploadCloud className="w-3.5 h-3.5" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                  <span>
                    {isSyncingProcess 
                      ? 'جاري الاتصال والمزامنة...' 
                      : syncAction === 'upload' 
                        ? 'بدء رفع وتثبيت الأسماء الآن' 
                        : 'بدء فحص وسحب الأكواد الآن'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Worker Modal (Point 6 & 7) */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-5 space-y-4 shadow-2xl my-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  تعديل بيانات العامل والموظف #{editingWorker.code} ({editingWorker.name})
                </h3>
              </div>
              <button
                onClick={() => setEditingWorker(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWorkerEdit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الاسم بالكامل:</label>
                  <input
                    type="text"
                    value={editWorkerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditWorkerName(val);
                      // Auto-detect Bengali if typing English name
                      if (/^[A-Za-z\s.'-]+$/.test(val) && val.length > 2) {
                        setEditWorkerNat('بنغلاديشي');
                        setEditWorkerShift('bangladeshi');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="مثال: أحمد محمد عبد الله أو MD RASEL"
                    required
                  />
                  {/^[A-Za-z\s.'-]+$/.test(editWorkerName) && editWorkerName.length > 2 && (
                    <span className="text-[10px] text-amber-400 mt-0.5 block">
                      ⚡ تم التعرف على اسم باللغة الإنجليزية: تم ضبط الجنسية تلقائياً بنغلاديشي ووردية بنغال.
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">كود العامل (ID):</label>
                  <input
                    type="number"
                    value={editWorkerCode}
                    onChange={(e) => setEditWorkerCode(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">القسم:</label>
                  <input
                    type="text"
                    value={editWorkerDept}
                    onChange={(e) => setEditWorkerDept(e.target.value)}
                    list="factory-depts-list"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="اختر أو اكتب القسم"
                    required
                  />
                  <datalist id="factory-depts-list">
                    <option value="إنتاج رجال" />
                    <option value="إنتاج سيدات" />
                    <option value="تعبئة وتغليف" />
                    <option value="مراقبة الجودة" />
                    <option value="صيانة وتشغيل" />
                    <option value="المخازن" />
                    <option value="الشؤون الإدارية" />
                  </datalist>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">خط الإنتاج:</label>
                  <input
                    type="text"
                    value={editWorkerLine}
                    onChange={(e) => setEditWorkerLine(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="مثال: خط 1، خط 2 أو -"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">المسمى الوظيفي:</label>
                  <input
                    type="text"
                    value={editWorkerJob}
                    onChange={(e) => setEditWorkerJob(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    placeholder="مثال: فني خياطة، مساعد، مراقب"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">الجنسية:</label>
                  <select
                    value={editWorkerNat}
                    onChange={(e) => {
                      const nat = e.target.value as any;
                      setEditWorkerNat(nat);
                      if (nat === 'بنغلاديشي') {
                        setEditWorkerShift('bangladeshi');
                      } else {
                        setEditWorkerShift('standard');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="مصري">مصري</option>
                    <option value="بنغلاديشي">بنغلاديشي</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">الوردية ومواعيد العمل:</label>
                  <select
                    value={editWorkerShift}
                    onChange={(e) => setEditWorkerShift(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 cursor-pointer font-sans"
                  >
                    <option value="standard">وردية مصريين (8:00 ص - 4:30 م)</option>
                    <option value="bangladeshi">وردية بنغال (8:00 ص - 6:30 م)</option>
                    <option value="custom">وردية مخصصة</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">سماحية تأخير مخصصة (دقيقة):</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={editWorkerGrace}
                    onChange={(e) => setEditWorkerGrace(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Point 9: Assigned Machines Checklist */}
              <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-medium block">
                    الماكينات المسجل عليها العامل بالمصنع ({devices.length} ماكينات):
                  </label>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    {editWorkerAssignedDevices.length} ماكينات محددة
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {devices.map((d) => {
                    const isChecked = editWorkerAssignedDevices.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                          isChecked 
                            ? 'bg-blue-950/40 border-blue-500/50 text-white' 
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditWorkerAssignedDevices(prev => [...prev, d.id]);
                              } else {
                                setEditWorkerAssignedDevices(prev => prev.filter(id => id !== d.id));
                              }
                            }}
                            className="w-3.5 h-3.5 text-blue-600 rounded bg-slate-950 border-slate-700"
                          />
                          <span className="font-sans text-xs">{d.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">#{d.id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">رقم الهاتف (اختياري):</label>
                  <input
                    type="text"
                    value={editWorkerPhone}
                    onChange={(e) => setEditWorkerPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    placeholder="مثال: 010xxxxxxxx"
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadToDeviceAfterSave}
                      onChange={(e) => setUploadToDeviceAfterSave(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded bg-slate-950 border-slate-700"
                    />
                    <span className="text-xs">رفع وتحديث الاسم على شاشة الماكينة فور الحفظ</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingWorker(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ وتثبيت التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Safe Local Delete Worker Confirmation Modal (Point 5 & Point 7) */}
      {workerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/60 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">تأكيد حذف العامل محلياً</h3>
                  <p className="text-[11px] text-slate-400">كود #{workerToDelete.code} - {workerToDelete.name}</p>
                </div>
              </div>
              <button
                onClick={() => setWorkerToDelete(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-950/30 border border-rose-800/40 rounded-lg p-3 text-rose-200/90 space-y-2 leading-relaxed">
                <p className="font-semibold text-rose-300">
                  هل أنت متأكد من حذف العامل <span className="text-white font-bold">({workerToDelete.name})</span> من قاعدة بيانات البرنامج؟
                </p>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>الحذف الآمن (محلي فقط):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 pr-1">
                    <li>سيتم مسح بيانات وسجلات العامل من قاعدة بيانات البرنامج المحلية فقط.</li>
                    <li><strong className="text-emerald-400">لن يتم إرسال أي أمر حذف إلى ماكينة البصمة</strong> إطلاقاً.</li>
                    <li>بصمات العامل وقوالبه الحيوية محفوظة على الماكينات للأبد دون أي تغيير.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setWorkerToDelete(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!workerToDelete) return;
                  const c = workerToDelete.code;
                  const n = workerToDelete.name;
                  onDeleteWorker?.(c);
                  setWorkerToDelete(null);
                  setNotification(`🗑️ تم حذف العامل (${n} - كود ${c}) من البرنامج بنجاح، مع بقاء بصماته على الماكينات.`);
                  setTimeout(() => setNotification(null), 5000);
                }}
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تأكيد الحذف المحلي</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Duplicate Names & Code Merger Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl my-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">فحص وتوحيد الأسماء المكررة (Smart Duplicate Resolver)</h3>
                  <p className="text-[11px] text-slate-400">حل مشكلة تكرار العمال عبر الماكينات وربط الأكواد البديلة (Aliases)</p>
                </div>
              </div>
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Red Critical Warning for Duplicate Resolution */}
            <div className="bg-rose-950/40 border border-rose-600/70 rounded-lg p-3 flex items-start gap-2.5 text-rose-200">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-rose-300">
                  تنبيه: هذا الدمج مخصص فقط للعمال الذين تم تسجيلهم بأكواد مختلفة بالخطأ. إذا كان لديك أشخاص مختلفون يحملون نفس الاسم، فلا تقم بدمجهم.
                </p>
                <p className="text-[11px] text-rose-300/80">
                  دمج شخصين مختلفين بالخطأ سيؤدي لدمج سجلات حضورهما في شخص واحد. تأكد من أن السجلات تخص نفس العامل بالفعل.
                </p>
              </div>
            </div>

            {/* Explanation & Safety Notice */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>كيف يعمل دمج الأكواد الذكي؟</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                إذا تم تسجيل العامل بكودين مختلفين على ماكينتين عن طريق الخطأ (مثلاً كود 15 وكود 18 لنفس الاسم)، يمكنك هنا اختيار <strong>الكود الأساسي</strong> واعتماد الكود الآخر كـ <strong>Alias</strong>. سيقوم البرنامج بنقل كافة البصمات والحركات أوتوماتيكياً للكود الأساسي، مع حذف السجل المكرر <strong>محلياً فقط دون أي مساس بجهاز البصمة</strong>.
              </p>
            </div>

            {/* Detected Duplicate Groups */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {duplicateGroups.length > 0 ? (
                duplicateGroups.map((group) => {
                  const currentPrimary = selectedPrimaryMap[group.normalizedKey] || group.workers[0].code;
                  const aliasCandidates = group.workers.filter((w) => w.code !== currentPrimary);

                  return (
                    <div key={group.normalizedKey} className="bg-slate-950/80 border border-amber-500/30 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          <span>اسم مشترك: {group.sampleName}</span>
                        </span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-medium">
                          {group.workers.length} سجلات بأكواد مختلفة
                        </span>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-400">اختر الكود الأساسي (سيتم تحويل الأكواد الأخرى لأكواد بديلة):</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.workers.map((w) => {
                            const isSelected = currentPrimary === w.code;
                            return (
                              <label
                                key={w.code}
                                onClick={() => setSelectedPrimaryMap((prev) => ({ ...prev, [group.normalizedKey]: w.code }))}
                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isSelected 
                                    ? 'bg-indigo-950/40 border-indigo-500 text-white' 
                                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`primary-${group.normalizedKey}`}
                                  checked={isSelected}
                                  onChange={() => setSelectedPrimaryMap((prev) => ({ ...prev, [group.normalizedKey]: w.code }))}
                                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-cyan-300">كود #{w.code}</span>
                                    {isSelected && (
                                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 rounded font-semibold">
                                        أساسي
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-300">{w.name}</div>
                                  <div className="text-[10px] text-slate-400">{w.department} | {w.nationality}</div>
                                  {w.aliasCodes && w.aliasCodes.length > 0 && (
                                    <div className="text-[10px] text-amber-400">أكواد بديلة حالية: #{w.aliasCodes.join(', #')}</div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex justify-end pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => {
                            if (!onMergeWorkers) return;
                            for (const aliasW of aliasCandidates) {
                              onMergeWorkers(currentPrimary, aliasW.code);
                            }
                            setNotification(`✅ تم بنجاح اعتماد كود #${currentPrimary} ككود أساسي ودمج باقي الأكواد ونقل حركاتها.`);
                            setTimeout(() => setNotification(null), 6000);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>اعتماد ودمج السجلات في كود #{currentPrimary}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-4 text-center space-y-1.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                  <p className="text-xs font-bold text-emerald-300">لا توجد أي أسماء مكررة بأكواد مختلفة حالياً!</p>
                  <p className="text-[11px] text-slate-400">جميع العاملين مسجلون بأكواد فريدة ومنسقة بين البرنامج والماكينات.</p>
                </div>
              )}
            </div>

            {/* Manual Merge Section */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                <span>دمج يدوي مخصص (دمج كودين مختلفين باختيارك):</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">الكود الأساسي (الذي سيتم الإبقاء عليه):</label>
                  <select
                    value={manualPrimaryCode}
                    onChange={(e) => setManualPrimaryCode(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  >
                    <option value="">-- اختر العامل الأساسي --</option>
                    {workers.map((w) => (
                      <option key={w.code} value={w.code}>
                        #{w.code} - {w.name} ({w.department})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">الكود المراد دمجه كـ Alias (سيتم نقل حركاته وحذفه محلياً):</label>
                  <select
                    value={manualAliasCode}
                    onChange={(e) => setManualAliasCode(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  >
                    <option value="">-- اختر الكود المراد دمجه --</option>
                    {workers
                      .filter((w) => w.code !== manualPrimaryCode)
                      .map((w) => (
                        <option key={w.code} value={w.code}>
                          #{w.code} - {w.name} ({w.department})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!manualPrimaryCode || !manualAliasCode || manualPrimaryCode === manualAliasCode}
                  onClick={() => {
                    if (manualPrimaryCode && manualAliasCode && onMergeWorkers) {
                      onMergeWorkers(Number(manualPrimaryCode), Number(manualAliasCode));
                      setManualPrimaryCode('');
                      setManualAliasCode('');
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>دمج الكودين ونقل الحركات الآن</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer font-medium"
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
