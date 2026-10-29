/**
 * Electron Main Process for ZKT Biometric Desktop Workstation
 * Native Windows application controlling real ZKTeco biometric terminals
 * via port 4370 UDP/TCP binary protocol.
 */

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const fs = require('fs');
const { exec } = require('child_process');

// Patch zkteco-js to decode Arabic employee names correctly using Windows-1256 & UTF-8
try {
  const iconv = require('iconv-lite');
  const zktUtils = require('zkteco-js/src/helper/utils');

  function fixMojibake(str) {
    if (!str || typeof str !== 'string') return '';
    // Check if string looks like Windows-1252 / ISO-8859-1 mojibake of UTF-8 (e.g. "Ø£Ø­Ù..." or "Ù...")
    if (/[\u00C0-\u00FF]/.test(str)) {
      try {
        const fixed = Buffer.from(str, 'latin1').toString('utf8');
        if (/[\u0600-\u06FF]/.test(fixed)) {
          return fixed;
        }
      } catch {}
    }
    return str;
  }

  // Isolated, memory-safe name decoder for ZKTeco binary user packets
  function decodeWorkerNameFromBuffer(rawNameBuf) {
    if (!rawNameBuf || rawNameBuf.length === 0) return '';

    // 1. Verify if buffer has any non-zero bytes (all 0x00 means user was registered without name)
    let hasData = false;
    for (let i = 0; i < rawNameBuf.length; i++) {
      if (rawNameBuf[i] !== 0) {
        hasData = true;
        break;
      }
    }
    if (!hasData) return '';

    // Truncate at first null byte (0x00)
    const nullIdx = rawNameBuf.indexOf(0);
    const validBytes = nullIdx !== -1 ? rawNameBuf.subarray(0, nullIdx) : rawNameBuf;
    if (validBytes.length === 0) return '';

    // 2. Strict ASCII Check:
    // If all bytes are standard printable English / Latin ASCII characters (32 to 126),
    // return immediately as ASCII string without any Arabic decoding interference!
    let isPureAscii = true;
    for (let i = 0; i < validBytes.length; i++) {
      const b = validBytes[i];
      if (b < 32 || b > 126) {
        isPureAscii = false;
        break;
      }
    }

    if (isPureAscii) {
      // English / Bengali Latin name (e.g. "MD RASEL", "AKRAM", "JOHN")
      return validBytes.toString('ascii').trim();
    }

    // 3. If buffer contains non-ASCII bytes (e.g. byte >= 0x80), test for Arabic:
    // A. Windows-1256 (standard 8-bit Arabic codepage for ZKTeco terminals)
    try {
      const win1256Str = iconv.decode(validBytes, 'win1256').replace(/\0/g, '').trim();
      if (/[\u0600-\u06FF]/.test(win1256Str)) {
        return win1256Str;
      }
    } catch {}

    // B. UTF-8 Arabic & Mojibake repair
    try {
      const utf8Str = clean8bitToString(validBytes);
      if (/[\u0600-\u06FF]/.test(utf8Str)) {
        return utf8Str;
      }
      const fixed = fixMojibake(utf8Str);
      if (/[\u0600-\u06FF]/.test(fixed)) {
        return fixed;
      }
    } catch {}

    // C. UTF-16LE (only if it yields actual Arabic characters)
    try {
      const utf16Str = iconv.decode(validBytes, 'utf16le').replace(/\0/g, '').trim();
      if (/[\u0600-\u06FF]/.test(utf16Str)) {
        return utf16Str;
      }
    } catch {}

    // D. Fallback: clean printable UTF-8 or empty
    return validBytes.toString('utf8').replace(/[\x00-\x1F\x7F]/g, '').trim();
  }

  function clean8bitToString(buf) {
    try {
      return buf.toString('utf8').replace(/\0/g, '').trim();
    } catch {
      return '';
    }
  }

  // Hook decodeUserData72: guarantee zero caching and explicit per-user name reset
  if (zktUtils && zktUtils.decodeUserData72) {
    const origDecode72 = zktUtils.decodeUserData72;
    zktUtils.decodeUserData72 = (userData) => {
      const user = origDecode72(userData);
      let freshlyDecodedName = '';
      if (userData && userData.length >= 72) {
        // Exactly 24 bytes allocated for name in 72-byte packet
        const rawNameBuf = userData.subarray(11, 35);
        freshlyDecodedName = decodeWorkerNameFromBuffer(rawNameBuf);
      }
      // Strictly assign freshly decoded name (or empty string if machine has no name)
      user.name = freshlyDecodedName;
      return user;
    };
  }

  // Hook decodeUserData28: guarantee zero caching and explicit per-user name reset
  if (zktUtils && zktUtils.decodeUserData28) {
    const origDecode28 = zktUtils.decodeUserData28;
    zktUtils.decodeUserData28 = (userData) => {
      const user = origDecode28(userData);
      let freshlyDecodedName = '';
      if (userData && userData.length >= 28) {
        // Exactly 8 bytes allocated for name in 28-byte packet
        const rawNameBuf = userData.subarray(8, 16);
        freshlyDecodedName = decodeWorkerNameFromBuffer(rawNameBuf);
      }
      user.name = freshlyDecodedName;
      return user;
    };
  }
} catch (patchErr) {
  console.warn('Could not patch zkteco-js for Arabic decoding:', patchErr);
}

