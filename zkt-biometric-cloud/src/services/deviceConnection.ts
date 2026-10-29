export interface PingResult {
  success: boolean;
  pingMs?: number;
  message: string;
  isDesktopNative: boolean;
  warning?: string;
}

export interface ZktLogRecord {
  id: number;
  sn: number;
  userId: string;
  recordTime: string;
  type: number; // 0: Check-in, 1: Check-out, etc.
  state: number;
  ip: string;
  verifyType?: number;
  verifyMode?: number;
  workerName?: string;
}

export interface DeviceLogsResult {
  success: boolean;
  pingMs?: number;
  records: ZktLogRecord[];
  deviceInfo?: any;
  message: string;
  error?: string;
  isDesktopNative: boolean;
}

export interface ZktDeviceUser {
  uid: number;
  userId: string;
  name: string;
  role: number;
  cardno: number;
}

export interface DeviceUsersResult {
  success: boolean;
  users: ZktDeviceUser[];
  message: string;
  error?: string;
  isDesktopNative: boolean;
}

export interface DeviceActionResult {
  success: boolean;
  message: string;
  error?: string;
  isDesktopNative: boolean;
}

/**
 * Returns the Electron ipcRenderer instance if available via window.ipcRenderer or require('electron').
 */
export function getIpcRenderer(): any {
  if (typeof window === 'undefined') return null;
  if ((window as any).ipcRenderer) return (window as any).ipcRenderer;
  try {
    const electron = (window as any).require && (window as any).require('electron');
    return electron?.ipcRenderer || null;
  } catch {
    return null;
  }
}

/**
 * Checks whether the app is currently running inside the installed Electron desktop environment.
 */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).ipcRenderer ||
    ((window as any).require && (window as any).require('electron'))
  );
}

/**
 * Checks overall network connectivity (LAN / Internet).
 * In desktop mode, checks active physical network interface adapters.
 */
export async function checkNetworkConnectivity(): Promise<boolean> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-check-network');
        if (res && typeof res.online === 'boolean') {
          return res.online;
        }
      }
    } catch {
      // Fallback
    }
  }

  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Tests network reachability to a ZKTeco biometric device.
 * In desktop mode: uses native TCP socket to port 4370 + strict ICMP echo check.
 */
export async function pingDeviceNetwork(ip: string, port: number = 4370): Promise<PingResult> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-ping-device', { ip, port, timeout: 2500 });
        if (res && res.success) {
          return {
            success: true,
            pingMs: res.pingMs || 6,
            message: `تم الاتصال بنجاح بـ ${ip}:${port} (${res.pingMs}ms)`,
            isDesktopNative: true,
            warning: res.warning,
          };
        } else {
          return {
            success: false,
            message: res?.error || `تعذر الاتصال بـ ${ip}:${port} (لم يتم الرد من الماكينة).`,
            isDesktopNative: true,
          };
        }
      }
    } catch (err: any) {
      console.error('Desktop native ping error:', err);
      return {
        success: false,
        message: `خطأ في الاتصال بالماكينة ${ip}:${port}.`,
        isDesktopNative: true,
      };
    }
  }

  // Web Browser Preview Mode
  return {
    success: false,
    message: `يتطلب الاتصال بالماكينة تشغيل تطبيق الديسكتوب المثبت على نظام ويندوز داخل الشبكة المحلية.`,
    isDesktopNative: false,
  };
}

/**
 * Connects directly to the ZKTeco hardware and pulls attendance punch records.
 * Uses native TCP/UDP socket communication via ZKTeco binary protocol.
 */
export async function pullDeviceAttendanceLogs(
  ip: string, 
  port: number = 4370
): Promise<DeviceLogsResult> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-pull-logs', { ip, port, timeout: 5000 });
        return {
          success: Boolean(res && res.success),
          pingMs: res?.pingMs,
          records: res?.records || [],
          deviceInfo: res?.deviceInfo,
          message: res?.message || `تم سحب الحركات بنجاح من ${ip}`,
          error: res?.error,
          isDesktopNative: true,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        records: [],
        message: 'فشل استدعاء خدمة سحب الحركات',
        error: err?.message || String(err),
        isDesktopNative: true,
      };
    }
  }

  return {
    success: false,
    records: [],
    message: 'سحب الحركات التلقائي عبر الشبكة متاح داخل تطبيق الديسكتوب فقط.',
    error: 'في المتصفح يمكنك استخدام "استيراد ملف USB" لتحميل سجلات الحركات.',
    isDesktopNative: false,
  };
}

