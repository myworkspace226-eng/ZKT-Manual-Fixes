import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { AttendanceRecord, ShiftRule, Worker } from '../types';

/**
 * Smart logic to resolve whether a punch is IN or OUT, fixing old ZKTeco hardware button glitches.
 * If someone punches at 07:45 AM, it is guaranteed to be a CHECK-IN regardless of machine button state.
 */
export function resolveSmartPunchState(
  timeStr: string, // "HH:mm:ss" or ISO string
  rawState: 'IN' | 'OUT',
  shift: ShiftRule
): { resolvedState: 'IN' | 'OUT'; autoCorrected: boolean; reason: string } {
  let hours = 8;
  let minutes = 0;

  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    hours = d.getHours();
    minutes = d.getMinutes();
  } else if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    hours = parseInt(parts[0], 10) || 8;
    minutes = parseInt(parts[1], 10) || 0;
  }

  const decimalHour = hours + minutes / 60;

  // Morning Check-In window: 06:00 AM to 11:59 AM (Rule 1)
  if (decimalHour >= 6.0 && decimalHour < 12.0) {
    if (rawState === 'OUT') {
      return {
        resolvedState: 'IN',
        autoCorrected: true,
        reason: 'تم التصحيح تلقائياً: البصمة في نافذة الحضور الصباحية (06:00 - 11:59)',
      };
    }
    return { resolvedState: 'IN', autoCorrected: false, reason: 'حضور طبيعي (نافذة الصباح)' };
  }

  // Afternoon Check-Out window: 16:00 to 23:59 or early morning overnight (Rule 5)
  if (decimalHour >= 16.0 || decimalHour < 6.0) {
    if (rawState === 'IN') {
      return {
        resolvedState: 'OUT',
        autoCorrected: true,
        reason: 'تم التصحيح تلقائياً: البصمة في نافذة الانصراف (16:00 فما بعد)',
      };
    }
    return { resolvedState: 'OUT', autoCorrected: false, reason: 'انصراف طبيعي' };
  }

  // Ambiguous Mid-shift window: 12:00 to 15:59 (Rule 4)
  return { 
    resolvedState: rawState, 
    autoCorrected: false, 
    reason: 'نافذة الغموض والتصاريح (12:00 - 15:59) - بانتظار تحديد HR' 
  };
}

/**
 * Smart Attendance Processing Engine (خوارزمية معالجة البصمات الذكية الاحترافية)
 * 1. 1-Hour Cooldown Deduplication: Ignore any punch occurring within < 60 minutes of previous accepted punch.
 * 2. Overnight Shifts Attachment: Punches between 00:00 and 05:59 AM attach to previous day as OUT if worker was checked in.
 * 3. First & Last Punch: 1st punch = IN, last punch = OUT, intermediate punches = ignored.
 * 4. Missed Punch Exceptions: Mark single punch days as isMissedPunch without guessing fake times.
 * 5. HR Override Protection: isHROverride / isManual records are preserved exactly as set by HR.
 */
export interface SmartAttendanceOptions {
  shiftEndTime?: string; // e.g. "16:30"
  shiftStartTime?: string; // e.g. "08:00"
  bangladeshiShiftEnd?: string; // e.g. "18:30"
  bangladeshiShiftStart?: string; // e.g. "08:00"
  earlyDepartureWindowMinutes?: number; // e.g. 30
  duplicateWindowMinutes?: number; // default 60 min
  overtimeGraceMinutes?: number; // default 30 min
  overnightCutoffHour?: number; // e.g. 6 (06:00 AM)
  shifts?: ShiftRule[];
  fridayMultiplier?: number;
  workers?: Worker[];
  workerMap?: Map<number, Worker>;
  now?: Date;
}

/**
 * Smart Attendance Processing Engine (محرك الحضور والانصراف الاحترافي - V 5.0)
 * 1. Morning Check-in Window (06:00 - 11:59): First punch of the day is IN.
 * 2. Duplicate Rule: Configurable cooldown (default 60 min). Punches within window are ignored, EXCEPT returns from permissions.
 * 3. Early OUT Rule: Second punch after morning check-in (exceeding duplicate window) is considered OUT.
 * 4. Ambiguous Window (12:00 - 15:59): PENDING_DECISION unless resolved as temporary_pass or final_out.
 * 5. Post-12 PM Rule (16:00 onwards): Default is OUT. If no morning IN exists -> missingInPunch = true (Red Alert).
 * 6. Overtime Logic: 30-min grace after shift end (16:30 Egyptians, 18:30 Bengalis). If exceeded, counted from shift end!
 * 7. HR Override & Audit: Manual edits/overrides are strictly respected and protected.
 */