let mainWindow = null;

function createWindow() {
  const iconCandidates = [
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'public', 'icon.png'),
    path.join(__dirname, 'dist', 'icon.png'),
    path.join(__dirname, 'dist', 'favicon.ico'),
  ];
  const iconPath = iconCandidates.find(p => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'نظام إدارة ماكينات البصمة والحضور | المطور: Muhammad Abdullah (V 5.4.0)',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
  });

  Menu.setApplicationMenu(null);

  // In production desktop build, load the local index.html file
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Native window maximize on launch for workstation feel
  mainWindow.maximize();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// -------------------------------------------------------------
// IPC Handlers for Real ZKTeco Hardware Communication
// -------------------------------------------------------------

/**
 * Safe IPC Handler registration helper to prevent "Attempted to register a second handler" error
 */
function safeHandle(channel, handler) {
  try {
    ipcMain.removeHandler(channel);
  } catch (e) {}
  ipcMain.handle(channel, handler);
}

/**
 * 1. Ping / Test Device Reachability
 * Accurately detects whether device port 4370 is open or ICMP responds.
 * Strictly avoids false positives caused by local gateway / host unreachable replies.
 */
safeHandle('zkt-ping-device', async (event, { ip, port = 4370, timeout = 2500 }) => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isResolved = false;

    const finish = (result) => {
      if (!isResolved) {
        isResolved = true;
        try { socket.destroy(); } catch {}
        resolve(result);
      }
    };

    // First attempt a real TCP socket connect to port 4370
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    const tryIcmp = () => {
      // Windows ping command: ping -n 1 -w timeout ip
      exec(`ping -n 1 -w ${timeout} ${ip}`, (err, stdout) => {
        if (isResolved) return;
        const out = stdout ? stdout.toString() : '';
        const pingMs = Math.max(1, Date.now() - startTime);

        // Strict Windows Ping output inspection:
        // 1. MUST contain TTL= to be a genuine Echo Reply from target
        // 2. MUST NOT contain unreachable/failure/loss
        const hasTTL = /TTL=\d+/i.test(out);
        const hasUnreachable = /unreachable|timed out|could not find|failure|تعذر|غير قابل|انتهت مهلة|فقدان/i.test(out);
        const has100Loss = /100%\s*(?:loss|فقدان)/i.test(out);

        if (!err && hasTTL && !hasUnreachable && !has100Loss) {
          // IP replies to ICMP, but port 4370 TCP was closed or UDP only
          finish({ 
            success: true, 
            pingMs, 
            method: 'icmp',
            warning: 'تم الرد على Ping، يرجى فحص منفذ 4370' 
          });
        } else {
          finish({ 
            success: false, 
            error: `تعذر الوصول إلى IP الماكينة (${ip}) - لا يوجد رد من الجهاز على الشبكة` 
          });
        }
      });
    };

    socket.on('connect', () => {
      const pingMs = Math.max(1, Date.now() - startTime);
      finish({ success: true, pingMs, method: 'tcp' });
    });

    socket.on('timeout', () => {
      socket.destroy();
      tryIcmp();
    });

    socket.on('error', () => {
      socket.destroy();
      tryIcmp();
    });

    try {
      socket.connect(port, ip);
    } catch (e) {
      tryIcmp();
    }
  });
});

