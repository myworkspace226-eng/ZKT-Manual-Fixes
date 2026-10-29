/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar, ActiveTab, ActivityLogEntry } from './components/Sidebar';
import { DashboardHUD } from './components/DashboardHUD';
import { DeviceManager } from './components/DeviceManager';
import { AttendanceLogs } from './components/AttendanceLogs';
import { WorkersManager } from './components/WorkersManager';
import { GatePassManager } from './components/GatePassManager';
import { ReportsCenter } from './components/ReportsCenter';
import { SettingsManager } from './components/SettingsManager';

import { 
  INITIAL_DEVICES, 
  INITIAL_WORKERS, 
  INITIAL_ATTENDANCE_RECORDS, 
  INITIAL_SHIFT_RULES, 
  INITIAL_GATE_PASSES,
  DEFAULT_FACTORY_SETTINGS
} from './data/mockData';
import { Device, Worker, AttendanceRecord, ShiftRule, GatePass, FactorySettings, HRAuditRecord, AbsenceCategory } from './types';
import { pingDeviceNetwork, pullDeviceAttendanceLogs, isDesktopApp } from './services/deviceConnection';
import { resolveSmartPunchState } from './utils/attendanceEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Persist devices with localStorage so custom IPs and ports are remembered
  const [devices, setDevices] = useState<Device[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_devices_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading devices from localStorage', e);
    }
    return INITIAL_DEVICES;
  });

  const [workers, setWorkers] = useState<Worker[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_workers_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading workers from localStorage', e);
    }
    return INITIAL_WORKERS;
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_attendance_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading attendance from localStorage', e);
    }
    return INITIAL_ATTENDANCE_RECORDS;
  });

  const [shifts, setShifts] = useState<ShiftRule[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_shifts_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading shifts from localStorage', e);
    }
    return INITIAL_SHIFT_RULES;
  });

  const [gatePasses, setGatePasses] = useState<GatePass[]>(INITIAL_GATE_PASSES);
  
  const [settings, setSettings] = useState<FactorySettings>(() => {
    try {
      const saved = localStorage.getItem('zkt_settings_v2');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading settings from localStorage', e);
    }
    return DEFAULT_FACTORY_SETTINGS;
  });

  const [auditLog, setAuditLog] = useState<HRAuditRecord[]>(() => {
    try {
      const saved = localStorage.getItem('zkt_audit_log_v5');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading audit log', e);
    }
    return [];
  });

  // Absence overrides persisted across application sessions and navigation
  const [absenceOverrides, setAbsenceOverrides] = useState<Record<string, { category: AbsenceCategory; note: string }>>(() => {
    try {
      const saved = localStorage.getItem('zkt_absence_overrides');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading absence overrides from localStorage', e);
    }
    return {};
  });

  const handleUpdateAbsenceOverrides = useCallback((newOverrides: Record<string, { category: AbsenceCategory; note: string }>) => {
    setAbsenceOverrides(newOverrides);
    try {
      localStorage.setItem('zkt_absence_overrides', JSON.stringify(newOverrides));
    } catch (e) {
      console.error('Error immediately saving absence overrides to localStorage', e);
    }
  }, []);
  
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  // Debounced auto-save to localStorage to prevent UI freezing during navigation and heavy operations (Point 1)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('zkt_devices_v2', JSON.stringify(devices));
      } catch (e) {
        console.error('Error saving devices', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [devices]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('zkt_workers_v2', JSON.stringify(workers));
      } catch (e) {
        console.error('Error saving workers', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [workers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('zkt_attendance_v2', JSON.stringify(attendanceRecords));
      } catch (e) {
        console.error('Error saving attendance', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [attendanceRecords]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('zkt_shifts_v2', JSON.stringify(shifts));
      } catch (e) {
        console.error('Error saving shifts', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [shifts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('zkt_settings_v2', JSON.stringify(settings));
      } catch (e) {
        console.error('Error saving settings', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('zkt_audit_log_v5', JSON.stringify(auditLog));
      } catch (e) {
        console.error('Error saving audit log', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [auditLog]);

  const handleAddAuditRecord = (record: HRAuditRecord) => {
    setAuditLog((prev) => [record, ...prev]);
  };

  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([
    { 
      id: 'init-1', 
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }), 
      text: 'بدء تشغيل نظام الماكينات والحضور V 5.4.0', 
      type: 'info' 
    }
  ]);

  const showNotification = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setGlobalNotice(msg);
    setActivityLogs((prev) => [
      {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        text: msg.replace(/[✅❌🔌ℹ️🗑️⚡]/g, '').trim(),
        type: msg.includes('❌') ? 'error' : msg.includes('✅') ? 'success' : type,
      },
      ...prev.slice(0, 19),
    ]);
    setTimeout(() => setGlobalNotice(null), 4000);
  };

  // Clean up any fake mock counts from previous version
  useEffect(() => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.userCount === 38 && d.fpCount === 72 && d.recordCount === 154) {
          return {
            ...d,
            status: 'disconnected',
            userCount: 0,
            fpCount: 0,
            faceCount: 0,
            recordCount: 0,
            lastSyncTime: 'لم تتم المزامنة بعد',
            pingMs: undefined,
          };
        }
        return d;
      })
    );
  }, []);

  const handleResetMockData = () => {
    localStorage.removeItem('zkt_devices_v2');
    setDevices(INITIAL_DEVICES.map((d) => ({
      ...d,
      status: 'disconnected',
      userCount: 0,
      fpCount: 0,
      faceCount: 0,
      recordCount: 0,
      lastSyncTime: 'لم تتم المزامنة بعد',
      pingMs: undefined,
    })));
    showNotification('تمت تصفية الذاكرة المؤقتة وإعادة ضبط بيانات الماكينات لحالتها الطبيعية.');
  };

  // Auto-discover LAN devices on workstation launch (Only in Desktop Mode)
  useEffect(() => {
    if (!isDesktopApp()) {
      setDevices((prev) => prev.map((d) => ({ ...d, status: 'disconnected', pingMs: undefined })));
      return;
    }

    let isMounted = true;
    const discoverDevices = async () => {
      const results = await Promise.all(
        devices.map(async (d) => {
          const res = await pingDeviceNetwork(d.ip, d.port);
          return { id: d.id, success: res.success, pingMs: res.pingMs };
        })
      );

      if (!isMounted) return;

      setDevices((prev) =>
        prev.map((d) => {
          const r = results.find((item) => item.id === d.id);
          if (r && r.success) {
            return {
              ...d,
              status: 'connected',
              pingMs: r.pingMs,
              lastSyncTime: 'الآن',
            };
          }
          return {
            ...d,
            status: 'disconnected',
            pingMs: undefined,
          };
        })
      );
    };

    discoverDevices();
    return () => {
      isMounted = false;
    };
  }, []);

  // State reference cache for stable callbacks without triggering effect loops
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const attendanceRecordsRef = useRef(attendanceRecords);
  attendanceRecordsRef.current = attendanceRecords;
  const workersRef = useRef(workers);
  workersRef.current = workers;
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;

  // 1. Parallel Sync from all machines (Real ZKTeco Communication)
  const handleSyncAllDevices = useCallback(async (silent: boolean = false) => {
    if (!isDesktopApp()) {
      if (!silent) {
        showNotification('سحب الحركات التلقائي عبر الشبكة متاح داخل تطبيق الديسكتوب. في المتصفح يمكنك استخدام "استيراد ملف USB".');
      }
      return;
    }

    setIsSyncing(true);
    setDevices((prev) =>
      prev.map((d) => ({
        ...d,
        status: 'syncing',
      }))
    );

    let connectedCount = 0;
    let totalImported = 0;
    const currentAttendance = attendanceRecordsRef.current;
    const currentWorkers = workersRef.current;
    const currentDevices = devicesRef.current;
    const currentShifts = shiftsRef.current;

    // Build an indexed key set of existing records for O(1) duplicate checking
    const existingKeys = new Set(
      currentAttendance.map((ar) => `${ar.workerCode}_${ar.displayDate}_${ar.displayTime}_${ar.deviceId}`)
    );
    const allNewRecords: AttendanceRecord[] = [];

    // Query devices sequentially to keep socket communication stable
    for (const d of currentDevices) {
      const res = await pullDeviceAttendanceLogs(d.ip, d.port);
      if (res.success) {
        connectedCount++;
        const pulledRecords: AttendanceRecord[] = res.records.map((r, i) => {
          const rawUserIdStr = String(r.userId || '').trim();
          const userCodeNum = Number(rawUserIdStr) || 0;
          const slotCodeOnThisDevice = (d.id * 100000) + userCodeNum;

          const matchedWorker = currentWorkers.find((w) => {
            const wCodeClean = String(w.code || '').trim().replace(/^0+/, '');
            const isDirectMatch = w.code === userCodeNum || wCodeClean === rawUserIdStr || w.code === slotCodeOnThisDevice;
            const isAliasMatch = Boolean(w.aliasCodes && (
              w.aliasCodes.includes(userCodeNum) || 
              w.aliasCodes.includes(slotCodeOnThisDevice) ||
              w.aliasCodes.some((ac) => String(ac).trim() === rawUserIdStr)
            ));
            return isDirectMatch || isAliasMatch;
          });

          const canonicalCode = matchedWorker ? matchedWorker.code : (userCodeNum || slotCodeOnThisDevice || (1000 + i));
          const realWorkerName = matchedWorker 
            ? matchedWorker.name 
            : `موظف #${r.userId}`;

          const vType = Number(r.verifyType) || 0;
          let pType: 'FINGERPRINT' | 'FACE' | 'CARD' | 'MANUAL' = 'FINGERPRINT';
          if (vType === 15 || vType === 4 || vType === 16 || (matchedWorker?.hasFace && !matchedWorker?.hasFingerprint)) {
            pType = 'FACE';
          } else if (vType === 2 || vType === 3) {
            pType = 'CARD';
          } else if (matchedWorker?.hasFace && !matchedWorker?.hasFingerprint) {
            pType = 'FACE';
          }

          const dateObj = new Date(r.recordTime);
          const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toTimeString().slice(0, 5) : '08:00';

          // FIX (Point 2 - Problem 2): r.state is direction (0: IN, 1: OUT). Evaluate through resolveSmartPunchState.
          const rawState: 'IN' | 'OUT' = Number(r.state) === 1 ? 'OUT' : 'IN';
          const matchedShift = currentShifts.find((s) => s.id === (matchedWorker?.shiftId || 'standard')) || currentShifts[0];
          const smartState = resolveSmartPunchState(timeStr, rawState, matchedShift);

          return {
            id: `REC-${d.id}-${r.userId}-${dateStr}-${timeStr.replace(':', '')}-${i}`,
            workerCode: canonicalCode,
            workerName: realWorkerName,
            department: matchedWorker ? matchedWorker.department : d.department,
            timestamp: !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateStr}T${timeStr}:00`,
            displayDate: dateStr,
            displayTime: timeStr,
            rawState: rawState,
            resolvedState: smartState.resolvedState,
            deviceId: d.id,
            deviceName: d.name,
            punchType: pType,
            verifyType: vType,
          };
        });

        const newForThisDevice: AttendanceRecord[] = [];
        for (const pr of pulledRecords) {
          const key = `${pr.workerCode}_${pr.displayDate}_${pr.displayTime}_${pr.deviceId}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            newForThisDevice.push(pr);
          }
        }

        allNewRecords.push(...newForThisDevice);
        totalImported += newForThisDevice.length;

        const totalRecordCount = res.deviceInfo?.logCounts ?? res.records.length;
        const totalUserCount = res.deviceInfo?.userCounts ?? d.userCount;

        setDevices((prev) =>
          prev.map((dev) =>
            dev.id === d.id
              ? {
                  ...dev,
                  status: 'connected',
                  pingMs: res.pingMs || 8,
                  lastSyncTime: 'الآن',
                  recordCount: totalRecordCount,
                  userCount: totalUserCount,
                }
              : dev
          )
        );
      } else {
        setDevices((prev) =>
          prev.map((dev) =>
            dev.id === d.id
              ? {
                  ...dev,
                  status: 'disconnected',
                  pingMs: undefined,
                }
              : dev
          )
        );
      }
    }

    if (allNewRecords.length > 0) {
      setAttendanceRecords((prev) => [...allNewRecords, ...prev]);
    }

    setIsSyncing(false);

    if (!silent) {
      if (connectedCount > 0) {
        showNotification(`✅ تم الاتصال بـ ${connectedCount} من ${currentDevices.length} ماكينات، وسحب ${totalImported} حركة جديدة إلى السجلات.`);
      } else {
        showNotification(`❌ تعذر الاتصال بالماكينات. تأكد أن كابلات الشبكة موصولة وأن الكمبيوتر على نفس الراوتر (LAN).`);
      }
    } else if (totalImported > 0) {
      showNotification(`⚡ تم استلام ${totalImported} حركة بصمة حية جديدة`);
    }
  }, []);

  // 2. Sync single device (Pull Real ZKTeco Attendance Records)
  const handleSyncSingleDevice = useCallback(async (deviceId: number) => {
    const currentDevices = devicesRef.current;
    const currentWorkers = workersRef.current;
    const currentAttendance = attendanceRecordsRef.current;
    const currentShifts = shiftsRef.current;

    const target = currentDevices.find((d) => d.id === deviceId);
    if (!target) return;

    if (!isDesktopApp()) {
      showNotification(`سحب الحركات التلقائي عبر الشبكة (Port 4370) متاح داخل تطبيق الديسكتوب. في المتصفح يمكنك استخدام "استيراد ملف USB".`);
      return;
    }

    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'syncing' } : d))
    );

    const res = await pullDeviceAttendanceLogs(target.ip, target.port);

    if (res.success) {
      const pulledRecords: AttendanceRecord[] = res.records.map((r, i) => {
        const rawUserIdStr = String(r.userId || '').trim();
        const userCodeNum = Number(rawUserIdStr) || 0;
        const slotCodeOnThisDevice = (target.id * 100000) + userCodeNum;

        const matchedWorker = currentWorkers.find((w) => {
          const wCodeClean = String(w.code || '').trim().replace(/^0+/, '');
          const isDirectMatch = w.code === userCodeNum || wCodeClean === rawUserIdStr || w.code === slotCodeOnThisDevice;
          const isAliasMatch = Boolean(w.aliasCodes && (
            w.aliasCodes.includes(userCodeNum) || 
            w.aliasCodes.includes(slotCodeOnThisDevice) ||
            w.aliasCodes.some((ac) => String(ac).trim() === rawUserIdStr)
          ));
          return isDirectMatch || isAliasMatch;
        });

        const canonicalCode = matchedWorker ? matchedWorker.code : (userCodeNum || slotCodeOnThisDevice || (1000 + i));
        const realWorkerName = matchedWorker 
          ? matchedWorker.name 
          : `موظف #${r.userId}`;

        const vType = Number(r.verifyType) || 0;
        let pType: 'FINGERPRINT' | 'FACE' | 'CARD' | 'MANUAL' = 'FINGERPRINT';
        if (vType === 15 || vType === 4 || vType === 16 || (matchedWorker?.hasFace && !matchedWorker?.hasFingerprint)) {
          pType = 'FACE';
        } else if (vType === 2 || vType === 3) {
          pType = 'CARD';
        } else if (matchedWorker?.hasFace && !matchedWorker?.hasFingerprint) {
          pType = 'FACE';
        }

        const dateObj = new Date(r.recordTime);
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toTimeString().slice(0, 5) : '08:00';

        // FIX: In ZKTeco protocol, r.state is attendance state (0: Check-In, 1: Check-Out)
        const rawState: 'IN' | 'OUT' = Number(r.state) === 1 ? 'OUT' : 'IN';
        const matchedShift = currentShifts.find((s) => s.id === (matchedWorker?.shiftId || 'standard')) || currentShifts[0];
        const smartState = resolveSmartPunchState(timeStr, rawState, matchedShift);

        return {
          id: `REC-${target.id}-${r.userId}-${dateStr}-${timeStr.replace(':', '')}-${i}`,
          workerCode: canonicalCode,
          workerName: realWorkerName,
          department: matchedWorker ? matchedWorker.department : target.department,
          timestamp: !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateStr}T${timeStr}:00`,
          displayDate: dateStr,
          displayTime: timeStr,
          rawState: rawState,
          resolvedState: smartState.resolvedState,
          deviceId: target.id,
          deviceName: target.name,
          punchType: pType,
          verifyType: vType,
        };
      });

      const existingKeys = new Set(
        currentAttendance.map((ar) => `${ar.workerCode}_${ar.displayDate}_${ar.displayTime}_${ar.deviceId}`)
      );
      const newRecords = pulledRecords.filter((pr) => {
        const key = `${pr.workerCode}_${pr.displayDate}_${pr.displayTime}_${pr.deviceId}`;
        return !existingKeys.has(key);
      });

      if (newRecords.length > 0) {
        setAttendanceRecords((prev) => [...newRecords, ...prev]);
      }

      const totalRecordCount = res.deviceInfo?.logCounts ?? res.records.length;
      const totalUserCount = res.deviceInfo?.userCounts ?? target.userCount;

      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                status: 'connected',
                pingMs: res.pingMs || 8,
                lastSyncTime: 'الآن',
                recordCount: totalRecordCount,
                userCount: totalUserCount,
              }
            : d
        )
      );

      if (res.records.length === 0) {
        showNotification(`ℹ️ تم الاتصال بـ (${target.name}) بنجاح ولكن لا توجد حركات مخزنة في ذاكرة الجهاز.`);
      } else if (newRecords.length > 0) {
        showNotification(`✅ تم سحب ${newRecords.length} حركة جديدة بنجاح من (${target.name}) وتحديث السجلات!`);
      } else {
        showNotification(`ℹ️ تم الاتصال بـ (${target.name}) وسحب ${res.records.length} حركة (جميعها محفوظة مسبقاً).`);
      }
    } else {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                status: 'disconnected',
                pingMs: undefined,
              }
            : d
        )
      );
      showNotification(`❌ فشل سحب الحركات من (${target.name}): ${res.error || res.message}`);
    }
  }, []);

  // 3. Attendance Records Handlers
  const handleAddManualRecord = (record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [record, ...prev]);
    showNotification(`تمت إضافة الحركة للعامل ${record.workerName}.`);
  };

  const handleUpdateRecord = (updatedRecord: AttendanceRecord) => {
    setAttendanceRecords((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
    );
    showNotification(`✅ تم تعديل بصمة العامل (${updatedRecord.workerName}) بنجاح.`);
  };

  const handleDeleteRecord = (recordId: string) => {
    setAttendanceRecords((prev) => prev.filter((r) => r.id !== recordId));
    showNotification('🗑️ تم حذف الحركة من السجلات بنجاح.');
  };

  // 4. Update Worker
  const handleUpdateWorker = (updatedWorker: Worker) => {
    setWorkers((prev) =>
      prev.map((w) => (w.id === updatedWorker.id ? updatedWorker : w))
    );
  };

  // 5. Add Worker
  const handleAddWorker = (newWorker: Worker) => {
    setWorkers((prev) => [newWorker, ...prev]);
    showNotification(`تمت إضافة العامل ${newWorker.name} بنجاح.`);
  };

  // Safe Local Delete Worker (Point 5 & Point 7: Zero impact on physical hardware)
  const handleDeleteWorker = (workerCode: number) => {
    setWorkers((prev) => prev.filter((w) => w.code !== workerCode));
    setAttendanceRecords((prev) => prev.filter((r) => r.workerCode !== workerCode));
    showNotification(`🗑️ تم مسح بيانات وسجلات العامل (كود #${workerCode}) محلياً من البرنامج بنجاح.`);
  };

  // Safe Merge Workers & Punch Aliasing (Smart Worker Duplicate Resolver)
  const handleMergeWorkers = (primaryCode: number, aliasCode: number) => {
    const primaryWorker = workers.find((w) => w.code === primaryCode);
    const aliasWorker = workers.find((w) => w.code === aliasCode);

    if (!primaryWorker || !aliasWorker) {
      showNotification('❌ تعذر العثور على أحد العاملين لإتمام عملية الدمج.');
      return;
    }

    if (primaryCode === aliasCode) {
      showNotification('⚠️ لا يمكن دمج الكود مع نفسه.');
      return;
    }

    const mergedAliases = Array.from(
      new Set([...(primaryWorker.aliasCodes || []), aliasCode, ...(aliasWorker.aliasCodes || [])])
    );
    const mergedDevices = Array.from(
      new Set([...(primaryWorker.assignedDeviceIds || []), ...(aliasWorker.assignedDeviceIds || [])])
    );

    // 1. Update primary worker with combined aliases and devices, remove alias worker from local database
    setWorkers((prev) =>
      prev
        .filter((w) => w.code !== aliasCode)
        .map((w) =>
          w.code === primaryCode
            ? {
                ...w,
                aliasCodes: mergedAliases,
                assignedDeviceIds: mergedDevices,
                hasFingerprint: w.hasFingerprint || aliasWorker.hasFingerprint,
                hasFace: w.hasFace || aliasWorker.hasFace,
              }
            : w
        )
    );

    // 2. Re-point all punches from aliasCode to primaryCode
    setAttendanceRecords((prev) =>
      prev.map((r) =>
        r.workerCode === aliasCode
          ? {
              ...r,
              workerCode: primaryCode,
              workerName: primaryWorker.name,
              department: primaryWorker.department,
            }
          : r
      )
    );

    showNotification(
      `✅ تم دمج كود #${aliasCode} كـ Alias للعامل [${primaryWorker.name} - كود #${primaryCode}] بنجاح ونقل كافة الحركات والسجلات!`
    );
  };

  // 6. Update Shift Rule
  const handleUpdateShift = (updatedShift: ShiftRule) => {
    setShifts((prev) =>
      prev.map((s) => (s.id === updatedShift.id ? updatedShift : s))
    );
    showNotification('تم تحديث مواعيد الوردية بنجاح.');
  };

  // 7. Update Worker Custom Grace
  const handleUpdateWorkerGrace = (workerCode: number, graceMinutes: number) => {
    setWorkers((prev) =>
      prev.map((w) => (w.code === workerCode ? { ...w, customGraceMinutes: graceMinutes } : w))
    );
    showNotification(`تم تحديث سماحية العامل ${workerCode} إلى ${graceMinutes} دقيقة.`);
  };

  // 8. Add Gate Pass (with retroactive support)
  const handleAddGatePass = (gatePass: GatePass) => {
    setGatePasses((prev) => [gatePass, ...prev]);
    showNotification(`تم إصدار تصريح الخروج للعامل ${gatePass.workerName} بتاريخ ${gatePass.date}.`);
  };

  const handleUpdateGatePass = (updatedGatePass: GatePass) => {
    setGatePasses((prev) =>
      prev.map((p) => (p.id === updatedGatePass.id ? updatedGatePass : p))
    );
    showNotification(`✅ تم تحديث تصريح الخروج للعامل (${updatedGatePass.workerName}) بنجاح.`);
  };

  const handleDeleteGatePass = (id: string) => {
    setGatePasses((prev) => prev.filter((p) => p.id !== id));
    showNotification('🗑️ تم حذف التصريح من السجلات بنجاح.');
  };

  // 9. Complete Gate Pass
  const handleCompleteGatePass = (id: string, returnTime: string) => {
    setGatePasses((prev) =>
      prev.map((p) => (p.id === id ? { ...p, returnTime, status: 'completed' } : p))
    );
    showNotification('تم تسجيل عودة العامل واكتمال التصريح.');
  };

  // 10. Process USB Logs
  const handleImportUsbLogs = (fileContent: string) => {
    const lines = fileContent.trim().split('\n');
    const newLogs: AttendanceRecord[] = [];

    lines.forEach((line, index) => {
      const parts = line.split(/\t|\s+/);
      if (parts.length >= 2) {
        const code = parseInt(parts[0], 10);
        const worker = workers.find((w) => w.code === code);
        const name = worker ? worker.name : `عامل كود ${code}`;
        const dept = worker ? worker.department : 'عام';
        const datePart = parts[1] || new Date().toISOString().slice(0, 10);
        const timePart = parts[2] || '08:00:00';

        newLogs.push({
          id: `usb-${Date.now()}-${index}`,
          workerCode: code,
          workerName: name,
          department: dept,
          timestamp: `${datePart}T${timePart}`,
          displayDate: datePart,
          displayTime: timePart,
          rawState: 'IN',
          resolvedState: 'IN',
          deviceId: 0,
          deviceName: 'USB',
          punchType: 'FINGERPRINT',
          isManual: true,
          manualNote: 'استيراد USB',
        });
      }
    });

    if (newLogs.length > 0) {
      setAttendanceRecords((prev) => [...newLogs, ...prev]);
      showNotification(`تم استيراد ${newLogs.length} حركة من ملف USB.`);
    }
  };

  // 11. Device Management Handlers
  const handleAddDevice = (newDevice: Device) => {
    setDevices((prev) => [...prev, newDevice]);
    showNotification(`تمت إضافة الماكينة (${newDevice.name}) بنجاح.`);
  };

  const handleUpdateDevice = (updatedDevice: Device) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === updatedDevice.id ? updatedDevice : d))
    );
    showNotification(`تم تحديث إعدادات الماكينة (${updatedDevice.name}).`);
  };

  const handleDeleteDevice = (deviceId: number) => {
    setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    showNotification(`تم حذف الماكينة #${deviceId} من النظام.`);
  };

  // 12. Live Punch Received Handler
  const handleNewLiveRecord = (record: AttendanceRecord) => {
    setAttendanceRecords((prev) => [record, ...prev]);
  };

  // 13. Settings & Backup Handlers (Point 8: Sync Settings to Shift Engine)
  const handleUpdateSettings = (newSettings: FactorySettings) => {
    setSettings(newSettings);
    setShifts((prev) =>
      prev.map((s) => {
        if (s.id === 'standard') {
          return {
            ...s,
            startTime: newSettings.standardShiftStart || s.startTime,
            endTime: newSettings.standardShiftEnd || s.endTime,
            generalGraceMinutes: newSettings.defaultGraceMinutes ?? s.generalGraceMinutes,
          };
        }
        if (s.id === 'bangladeshi') {
          return {
            ...s,
            startTime: newSettings.bangladeshiShiftStart || s.startTime,
            endTime: newSettings.bangladeshiShiftEnd || s.endTime,
            generalGraceMinutes: newSettings.defaultGraceMinutes ?? s.generalGraceMinutes,
          };
        }
        return s;
      })
    );
    showNotification('تم حفظ إعدادات النظام ومواعيد الورديات وسياسات الحضور بنجاح.');
  };

  const handleExportAllData = () => {
    const backupPayload = {
      timestamp: new Date().toISOString(),
      version: '5.4.0',
      developer: 'Muhammad Abdullah',
      factorySettings: settings,
      devices,
      workers,
      shifts,
      gatePasses,
      attendanceRecords,
      absenceOverrides,
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_المصنع_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('تم تنزيل النسخة الاحتياطية بنجاح.');
  };

  const handleImportBackup = (jsonContent: string) => {
    try {
      const data = JSON.parse(jsonContent);
      if (data.devices) setDevices(data.devices);
      if (data.workers) setWorkers(data.workers);
      if (data.shifts) setShifts(data.shifts);
      if (data.gatePasses) setGatePasses(data.gatePasses);
      if (data.attendanceRecords) setAttendanceRecords(data.attendanceRecords);
      if (data.factorySettings) setSettings(data.factorySettings);
      if (data.absenceOverrides) {
        setAbsenceOverrides(data.absenceOverrides);
        localStorage.setItem('zkt_absence_overrides', JSON.stringify(data.absenceOverrides));
      }
      showNotification('تمت استعادة النسخة الاحتياطية وتحديث بيانات المصنع بنجاح!');
    } catch {
      showNotification('خطأ في قراءة ملف النسخة الاحتياطية. يرجى التأكد من صحة الملف.');
    }
  };

  const handleResetFactoryData = () => {
    setDevices(INITIAL_DEVICES);
    setWorkers(INITIAL_WORKERS);
    setAttendanceRecords(INITIAL_ATTENDANCE_RECORDS);
    setShifts(INITIAL_SHIFT_RULES);
    setGatePasses(INITIAL_GATE_PASSES);
    setSettings(DEFAULT_FACTORY_SETTINGS);
    showNotification('تمت إعادة ضبط البيانات إلى الوضع الافتراضي.');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white antialiased">
      {/* Header */}
      <Header
        devices={devices}
        onSyncAll={handleSyncAllDevices}
        isSyncing={isSyncing}
      />

      {/* Floating Global Notification (Zero Layout Shift - Floating Bottom-Right Corner) */}
      {globalNotice && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 max-w-md">
          <span className="font-medium leading-relaxed">{globalNotice}</span>
          <button onClick={() => setGlobalNotice(null)} className="text-slate-400 hover:text-white cursor-pointer mr-1">✕</button>
        </div>
      )}

      {/* Main Frame (Fixed Sidebar on Right, Scrollable Content on Left) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          logsCount={attendanceRecords.length}
          devicesCount={devices.length}
          workersCount={workers.length}
          gatePassesCount={gatePasses.length}
          activityLogs={activityLogs}
        />

        <main className="flex-1 p-5 overflow-y-auto bg-slate-950 min-h-0">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardHUD
                workers={workers}
                attendanceRecords={attendanceRecords}
                devices={devices}
                onNavigateToTab={(tab) => setActiveTab(tab)}
                onSyncDevices={handleSyncAllDevices}
              />
            )}



            {activeTab === 'devices' && (
              <DeviceManager
                devices={devices}
                workers={workers}
                onSyncDevice={handleSyncSingleDevice}
                onSyncAllDevices={handleSyncAllDevices}
                onImportUsbLogs={handleImportUsbLogs}
                onUpdateDevice={handleUpdateDevice}
                onAddDevice={handleAddDevice}
                onDeleteDevice={handleDeleteDevice}
                onImportWorkers={(newWorkers) => {
                  setWorkers((prev) => {
                    const workerMap = new Map<number, Worker>();
                    // Populate existing workers first indexed by code
                    for (const w of prev) {
                      workerMap.set(Number(w.code), { ...w });
                    }

                    for (const nw of newWorkers) {
                      const code = Number(nw.code);
                      if (!code) continue;

                      // Check if exists either by primary code or as an alias
                      let existing = workerMap.get(code);
                      if (!existing) {
                        for (const [, existingW] of workerMap.entries()) {
                          if (existingW.aliasCodes && existingW.aliasCodes.includes(code)) {
                            existing = existingW;
                            break;
                          }
                        }
                      }

                      if (existing) {
                        const mergedDeviceIds = Array.from(
                          new Set([...(existing.assignedDeviceIds || []), ...(nw.assignedDeviceIds || [])])
                        );
                        
                        // Check if nw.name from machine is a genuine name
                        const isNewNameValid = Boolean(
                          nw.name && 
                          nw.name.trim() !== '' && 
                          !nw.name.startsWith('عامل #') && 
                          !nw.name.startsWith('عامل كود') &&
                          nw.name.trim() !== String(code) &&
                          nw.name.trim().length > 1
                        );

                        // Check if existing worker in local database already has a genuine name
                        const existingHasRealName = Boolean(
                          existing.name &&
                          !existing.name.startsWith('عامل #') &&
                          !existing.name.startsWith('عامل كود') &&
                          existing.name.trim() !== String(existing.code) &&
                          existing.name.trim().length > 1
                        );

                        // CRITICAL: Protect existing real name if incoming is empty/generic from secondary machine
                        const finalName = existingHasRealName ? existing.name : (isNewNameValid ? nw.name.trim() : existing.name);
                        const isEnglishName = /^[A-Za-z\s.'-]+$/.test(finalName) && finalName.length > 2;

                        workerMap.set(existing.code, {
                          ...existing,
                          name: finalName,
                          assignedDeviceIds: mergedDeviceIds,
                          enrolledOnDeviceName: nw.enrolledOnDeviceName || existing.enrolledOnDeviceName,
                          nationality: isEnglishName ? 'بنغلاديشي' : (existing.nationality || 'مصري'),
                          shiftId: isEnglishName ? 'bangladeshi' : (existing.shiftId || 'standard'),
                          isNameSyncedToDevice: existingHasRealName || isNewNameValid,
                          hasFingerprint: existing.hasFingerprint || nw.hasFingerprint,
                          hasFace: existing.hasFace || nw.hasFace,
                        });
                      } else {
                        const isEnglishName = /^[A-Za-z\s.'-]+$/.test(nw.name) && nw.name.length > 2;
                        workerMap.set(code, {
                          ...nw,
                          code,
                          nationality: isEnglishName ? 'بنغلاديشي' : (nw.nationality || 'مصري'),
                          shiftId: isEnglishName ? 'bangladeshi' : (nw.shiftId || 'standard'),
                          assignedDeviceIds: nw.assignedDeviceIds || [],
                          enrolledOnDeviceName: nw.enrolledOnDeviceName,
                        });
                      }
                    }

                    return Array.from(workerMap.values()).sort((a, b) => a.code - b.code);
                  });
                  showNotification(`✅ تم سحب وتحديث بيانات العمال في قاعدة البيانات بنجاح (المفتاح الأساسي: UserId).`);
                }}
                onResetMockData={handleResetMockData}
              />
            )}

            {activeTab === 'logs' && (
              <AttendanceLogs
                records={attendanceRecords}
                workers={workers}
                devices={devices}
                shiftEndTime={settings.standardShiftEnd}
                settings={settings}
                auditLog={auditLog}
                gatePasses={gatePasses}
                onAddManualRecord={handleAddManualRecord}
                onUpdateRecord={handleUpdateRecord}
                onDeleteRecord={handleDeleteRecord}
                onAddAuditRecord={handleAddAuditRecord}
                onAddGatePass={handleAddGatePass}
              />
            )}

            {activeTab === 'workers' && (
              <WorkersManager
                workers={workers}
                devices={devices}
                onUpdateWorker={handleUpdateWorker}
                onAddWorker={handleAddWorker}
                onDeleteWorker={handleDeleteWorker}
                onMergeWorkers={handleMergeWorkers}
              />
            )}

            {activeTab === 'gatepasses' && (
              <GatePassManager
                gatePasses={gatePasses}
                workers={workers}
                onAddGatePass={handleAddGatePass}
                onCompleteGatePass={handleCompleteGatePass}
                onUpdateGatePass={handleUpdateGatePass}
                onDeleteGatePass={handleDeleteGatePass}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsCenter
                workers={workers}
                attendanceRecords={attendanceRecords}
                shifts={shifts}
                gatePasses={gatePasses}
                devices={devices}
                settings={settings}
                factoryName={settings.factoryName}
                absenceOverrides={absenceOverrides}
                onUpdateAbsenceOverrides={handleUpdateAbsenceOverrides}
                onSyncDevices={handleSyncAllDevices}
                isSyncing={isSyncing}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsManager
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onExportAllData={handleExportAllData}
                onImportBackup={handleImportBackup}
                onResetFactoryData={handleResetFactoryData}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