export function processSmartAttendanceLogs(
  records: AttendanceRecord[],
  options?: SmartAttendanceOptions
): AttendanceRecord[] {
  if (!records || records.length === 0) return [];

  const now = options?.now || new Date();
  const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

  // Local YYYY-MM-DD
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  const defaultShiftEndStr = options?.shiftEndTime || '16:30';
  const bangladeshiShiftEndStr = options?.bangladeshiShiftEnd || '18:30';
  const overnightCutoff = options?.overnightCutoffHour ?? 6;
  const duplicateWindowMinutes = options?.duplicateWindowMinutes ?? 60;
  const duplicateWindowMs = duplicateWindowMinutes * 60 * 1000;
  const overtimeGraceMinutes = options?.overtimeGraceMinutes ?? 30;

  // Build lookup map for workers if provided
  const workerLookup = options?.workerMap || (options?.workers ? new Map(options.workers.map((w) => [w.code, w])) : null);

  // Group records by workerCode
  const workerGroups = new Map<number, AttendanceRecord[]>();
  for (const r of records) {
    let list = workerGroups.get(r.workerCode);
    if (!list) {
      list = [];
      workerGroups.set(r.workerCode, list);
    }
    list.push({ ...r });
  }

  const processedAll: AttendanceRecord[] = [];

  workerGroups.forEach((workerRecords, workerCode) => {
    // Determine worker specific shift
    const workerObj = workerLookup?.get(workerCode);
    const isBengali = workerObj?.nationality === 'بنغلاديشي' || workerObj?.shiftId === 'bangladeshi';
    const effectiveShiftEndStr = isBengali ? bangladeshiShiftEndStr : defaultShiftEndStr;

    const [endH, endM] = effectiveShiftEndStr.split(':').map((v) => parseInt(v, 10) || 0);
    const shiftEndTotalMinutes = endH * 60 + endM;

    // 1. Sort all punches for this worker chronologically
    workerRecords.sort((a, b) => {
      const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
      const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
      if (isNaN(tA) || isNaN(tB)) return (a.id || '').localeCompare(b.id || '');
      return tA - tB;
    });

    // 2. Work Day Assignment (06:00 cutoff: punches between 00:00 and 05:59 belong to previous work day)
    const dayPunchesMap = new Map<string, AttendanceRecord[]>();

    for (const rec of workerRecords) {
      const [hStr] = (rec.displayTime || '08:00').split(':');
      const hours = parseInt(hStr, 10) || 0;
      let targetWorkDay = rec.displayDate;

      // Punches between 00:00 and 05:59 belong to previous work day shift
      if (hours < overnightCutoff) {
        const curDate = new Date(`${rec.displayDate}T12:00:00`);
        curDate.setDate(curDate.getDate() - 1);
        targetWorkDay = curDate.toISOString().slice(0, 10);
      }

      let dList = dayPunchesMap.get(targetWorkDay);
      if (!dList) {
        dList = [];
        dayPunchesMap.set(targetWorkDay, dList);
      }
      dList.push(rec);
    }

    // 3. Process each work day independently
    dayPunchesMap.forEach((punchesOnDay, workDay) => {
      punchesOnDay.sort((a, b) => {
        const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
        const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
        return tA - tB;
      });

      // Deduplication using Cooldown with Permission Return Exception (Point 2 & Point 4)
      const acceptedPunches: AttendanceRecord[] = [];
      let lastAcceptedTime: number | null = null;
      let lastAcceptedWasPassExit = false;

      for (const rec of punchesOnDay) {
        // HR Override is always authoritative and protected (Point 7)
        if (rec.isHROverride || (rec.isManual && rec.resolvedState)) {
          rec.isDuplicateIgnored = false;
          acceptedPunches.push(rec);
          const t = new Date(`${rec.displayDate}T${rec.displayTime}:00`).getTime();
          if (!isNaN(t)) lastAcceptedTime = t;
          lastAcceptedWasPassExit = rec.ambiguousResolution === 'temporary_pass';
          continue;
        }

        const punchTime = new Date(`${rec.displayDate}T${rec.displayTime}:00`).getTime();
        if (isNaN(punchTime)) {
          acceptedPunches.push(rec);
          continue;
        }

        // Exception: Return from temporary permission pass bypasses duplicate cooldown (Point 4)
        const isReturnFromPass = rec.isReturnFromPass || Boolean(rec.linkedPermissionId) || lastAcceptedWasPassExit;

        if (lastAcceptedTime !== null && (punchTime - lastAcceptedTime) < duplicateWindowMs && !isReturnFromPass) {
          rec.isDuplicateIgnored = true;
          rec.duplicateReason = `تكرار بصمة (أقل من ${duplicateWindowMinutes} دقيقة)`;
          processedAll.push(rec);
        } else {
          rec.isDuplicateIgnored = false;
          acceptedPunches.push(rec);
          lastAcceptedTime = punchTime;
          lastAcceptedWasPassExit = rec.ambiguousResolution === 'temporary_pass';
        }
      }

      const isToday = workDay === todayStr;
      const isPastShiftEnd = isToday ? nowTotalMinutes >= shiftEndTotalMinutes : true;

      const punchDate = new Date(`${workDay}T12:00:00`);
      const isFriday = punchDate.getDay() === 5;
      const workerShift = workerObj ? options?.shifts?.find((s) => s.id === workerObj.shiftId) : null;
      const effectiveFridayMultiplier = workerShift?.fridayMultiplier ?? options?.fridayMultiplier ?? 2.0;

      if (isFriday) {
        for (const p of acceptedPunches) {
          p.isFridayDouble = true;
          p.fridayMultiplier = effectiveFridayMultiplier;
        }
      }

      // Helper for Overtime on departure punches (Point 6: Factory Logic)
      const evaluateOvertime = (punch: AttendanceRecord, punchMinutes: number) => {
        if (isFriday) {
          punch.isFridayDouble = true;
          punch.fridayMultiplier = effectiveFridayMultiplier;
        }

        if (punch.isHROverride && punch.overtimeHours !== undefined) {
          punch.isOvertime = punch.overtimeHours > 0;
          return;
        }

        if (isFriday) {
          punch.isOvertime = true;
          punch.overtimeHours = 8 * effectiveFridayMultiplier;
          return;
        }

        // If departure is past shiftEnd + overtimeGraceMinutes (e.g. 30 mins)
        const minutesPastEnd = punchMinutes - shiftEndTotalMinutes;
        if (minutesPastEnd > overtimeGraceMinutes) {
          // Counter starts from shiftEnd itself!
          const otHours = Number((minutesPastEnd / 60).toFixed(2));
          punch.isOvertime = true;
          punch.overtimeHours = otHours;
        } else {
          punch.isOvertime = false;
          punch.overtimeHours = 0;
        }
      };

      // Helper for Early Departure on OUT punches
      const evaluateEarlyDeparture = (punch: AttendanceRecord, punchMinutes: number) => {
        if (punch.isHROverride) return;
        if (punchMinutes < shiftEndTotalMinutes) {
          const diff = shiftEndTotalMinutes - punchMinutes;
          punch.isEarlyDeparture = true;
          punch.earlyDepartureMinutes = diff;
          punch.earlyDepartureReason = `انصراف مبكر (-${diff} د) قبل موعد نهاية الوردية (${effectiveShiftEndStr})`;
        } else {
          punch.isEarlyDeparture = false;
          punch.earlyDepartureMinutes = 0;
          punch.earlyDepartureReason = undefined;
        }
      };

      // Classification based on V5.0 Windows
      if (acceptedPunches.length === 0) return;

      if (acceptedPunches.length === 1) {
        const p = acceptedPunches[0];
        const [pHStr, pMStr] = (p.displayTime || '08:00').split(':');
        const pH = parseInt(pHStr, 10) || 8;
        const pM = parseInt(pMStr, 10) || 0;
        const pMinutes = pH * 60 + pM;

        if (p.isHROverride) {
          p.isAmbiguousSinglePunch = false;
          if (p.resolvedState === 'IN') {
            p.missingInPunch = false;
            if (isPastShiftEnd) {
              p.isMissedPunch = true;
              p.missedPunchType = 'OUT';
              p.missedPunchReason = 'بصمة انصراف مفقودة (تم تسجيل الحضور يدوياً)';
            }
          } else {
            evaluateEarlyDeparture(p, pMinutes);
            evaluateOvertime(p, pMinutes);
          }
          processedAll.push(p);
          return;
        }

        // Rule 1: Morning Check-in Window (06:00 to 11:59 -> 360 to 719 minutes)
        if (pMinutes >= 360 && pMinutes < 720) {
          p.resolvedState = 'IN';
          p.isAmbiguousSinglePunch = false;
          p.missingInPunch = false;
          if (isPastShiftEnd) {
            p.isMissedPunch = true;
            p.missedPunchType = 'OUT';
            p.missedPunchReason = 'بصمة انصراف مفقودة (لم يسجل خروج)';
          } else {
            p.isMissedPunch = false;
            p.missedPunchReason = undefined;
          }
          p.isEarlyDeparture = false;
        }
        // Rule 4: Ambiguous Window (12:00 to 15:59 -> 720 to 959 minutes) (Bug 2 Fix: 3 Options)
        else if (pMinutes >= 720 && pMinutes < 960) {
          if (p.ambiguousResolution === 'temporary_pass') {
            p.resolvedState = 'OUT';
            p.isAmbiguousSinglePunch = false;
            p.missingInPunch = false;
            p.isMissedPunch = false;
            p.manualNote = p.manualNote || `تصريح مؤقت (عودة متوقعة: ${p.expectedReturnTime || '-'})`;
          } else if (p.ambiguousResolution === 'final_out') {
            p.resolvedState = 'OUT';
            p.isAmbiguousSinglePunch = false;
            p.missingInPunch = false;
            p.isMissedPunch = false;
            evaluateEarlyDeparture(p, pMinutes);
          } else if (p.ambiguousResolution === 'late_in') {
            p.resolvedState = 'IN';
            p.isAmbiguousSinglePunch = false;
            p.missingInPunch = false;
            p.isMissedPunch = false;
            const [sH, sM] = (options?.shiftStartTime || '08:00').split(':').map((v) => parseInt(v, 10) || 0);
            const shiftStartMinutes = sH * 60 + sM;
            const diff = Math.max(0, pMinutes - shiftStartMinutes);
            p.lateMinutes = diff;
            p.manualNote = p.manualNote || `اعتماد حضور متأخر (+${diff} د) من قِبل HR`;
          } else {
            // Unresolved: Popup required for HR decision (3 options: temporary_pass / final_out / late_in)
            p.isAmbiguousSinglePunch = true;
            p.ambiguousResolution = 'pending';
            p.isMissedPunch = true;
            p.missedPunchType = 'AMBIGUOUS';
            p.missedPunchReason = 'بصمة في نافذة الغموض (12:00-15:59) - تتطلب قرار HR (تصريح مؤقت / انصراف نهائي / حضور متأخر)';
          }
        }
        // Rule 5: Post-12 PM / Afternoon Window (16:00 onwards -> >= 960 minutes or early morning < 360)
        else {
          p.resolvedState = 'OUT';
          p.isAmbiguousSinglePunch = false;
          // Warning: No morning IN punch exists on this work day -> Flag Missing IN (Point 5)
          p.missingInPunch = true;
          p.isMissedPunch = true;
          p.missedPunchType = 'IN';
          p.missedPunchReason = 'بصمة حضور ناقصة (Missing IN)';
          evaluateEarlyDeparture(p, pMinutes);
          evaluateOvertime(p, pMinutes);
        }

        processedAll.push(p);

      } else {
        // 2 or more accepted punches on this work day
        const first = acceptedPunches[0];
        const [fHStr, fMStr] = (first.displayTime || '08:00').split(':');
        const fMinutes = (parseInt(fHStr, 10) || 8) * 60 + (parseInt(fMStr, 10) || 0);

        // Check if first punch was morning check-in (Rule 1)
        if (!first.isHROverride) {
          if (fMinutes >= 360 && fMinutes < 720) {
            first.resolvedState = 'IN';
            first.missingInPunch = false;
            first.isAmbiguousSinglePunch = false;
            first.isMissedPunch = false;
          } else if (fMinutes >= 720 && fMinutes < 960) {
            // First punch falls in ambiguous window (Bug 2 & 3: Respect HR decision)
            if (first.ambiguousResolution === 'late_in') {
              first.resolvedState = 'IN';
              first.isAmbiguousSinglePunch = false;
              first.missingInPunch = false;
              first.isMissedPunch = false;
              const [sH, sM] = (options?.shiftStartTime || '08:00').split(':').map((v) => parseInt(v, 10) || 0);
              const shiftStartMinutes = sH * 60 + sM;
              const diff = Math.max(0, fMinutes - shiftStartMinutes);
              first.lateMinutes = diff;
              first.manualNote = first.manualNote || `اعتماد حضور متأخر (+${diff} د) من قِبل HR`;
            } else if (first.ambiguousResolution === 'temporary_pass' || first.ambiguousResolution === 'final_out') {
              first.resolvedState = 'OUT';
              first.isAmbiguousSinglePunch = false;
              first.isMissedPunch = false;
            } else {
              first.isAmbiguousSinglePunch = true;
              first.ambiguousResolution = 'pending';
              first.isMissedPunch = true;
              first.missedPunchType = 'AMBIGUOUS';
              first.missedPunchReason = 'بصمة في نافذة الغموض (12:00-15:59) - تتطلب قرار HR (تصريح مؤقت / انصراف نهائي / حضور متأخر)';
            }
          } else {
            first.resolvedState = 'OUT';
            first.missingInPunch = true;
            first.isAmbiguousSinglePunch = false;
            first.missedPunchReason = 'بصمة حضور ناقصة (Missing IN)';
          }
        }
        first.isDuplicateIgnored = false;
        processedAll.push(first);

        const last = acceptedPunches[acceptedPunches.length - 1];
        const [lHStr, lMStr] = (last.displayTime || '16:30').split(':');
        const lMinutes = (parseInt(lHStr, 10) || 16) * 60 + (parseInt(lMStr, 10) || 30);

        // Bug 3 Fix: If second (or last) punch falls in ambiguous window (12:00 - 15:59),
        // FORBIDDEN to automatically consider it OUT! It MUST prompt HR with the 3 options.
        if (!last.isHROverride) {
          if (lMinutes >= 720 && lMinutes < 960) {
            // Ambiguous window!
            if (last.ambiguousResolution === 'temporary_pass') {
              last.resolvedState = 'OUT';
              last.isAmbiguousSinglePunch = false;
              last.isMissedPunch = false;
              last.manualNote = last.manualNote || `تصريح مؤقت (عودة متوقعة: ${last.expectedReturnTime || '-'})`;
            } else if (last.ambiguousResolution === 'final_out') {
              last.resolvedState = 'OUT';
              last.isAmbiguousSinglePunch = false;
              last.isMissedPunch = false;
              evaluateEarlyDeparture(last, lMinutes);
            } else if (last.ambiguousResolution === 'late_in') {
              last.resolvedState = 'IN';
              last.isAmbiguousSinglePunch = false;
              last.isMissedPunch = false;
              const [sH, sM] = (options?.shiftStartTime || '08:00').split(':').map((v) => parseInt(v, 10) || 0);
              const shiftStartMinutes = sH * 60 + sM;
              const diff = Math.max(0, lMinutes - shiftStartMinutes);
              last.lateMinutes = diff;
              last.manualNote = last.manualNote || `اعتماد حضور متأخر (+${diff} د) من قِبل HR`;
            } else {
              // Not resolved yet: Prompt HR!
              last.isAmbiguousSinglePunch = true;
              last.ambiguousResolution = 'pending';
              last.isMissedPunch = true;
              last.missedPunchType = 'AMBIGUOUS';
              last.missedPunchReason = 'بصمة في نافذة الغموض (12:00-15:59) - تتطلب قرار HR (تصريح مؤقت / انصراف نهائي / حضور متأخر)';
            }
          } else if (lMinutes >= 960) {
            // Post-12 PM / Afternoon checkout window (16:00 onwards)
            last.resolvedState = 'OUT';
            last.isAmbiguousSinglePunch = false;
            last.isMissedPunch = false;
            evaluateEarlyDeparture(last, lMinutes);
            evaluateOvertime(last, lMinutes);
          } else {
            // Rule 3: Second punch in morning (< 12:00) with cooldown satisfied is early OUT
            last.resolvedState = 'OUT';
            last.isAmbiguousSinglePunch = false;
            last.isMissedPunch = false;
            evaluateEarlyDeparture(last, lMinutes);
          }
        }
        last.isDuplicateIgnored = false;
        processedAll.push(last);

        // Intermediate punches (Punches between first and last)
        for (let i = 1; i < acceptedPunches.length - 1; i++) {
          const mid = acceptedPunches[i];
          const [mHStr, mMStr] = (mid.displayTime || '12:00').split(':');
          const mMinutes = (parseInt(mHStr, 10) || 12) * 60 + (parseInt(mMStr, 10) || 0);

          // If intermediate punch was a temporary pass or return from pass (Point 4)
          if (mid.isHROverride) {
            mid.isDuplicateIgnored = false;
          } else if (mid.ambiguousResolution === 'temporary_pass') {
            mid.resolvedState = 'OUT';
            mid.isDuplicateIgnored = false;
            mid.isAmbiguousSinglePunch = false;
            mid.isMissedPunch = false;
          } else if (mid.ambiguousResolution === 'final_out') {
            mid.resolvedState = 'OUT';
            mid.isDuplicateIgnored = false;
            mid.isAmbiguousSinglePunch = false;
            mid.isMissedPunch = false;
          } else if (mid.ambiguousResolution === 'late_in') {
            mid.resolvedState = 'IN';
            mid.isDuplicateIgnored = false;
            mid.isAmbiguousSinglePunch = false;
            mid.isMissedPunch = false;
          } else if (mid.isReturnFromPass) {
            mid.resolvedState = 'IN';
            mid.isDuplicateIgnored = false;
            mid.isAmbiguousSinglePunch = false;
            mid.isMissedPunch = false;
          } else if (mMinutes >= 720 && mMinutes < 960) {
            // Bug 3: Intermediate punch in ambiguous window that hasn't been decided yet
            mid.isAmbiguousSinglePunch = true;
            mid.ambiguousResolution = 'pending';
            mid.isMissedPunch = true;
            mid.missedPunchType = 'AMBIGUOUS';
            mid.missedPunchReason = 'بصمة بينية في نافذة الغموض (12:00-15:59) - تتطلب قرار HR (تصريح مؤقت / انصراف نهائي / حضور متأخر)';
            mid.isDuplicateIgnored = false;
          } else {
            // General intermediate punch outside ambiguous window
            mid.isDuplicateIgnored = true;
            mid.duplicateReason = 'بصمة بينية (تم اعتماد الأولى كحضور والأخيرة كانصراف)';
          }
          processedAll.push(mid);
        }
      }
    });
  });

  // Sort overall descending by date/time
  processedAll.sort((a, b) => {
    const tA = new Date(`${a.displayDate}T${a.displayTime}:00`).getTime();
    const tB = new Date(`${b.displayDate}T${b.displayTime}:00`).getTime();
    if (isNaN(tA) || isNaN(tB)) return (b.id || '').localeCompare(a.id || '');
    return tB - tA;
  });

  return processedAll;
}