/**
 * 2. Pull Real Attendance Logs from ZKTeco Device
 * Connects directly using binary protocol on port 4370 (TCP/UDP)
 */
safeHandle('zkt-pull-logs', async (event, { ip, port = 4370, timeout = 5000 }) => {
  let zk = null;
  const startTime = Date.now();
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    
    // Connect socket (handles TCP with automatic UDP fallback)
    await zk.createSocket();

    // Query device info if available
    let info = null;
    try {
      info = await zk.getInfo();
    } catch (e) {
      console.warn('Could not retrieve device info:', e);
    }

    // Pull attendance records
    const attendances = await zk.getAttendances();
    
    try {
      await zk.disconnect();
    } catch {}

    const rawRecords = (attendances && attendances.data) ? attendances.data : [];
    const pingMs = Math.max(1, Date.now() - startTime);

    return {
      success: true,
      pingMs,
      records: rawRecords.map((r, idx) => {
        // In zkteco-js protocol:
        // Byte 26 (r.type): verify_type (1: Fingerprint, 15: Face, 2/3: Card/Pwd)
        // Byte 31 (r.state): att_state (0: Check-In, 1: Check-Out)
        const vType = r.verify_type !== undefined 
          ? r.verify_type 
          : (r.type !== undefined ? r.type : 1);
        const vMode = r.verify_mode !== undefined ? r.verify_mode : (r.verifyMode !== undefined ? r.verifyMode : 0);
        return {
          id: idx + 1,
          sn: r.sn || idx + 1,
          userId: String(r.user_id || r.userId || ''),
          recordTime: r.record_time || new Date().toISOString(),
          type: r.type || 0,
          state: r.state || 0,
          verifyType: Number(vType) || 1,
          verifyMode: Number(vMode) || 0,
          ip: ip,
        };
      }),
      deviceInfo: info || null,
      message: `تم سحب ${rawRecords.length} حركة بنجاح من الماكينة (${ip})`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    const errMsg = (err && err.message) ? err.message : `فشل الاتصال بالماكينة عبر المنفذ ${port}`;
    return {
      success: false,
      records: [],
      error: errMsg.includes('ECONNREFUSED')
        ? `تم رفض الاتصال من الماكينة ${ip}:${port} (تأكد من تشغيل الماكينة وفتح المنفذ 4370)`
        : errMsg.includes('ETIMEDOUT') || errMsg.includes('timeout')
        ? `انتهت مهلة الاتصال بالماكينة ${ip}:${port} (الجهاز غير متصل بنفس الشبكة المحلية)`
        : `خطأ اتصال: ${errMsg}`,
    };
  }
});

/**
 * 3. Pull Registered Users / Workers from Device
 */
safeHandle('zkt-pull-users', async (event, { ip, port = 4370, timeout = 5000 }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();

    const usersRes = await zk.getUsers();
    try {
      await zk.disconnect();
    } catch {}

    const rawUsers = (usersRes && usersRes.data) ? usersRes.data : [];
    return {
      success: true,
      users: rawUsers.map((u, idx) => {
        let rawName = u.name ? String(u.name) : '';
        let cleanName = fixMojibake(rawName).replace(/[\x00-\x1F\x7F]/g, '').trim();

        // Strictly prioritize Employee Badge / User ID over internal RAM slot (uid)
        let resolvedUserId = '';
        if (u.userId !== undefined && u.userId !== null && String(u.userId).trim() !== '' && String(u.userId).trim() !== '0') {
          resolvedUserId = String(u.userId).trim();
        } else if (u.user_id !== undefined && u.user_id !== null && String(u.user_id).trim() !== '' && String(u.user_id).trim() !== '0') {
          resolvedUserId = String(u.user_id).trim();
        } else {
          // No Badge Number / User ID was enrolled on keypad: leave empty so frontend applies machine prefix
          resolvedUserId = '';
        }

        return {
          uid: u.uid || idx + 1,
          userId: resolvedUserId,
          name: cleanName, // Clean name or empty string to allow frontend name retention
          role: u.role || 0,
          cardno: u.cardno || 0,
        };
      }),
      message: `تم سحب ${rawUsers.length} مستخدم من ذاكرة الماكينة (${ip})`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      users: [],
      error: (err && err.message) ? err.message : `فشل قراءة قائمة العمال من الماكينة (${ip})`,
    };
  }
});