/**
 * Pulls registered workers/users from the device hardware memory.
 */
export async function pullDeviceUsers(
  ip: string, 
  port: number = 4370
): Promise<DeviceUsersResult> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-pull-users', { ip, port, timeout: 5000 });
        return {
          success: Boolean(res && res.success),
          users: res?.users || [],
          message: res?.message || `تم سحب العمال من ${ip}`,
          error: res?.error,
          isDesktopNative: true,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        users: [],
        message: 'فشل استدعاء خدمة قراءة العمال من الماكينة',
        error: err?.message || String(err),
        isDesktopNative: true,
      };
    }
  }

  return {
    success: false,
    users: [],
    message: 'سحب العمال متاح فقط عبر تطبيق الديسكتوب المتصل بالشبكة المحلية.',
    isDesktopNative: false,
  };
}

/**
 * Uploads an employee/worker to the ZKTeco biometric device.
 */
export async function uploadUserToDevice(
  ip: string,
  port: number = 4370,
  user: { code: number; name: string; id?: string | number }
): Promise<DeviceActionResult> {
  const ipc = getIpcRenderer();
  if (ipc) {
    try {
      const res = await ipc.invoke('zkt-upload-user', { ip, port, user, timeout: 5000 });
      return {
        success: Boolean(res && res.success),
        message: res?.message || `تم رفع العامل إلى الماكينة`,
        error: res?.error,
        isDesktopNative: true,
      };
    } catch (err: any) {
      return {
        success: false,
        message: 'فشل إرسال بيانات العامل إلى الماكينة',
        error: err?.message || String(err),
        isDesktopNative: true,
      };
    }
  }

  return {
    success: false,
    message: 'رفع العمال إلى الماكينة يتطلب تطبيق الديسكتوب المتصل بالشبكة المحلية.',
    isDesktopNative: false,
  };
}

/**
 * Synchronizes the device hardware clock with the computer system clock.
 */
export async function syncDeviceTime(
  ip: string,
  port: number = 4370
): Promise<DeviceActionResult> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-sync-time', { ip, port, timeout: 5000 });
        return {
          success: Boolean(res && res.success),
          message: res?.message || `تم ضبط ساعة الماكينة`,
          error: res?.error,
          isDesktopNative: true,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'فشل ضبط توقيت الماكينة',
        error: err?.message || String(err),
        isDesktopNative: true,
      };
    }
  }

  return {
    success: false,
    message: 'ضبط توقيت الماكينة يتطلب تطبيق الديسكتوب.',
    isDesktopNative: false,
  };
}

/**
 * Safely clears attendance logs on the device memory (CMD_CLEAR_ATTLOG).
 * Preserves user accounts, cards, and fingerprint templates.
 */
export async function clearDeviceAttendanceLog(
  ip: string,
  port: number = 4370
): Promise<DeviceActionResult> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-clear-attendance-log', { ip, port, timeout: 8000 });
        return {
          success: Boolean(res && res.success),
          message: res?.message || `تم تفريغ ذاكرة الحركات للماكينة بنجاح`,
          error: res?.error,
          isDesktopNative: true,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'فشل تفريغ ذاكرة الحركات للماكينة',
        error: err?.message || String(err),
        isDesktopNative: true,
      };
    }
  }

  return {
    success: false,
    message: 'تفريغ ذاكرة الماكينة يتطلب تشغيل تطبيق الديسكتوب.',
    isDesktopNative: false,
  };
}

/**
 * Disconnects from the biometric device socket and clears the active session.
 */
export async function disconnectDevice(
  ip: string,
  port: number = 4370
): Promise<DeviceActionResult> {
  if (isDesktopApp()) {
    try {
      const electron = (window as any).require('electron');
      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('zkt-disconnect-device', { ip, port });
        return {
          success: Boolean(res && res.success),
          message: res?.message || `تم إلغاء الاتصال بالماكينة (${ip}) بنجاح`,
          isDesktopNative: true,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: 'فشل إلغاء الاتصال بالماكينة',
        error: err?.message || String(err),
        isDesktopNative: true,
      };
    }
  }

  return {
    success: true,
    message: `تم إلغاء الاتصال بالماكينة (${ip}) بنجاح.`,
    isDesktopNative: false,
  };
}