/**
 * Filter out duplicate consecutive punches made within cooldown window (e.g. 60 minutes).
 */
export function markDuplicatePunches(
  records: AttendanceRecord[],
  cooldownMinutes: number = 60
): AttendanceRecord[] {
  return processSmartAttendanceLogs(records, { duplicateWindowMinutes: cooldownMinutes });
}

/**
 * Calculate worker daily attendance performance, overtime, and late minutes.
 * Incorporates Point 6: factory departure grace (30 min). If exceeded, overtime is counted from shift end!
 */
export function calculateDailyPerformance(
  worker: Worker,
  checkIn: AttendanceRecord | undefined,
  checkOut: AttendanceRecord | undefined,
  shift: ShiftRule,
  isFriday: boolean = false,
  departureGraceMinutes: number = 30
) {
  if (!checkIn) {
    return {
      status: 'غائب',
      workHours: 0,
      overtimeHours: 0,
      lateMinutes: 0,
      notes: 'لم يسجل حضور',
    };
  }

  const checkInDate = new Date(checkIn.timestamp);
  const inHours = checkInDate.getHours() + checkInDate.getMinutes() / 60;

  // Shift start in decimal
  const [startH, startM] = shift.startTime.split(':').map(Number);
  const shiftStartDecimal = startH + startM / 60;

  // Total allowed grace (General grace + Worker's specific custom grace)
  const totalGraceMinutes = shift.generalGraceMinutes + (worker.customGraceMinutes || 0);
  const graceThresholdDecimal = shiftStartDecimal + totalGraceMinutes / 60;

  let lateMinutes = 0;
  if (inHours > graceThresholdDecimal) {
    lateMinutes = Math.round((inHours - shiftStartDecimal) * 60);
  }

  // Work hours & Overtime
  let workHours = 0;
  let overtimeHours = 0;

  if (checkOut) {
    const checkOutDate = new Date(checkOut.timestamp);
    let diffMs = checkOutDate.getTime() - checkInDate.getTime();

    // If overnight shift (checkout is next morning e.g. 05:40 AM)
    if (diffMs < 0) {
      diffMs += 24 * 3600 * 1000;
    }

    const totalRawHours = diffMs / (1000 * 3600);
    // Deduct 30 min break if worked more than 5 hours
    const netHours = totalRawHours > 5 ? totalRawHours - 0.5 : totalRawHours;

    const [endH, endM] = shift.endTime.split(':').map(Number);
    const standardShiftHours = (endH + endM / 60) - (startH + startM / 60) - (shift.breakDurationMinutes / 60);

    // Calculate checkout minutes past scheduled shift end
    const checkOutMinutesOfDay = checkOutDate.getHours() * 60 + checkOutDate.getMinutes();
    const scheduledEndMinutesOfDay = endH * 60 + endM;
    let minutesPastShiftEnd = checkOutMinutesOfDay - scheduledEndMinutesOfDay;
    if (minutesPastShiftEnd < -720) {
      // Overnight
      minutesPastShiftEnd += 1440;
    }

    if (isFriday) {
      // Friday 2x rule: Basic is 16 hours
      workHours = 8 * shift.fridayMultiplier;
      overtimeHours = Math.max(0, netHours - 8) * shift.fridayMultiplier;
    } else {
      workHours = Math.min(netHours, standardShiftHours);

      // Point 13: Factory Departure Grace Logic
      // If worker punches out within departureGraceMinutes (e.g. 16:30 - 16:45), this is normal departure queue -> 0 overtime
      if (minutesPastShiftEnd > departureGraceMinutes) {
        // Legitimate overtime beyond departure queue window
        const otHours = minutesPastShiftEnd / 60;
        overtimeHours = Number(otHours.toFixed(2));
      } else {
        overtimeHours = 0;
      }
    }
  } else {
    // Punched in but hasn't punched out yet
    workHours = 8;
  }

  const isEarly = Boolean(checkOut?.isEarlyDeparture);
  const earlyMin = checkOut?.earlyDepartureMinutes || 0;

  let statusText = lateMinutes > 0 ? 'حاضر متأخر' : 'حاضر في الموعد';
  if (isEarly && earlyMin > 0) {
    statusText = `حاضر (انصراف مبكر -${earlyMin} د)`;
  }

  return {
    status: statusText,
    workHours: Number(workHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    lateMinutes,
    isEarlyDeparture: isEarly,
    earlyDepartureMinutes: earlyMin,
    notes: isFriday 
      ? 'عمل يوم الجمعة (مضاعف 2x - 16 ساعة)' 
      : isEarly 
      ? `انصراف مبكر (-${earlyMin} دقيقة)` 
      : '',
  };
}

/**
 * Point 11: Export formatted Microsoft Excel (.xlsx) file
 * Features:
 * - Proper RTL sheet view (right-to-left layout for Arabic text)
 * - Dynamic column width calculation with generous padding so text doesn't truncate or display "###"
 * - AutoFilter headers
 * - Also provides rich HTML-formatted corporate Excel table fallback
 */
export function exportToExcel(
  data: Record<string, any>[], 
  sheetName: string, 
  fileName: string, 
  reportTitle?: string
) {
  if (!data || data.length === 0) return;

  try {
    const ws = XLSX.utils.json_to_sheet(data);

    // 1. Right-to-Left (RTL) mode for Arabic
    ws['!views'] = [{ RTL: true }];

    // 2. Auto-compute column widths based on longest cell content in each column
    const keys = Object.keys(data[0] || {});
    const colWidths = keys.map((key) => {
      let maxLen = key.length * 1.5;
      for (const row of data) {
        const val = row[key];
        if (val !== undefined && val !== null) {
          const str = String(val);
          if (str.length * 1.3 > maxLen) {
            maxLen = str.length * 1.3;
          }
        }
      }
      return { wch: Math.max(Math.ceil(maxLen) + 3, 14) };
    });
    ws['!cols'] = colWidths;

    // 3. Set row heights
    ws['!rows'] = [{ hpt: 26 }, ...Array(data.length).fill({ hpt: 20 })];

    // 4. Set AutoFilter on table headers
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (error) {
    console.error('Error in standard XLSX export, trying styled HTML table export:', error);
    exportStyledExcel(data, fileName, reportTitle || sheetName);
  }
}

/**
 * Point 11: Professional HTML/XML-based Spreadsheet Export with soothing, eye-pleasing colors
 * (Opens natively in Microsoft Excel with 100% full CSS styling, RTL, borders, and colors)
 */
export function exportStyledExcel(
  data: Record<string, any>[], 
  fileName: string, 
  title: string = 'تقرير النظام'
) {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const currentDate = new Date().toLocaleDateString('ar-EG');
  const currentTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${title.slice(0, 31)}</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { font-family: 'Segoe UI', 'Cairo', Tahoma, sans-serif; direction: rtl; }
    table { border-collapse: collapse; width: 100%; direction: rtl; }
    .header-banner { background-color: #0f172a; color: #38bdf8; font-size: 16pt; font-weight: bold; text-align: center; padding: 12px; }
    .meta-bar { background-color: #f1f5f9; color: #475569; font-size: 10pt; padding: 6px 12px; text-align: right; border-bottom: 2px solid #cbd5e1; }
    th { background-color: #1e293b; color: #ffffff; font-weight: bold; font-size: 11pt; padding: 10px 8px; border: 1px solid #334155; text-align: center; }
    td { padding: 8px 10px; font-size: 10pt; border: 1px solid #e2e8f0; text-align: right; }
    tr:nth-child(even) { background-color: #f8fafc; }
    tr:hover { background-color: #f1f5f9; }
    .center { text-align: center; }
    .number { font-family: 'JetBrains Mono', 'Consolas', monospace; direction: ltr; text-align: center; font-weight: bold; }
    .badge-success { background-color: #dcfce7; color: #15803d; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
    .badge-danger { background-color: #fee2e2; color: #b91c1c; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
    .badge-warning { background-color: #fef3c7; color: #b45309; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
    .badge-info { background-color: #e0f2fe; color: #0369a1; font-weight: bold; border-radius: 4px; padding: 2px 6px; }
  </style>
</head>
<body>
  <table>
    <tr>
      <td colspan="${headers.length}" class="header-banner">${title}</td>
    </tr>
    <tr>
      <td colspan="${headers.length}" class="meta-bar">
        تاريخ الاستخراج: ${currentDate} ${currentTime} | نظام إدارة ماكينات البصمة - المطور: Muhammad Abdullah | إجمالي السجلات: ${data.length}
      </td>
    </tr>
    <tr>
      ${headers.map((h) => `<th>${h}</th>`).join('')}
    </tr>
    ${data
      .map((row) => {
        return `<tr>
          ${headers
            .map((h) => {
              const val = row[h] ?? '';
              const strVal = String(val);
              let cellClass = '';
              if (/حاضر|معتمد|نشط|مكتمل/.test(strVal)) cellClass = 'class="center badge-success"';
              else if (/غائب|بدون إذن|فشل|غير متصل/.test(strVal)) cellClass = 'class="center badge-danger"';
              else if (/متأخر|أثر رجعي|ساري|عارضة/.test(strVal)) cellClass = 'class="center badge-warning"';
              else if (/إضافي|مأمورية|اعتيادي/.test(strVal)) cellClass = 'class="center badge-info"';
              else if (typeof val === 'number' || /^\d+(\.\d+)?(\s*(س|د|ج\.م|%))?$/.test(strVal)) cellClass = 'class="number"';
              return `<td ${cellClass}>${val}</td>`;
            })
            .join('')}
        </tr>`;
      })
      .join('')}
  </table>
</body>
</html>`;

  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Fallback CSV export
 */
export function exportToCsv(data: Record<string, any>[], fileName: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => `"${row[h] ?? ''}"`).join(','));
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DailyAbsenceExportItem {
  index: number;
  code: number;
  name: string;
  department: string;
  line: string;
  jobTitle: string;
  nationality: string;
  absenceCategory: string;
  absenceKey: string;
  note: string;
}

export interface DailyAbsenceExportData {
  factoryName: string;
  reportDate: string;
  totalWorkers: number;
  presentCount: number;
  absentCount: number;
  presentPercent: string;
  absentPercent: string;
  records: DailyAbsenceExportItem[];
}

/**
 * Professional ERP-Style Excel Export for Daily Absence Reports
 * Uses ExcelJS for native formatting, RTL direction, merged headers, summary KPIs, cell borders, and colors.
 */
export async function exportProfessionalAbsenceExcel(
  info: DailyAbsenceExportData,
  fileName: string
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'نظام إدارة ماكينات البصمة';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('تقرير الغياب اليومي', {
    views: [{ rightToLeft: true } as any],
  });

  // 1. Row 1: Merged Title (Factory Name + Report Title + Date)
  worksheet.mergeCells('A1:I1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `${info.factoryName || 'إدارة المصنع'} — تقرير الغياب اليومي (${info.reportDate})`;
  titleCell.font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Dark slate
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 36;

  // 2. Row 2: Spacer
  worksheet.getRow(2).height = 8;

  // 3. Row 3: Executive Summary Row (Total Workers, Present, Absent, Rates)
  worksheet.mergeCells('A3:B3');
  const sumTotal = worksheet.getCell('A3');
  sumTotal.value = `إجمالي القوة: ${info.totalWorkers} عامل`;
  sumTotal.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
  sumTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sumTotal.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('C3:D3');
  const sumPresent = worksheet.getCell('C3');
  sumPresent.value = `الحضور الفعلي: ${info.presentCount} (${info.presentPercent}%)`;
  sumPresent.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
  sumPresent.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  sumPresent.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('E3:F3');
  const sumAbsent = worksheet.getCell('E3');
  sumAbsent.value = `إجمالي الغياب: ${info.absentCount} (${info.absentPercent}%)`;
  sumAbsent.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  sumAbsent.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  sumAbsent.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('G3:I3');
  const sumDate = worksheet.getCell('G3');
  sumDate.value = `تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
  sumDate.font = { name: 'Segoe UI', size: 9, bold: false, color: { argb: 'FF475569' } };
  sumDate.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  sumDate.alignment = { vertical: 'middle', horizontal: 'center' };

  // Set borders for Row 3 summary cells
  ['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3', 'I3'].forEach((addr) => {
    worksheet.getCell(addr).border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  worksheet.getRow(3).height = 26;

  // 4. Row 4: Spacer
  worksheet.getRow(4).height = 10;

  // 5. Row 5: Table Column Headers
  const headerRow = worksheet.getRow(5);
  headerRow.values = [
    'م',
    'كود العامل',
    'اسم العامل',
    'القسم',
    'خط الإنتاج',
    'الوظيفة',
    'الجنسية',
    'تصنيف الغياب',
    'ملاحظات / سبب الغياب',
  ];
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Dark blue / navy
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  // 6. Data Rows
  let currentRowIdx = 6;
  for (const r of info.records) {
    const row = worksheet.getRow(currentRowIdx);
    row.values = [
      r.index,
      r.code,
      r.name,
      r.department,
      r.line || '-',
      r.jobTitle,
      r.nationality,
      r.absenceCategory,
      r.note || '-',
    ];
    row.height = 23;

    // Apply borders and base styles
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (colNumber === 1 || colNumber === 2 || colNumber === 5 || colNumber === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }

      if (currentRowIdx % 2 === 0 && colNumber !== 8) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });

    // Color coding for Absence Category (Col 8) as requested:
    // بدون إذن: red background, white text
    // اعتيادي: green background, white text
    // إجازة عارضة: sky background, black text
    // إجازة مرضية: amber/brown background, black text
    // بإذن: white background, black text
    const categoryCell = row.getCell(8);
    const catKey = r.absenceKey;
    if (catKey === 'unexcused') {
      categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } }; // bg-red-500
      categoryCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (catKey === 'excused_annual') {
      categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } }; // bg-green-500
      categoryCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    } else if (catKey === 'excused_casual') {
      categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7DD3FC' } }; // bg-sky-300
      categoryCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF000000' } };
    } else if (catKey === 'medical') {
      categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; // bg-amber-200
      categoryCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF000000' } };
    } else if (catKey === 'official_pass') {
      categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // bg-white
      categoryCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF000000' } };
    }

    currentRowIdx++;
  }

  // 7. Auto-adjusted column widths so text never shows #### or gets truncated
  worksheet.columns = [
    { key: 'index', width: 6 },
    { key: 'code', width: 14 },
    { key: 'name', width: 28 },
    { key: 'department', width: 20 },
    { key: 'line', width: 16 },
    { key: 'jobTitle', width: 22 },
    { key: 'nationality', width: 14 },
    { key: 'absenceCategory', width: 20 },
    { key: 'note', width: 32 },
  ];

  // Write to Buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