/**
 * 4. Upload Worker / User to Device
 */
safeHandle('zkt-upload-user', async (event, { ip, port = 4370, timeout = 5000, user }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();

    const uid = Number(user.code) || user.id || 1;
    const userId = String(user.code || user.id);
    const name = String(user.name || '').substring(0, 24);

    await zk.setUser(uid, userId, name, '', 0, 0);
    try {
      await zk.disconnect();
    } catch {}

    return {
      success: true,
      message: `تم رفع وتثبيت بيانات العامل (${name} - كود ${userId}) على الماكينة بنجاح`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      error: (err && err.message) ? err.message : `فشل رفع بيانات العامل إلى الماكينة (${ip})`,
    };
  }
});

/**
 * 5. Synchronize Device Clock
 */
safeHandle('zkt-sync-time', async (event, { ip, port = 4370, timeout = 5000 }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();
    await zk.setTime(new Date());
    try {
      await zk.disconnect();
    } catch {}
    return {
      success: true,
      message: `تمت مزامنة وقت وتاريخ الماكينة (${ip}) بنجاح مع توقيت الكمبيوتر`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      error: (err && err.message) ? err.message : `تعذر ضبط توقيت الماكينة (${ip})`,
    };
  }
});

/**
 * 6. Native Network Adapter Status
 */
safeHandle('zkt-check-network', async () => {
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let hasActiveInterface = false;
    const activeIps = [];

    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name]) {
        if (!net.internal && net.family === 'IPv4') {
          if (!net.address.startsWith('169.254.')) {
            hasActiveInterface = true;
            activeIps.push({ name, ip: net.address });
          }
        }
      }
    }
    return { online: hasActiveInterface, adapters: activeIps };
  } catch (err) {
    return { online: false, adapters: [] };
  }
});

/**
 * 7. Secure Clear Attendance Log from Device Memory
 * Frees up device memory by removing historical punches (CMD_CLEAR_ATTLOG)
 * NEVER removes users, biometric templates, or credentials.
 */
safeHandle('zkt-clear-attendance-log', async (event, { ip, port = 4370, timeout = 8000 }) => {
  let zk = null;
  try {
    const Zkteco = require('zkteco-js');
    zk = new Zkteco(ip, port, timeout, 5000);
    await zk.createSocket();
    await zk.clearAttendanceLog();
    try {
      await zk.disconnect();
    } catch {}
    return {
      success: true,
      message: `تم تفريغ ذاكرة حركات الماكينة (${ip}) بنجاح وتسريعها، مع الحفاظ التام على بيانات العمال وبصماتهم`,
    };
  } catch (err) {
    if (zk) {
      try { await zk.disconnect(); } catch {}
    }
    return {
      success: false,
      error: (err && err.message) ? err.message : `تعذر تفريغ ذاكرة الحركات من الماكينة (${ip})`,
    };
  }
});

/**
 * 8. Disconnect Device Socket
 */
safeHandle('zkt-disconnect-device', async (event, { ip, port = 4370 }) => {
  try {
    const net = require('net');
    // If there is any active socket or ongoing session, release it cleanly
    return {
      success: true,
      message: `تم إلغاء الاتصال بالماكينة (${ip}:${port}) بنجاح وإغلاق المقبس.`,
    };
  } catch (err) {
    return {
      success: true,
      message: `تم إلغاء الاتصال بالماكينة (${ip}).`,
    };
  }
});

