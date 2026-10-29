import React, { useState } from 'react';
import { 
  Settings, 
  Building2, 
  Clock, 
  Database, 
  Download, 
  Upload, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Server,
  ShieldCheck,
  Sun,
  Moon
} from 'lucide-react';
import { FactorySettings } from '../types';

interface SettingsManagerProps {
  settings: FactorySettings;
  onUpdateSettings: (newSettings: FactorySettings) => void;
  onExportAllData: () => void;
  onImportBackup: (jsonContent: string) => void;
  onResetFactoryData: () => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  settings,
  onUpdateSettings,
  onExportAllData,
  onImportBackup,
  onResetFactoryData,
}) => {
  const [formData, setFormData] = useState<FactorySettings>({ ...settings });
  const [notification, setNotification] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [pendingBackupContent, setPendingBackupContent] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setNotification('تم حفظ إعدادات النظام ومواعيد الورديات بنجاح.');
    setTimeout(() => setNotification(null), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPendingBackupContent(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 p-3 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-500 hover:text-white cursor-pointer">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>إعدادات النظام ومواعيد العمل</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">V 5.4.0</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              تخصيص هوية المصنع، مواعيد الورديات وفترات السماح والانصراف المبكر، والنسخ الاحتياطي
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>حفظ التعديلات</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Section 1: Factory Identity */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs pb-2 border-b border-slate-800">
            <Building2 className="w-4 h-4 text-blue-400" />
            <span>بيانات المصنع والمنشأة</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">اسم المصنع / الشركة</label>
              <input
                type="text"
                value={formData.factoryName}
                onChange={(e) => setFormData({ ...formData, factoryName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">اسم الفرع / الموقع</label>
              <input
                type="text"
                value={formData.branchName}
                onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 2: Shift Timings & Attendance Engine Policies (Point 8) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>مواعيد العمل والورديات وسياسات الحضور (Attendance Engine)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              يقرأ محرك البصمات هذه المتغيرات تلقائياً
            </span>
          </div>

          {/* Standard Shift */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Sun className="w-3.5 h-3.5" />
              <span>الوردية العادية (المصريين)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300">موعد بداية الوردية (الحضور)</label>
                <input
                  type="time"
                  value={formData.standardShiftStart || '08:00'}
                  onChange={(e) => setFormData({ ...formData, standardShiftStart: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:border-blue-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-300">موعد نهاية الوردية (الانصراف)</label>
                <input
                  type="time"
                  value={formData.standardShiftEnd || '16:30'}
                  onChange={(e) => setFormData({ ...formData, standardShiftEnd: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:border-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Bengali Shift */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
              <Clock className="w-3.5 h-3.5" />
              <span>وردية العمالة البنغلاديشية</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300">موعد بداية الوردية</label>
                <input
                  type="time"
                  value={formData.bangladeshiShiftStart || '08:00'}
                  onChange={(e) => setFormData({ ...formData, bangladeshiShiftStart: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:border-blue-500"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-300">موعد نهاية الوردية</label>
                <input
                  type="time"
                  value={formData.bangladeshiShiftEnd || '18:30'}
                  onChange={(e) => setFormData({ ...formData, bangladeshiShiftEnd: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white font-mono focus:border-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Policies & Windows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs pt-1">
            <div className="space-y-1 bg-slate-950/50 p-2.5 rounded border border-slate-800">
              <label className="text-slate-300 font-medium block">سماح التأخير (صباحاً)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={formData.defaultGraceMinutes ?? 15}
                  onChange={(e) => setFormData({ ...formData, defaultGraceMinutes: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-center focus:border-blue-500"
                />
                <span className="text-slate-400 text-[11px] shrink-0">دقيقة</span>
              </div>
              <span className="text-[10px] text-slate-500 block">بعدها يُحتسب التأخير</span>
            </div>

            <div className="space-y-1 bg-slate-950/50 p-2.5 rounded border border-slate-800">
              <label className="text-slate-300 font-medium block">سماح الإضافي (مساءً)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={formData.overtimeGraceMinutes ?? 30}
                  onChange={(e) => setFormData({ ...formData, overtimeGraceMinutes: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-center focus:border-blue-500"
                />
                <span className="text-slate-400 text-[11px] shrink-0">دقيقة</span>
              </div>
              <span className="text-[10px] text-slate-500 block">إذا تجاوزها يحسب الإضافي من نهاية الوردية</span>
            </div>

            <div className="space-y-1 bg-slate-950/50 p-2.5 rounded border border-slate-800">
              <label className="text-slate-300 font-medium block">نافذة الانصراف المبكر</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={formData.earlyDepartureWindowMinutes ?? 30}
                  onChange={(e) => setFormData({ ...formData, earlyDepartureWindowMinutes: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-center focus:border-blue-500"
                />
                <span className="text-slate-400 text-[11px] shrink-0">دقيقة</span>
              </div>
              <span className="text-[10px] text-slate-500 block">مثال: 30 د (قبل نهاية الوردية)</span>
            </div>

            <div className="space-y-1 bg-slate-950/50 p-2.5 rounded border border-slate-800">
              <label className="text-slate-300 font-medium block">استبعاد البصمات المكررة</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={formData.duplicateWindowMinutes ?? 60}
                  onChange={(e) => setFormData({ ...formData, duplicateWindowMinutes: parseInt(e.target.value, 10) || 60 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-center focus:border-blue-500"
                />
                <span className="text-slate-400 text-[11px] shrink-0">دقيقة</span>
              </div>
              <span className="text-[10px] text-slate-500 block">تجاهل تكرار البصمات (افتراضي 60د)</span>
            </div>

            <div className="space-y-1 bg-slate-950/50 p-2.5 rounded border border-slate-800">
              <label className="text-slate-300 font-medium block">حد بداية اليوم الفعلي</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="3"
                  max="8"
                  value={formData.overnightCutoffHour ?? 6}
                  onChange={(e) => setFormData({ ...formData, overnightCutoffHour: parseInt(e.target.value, 10) || 6 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white font-mono text-center focus:border-blue-500"
                />
                <span className="text-slate-400 text-[11px] shrink-0">صباحاً</span>
              </div>
              <span className="text-[10px] text-slate-500 block">06:00 ص بداية نافذة الحضور</span>
            </div>
          </div>
        </div>

        {/* Section 3: Backup & Data Safety */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs pb-2 border-b border-slate-800">
            <Database className="w-4 h-4 text-purple-400" />
            <span>النسخ الاحتياطي وإدارة البيانات</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-slate-300">
              تصدير قاعدة بيانات المصنع أو استعادة نسخة احتياطية:
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onExportAllData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>تصدير نسخة احتياطية (JSON)</span>
              </button>

              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>استعادة نسخة احتياطية</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط البيانات</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 4: System & Developer Information */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-bold text-xs pb-2 border-b border-slate-800">
            <Server className="w-4 h-4 text-cyan-400" />
            <span>معلومات النظام والترخيص والمطور</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">مطور النظام والبرنامج</span>
              <span className="font-bold text-cyan-300 font-mono text-sm">Muhammad Abdullah</span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">رقم إصدار البرنامج</span>
              <span className="font-bold text-emerald-400 font-mono text-sm">V 5.4.0</span>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-1">نمط العمل والاتصال</span>
              <span className="font-medium text-slate-200">محلي بدون إنترنت (LAN Port 4370)</span>
            </div>
          </div>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">تأكيد استعادة الضبط الافتراضي</h3>
            </div>
            <p className="text-xs text-slate-300">
              هل أنت متأكد من رغبتك في استعادة الإعدادات الافتراضية للنظام؟
            </p>
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  onResetFactoryData();
                  setShowResetConfirm(false);
                  setNotification('تمت استعادة الإعدادات الافتراضية بنجاح.');
                  setTimeout(() => setNotification(null), 4000);
                }}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
              >
                تأكيد الاستعادة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Restore Confirmation Modal */}
      {pendingBackupContent && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-white">تأكيد استعادة النسخة الاحتياطية</h3>
            </div>
            <div className="bg-rose-950/40 border border-rose-800/60 p-3 rounded-lg text-xs space-y-1">
              <p className="font-bold text-rose-300">
                هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيتم مسح البيانات الحالية واستبدالها.
              </p>
              <p className="text-[11px] text-rose-300/80">
                هذا الإجراء سيقوم بتحديث واستبدال سجلات العمال، الإعدادات، وحركات البصمة بالبيانات الموجودة في ملف النسخة الاحتياطية.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBackupContent(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingBackupContent) {
                    onImportBackup(pendingBackupContent);
                    setPendingBackupContent(null);
                    setNotification('تمت استعادة قاعدة البيانات والنسخة الاحتياطية بنجاح.');
                    setTimeout(() => setNotification(null), 4000);
                  }
                }}
                className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                تأكيد واستبدال البيانات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
