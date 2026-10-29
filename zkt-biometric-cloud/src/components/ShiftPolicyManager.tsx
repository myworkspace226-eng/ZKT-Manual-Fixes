import React, { useState } from 'react';
import { 
  CalendarClock, 
  Clock, 
  Save,
  Moon,
  Sunrise,
  Sparkles
} from 'lucide-react';
import { ShiftRule, Worker } from '../types';

interface ShiftPolicyManagerProps {
  shifts: ShiftRule[];
  workers: Worker[];
  onUpdateShift: (shift: ShiftRule) => void;
  onUpdateWorkerGrace: (workerCode: number, graceMinutes: number) => void;
}

export const ShiftPolicyManager: React.FC<ShiftPolicyManagerProps> = ({
  shifts,
  workers,
  onUpdateShift,
  onUpdateWorkerGrace,
}) => {
  const [selectedShiftId, setSelectedShiftId] = useState<string>('standard');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Common General Overtime & Overnight Rules (applied to all workers who stay late)
  const [overnightEndThreshold, setOvernightEndThreshold] = useState<string>('07:00');
  const [earlyArrivalWindowStart, setEarlyArrivalWindowStart] = useState<string>('06:30');
  const [fridayMultiplier, setFridayMultiplier] = useState<number>(2.0);

  const activeShift = shifts.find(s => s.id === selectedShiftId) || shifts[0];
  const [editedShift, setEditedShift] = useState<ShiftRule>(activeShift);

  const handleSelectShift = (id: string) => {
    setSelectedShiftId(id);
    const found = shifts.find(s => s.id === id);
    if (found) setEditedShift(found);
  };

  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateShift({
      ...editedShift,
      overnightEndThreshold,
      earlyArrivalWindowStart,
      fridayMultiplier,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">مواعيد العمل والورديات</h2>
          <div className="text-[11px] text-slate-400">الورديتان المعتمدتان بالمصنع وقواعد الإضافي الموحدة</div>
        </div>
        {savedSuccess && (
          <span className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded">
            تم حفظ التعديلات بنجاح
          </span>
        )}
      </div>

      {/* Main Grid: Shifts Selection and Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Shifts List (Only 2 Shifts!) */}
        <div className="space-y-2">
          {shifts.map((s) => {
            const isSelected = s.id === selectedShiftId;
            return (
              <div
                key={s.id}
                onClick={() => handleSelectShift(s.id)}
                className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-bold">{s.name}</div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {s.startTime} - {s.endTime}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  سماحية: {s.generalGraceMinutes}د · راحة: {s.breakDurationMinutes}د ({s.breakStart})
                </div>
              </div>
            );
          })}
        </div>

        {/* Shift Details Form */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="text-xs font-bold text-white border-b border-slate-800 pb-2">
            مواعيد الوردية: {editedShift.name}
          </div>

          <form onSubmit={handleSaveShift} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded bg-slate-950 border border-slate-800/80 font-mono">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">بدء العمل:</label>
                <input
                  type="time"
                  value={editedShift.startTime}
                  onChange={(e) => setEditedShift({ ...editedShift, startTime: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">نهاية العمل:</label>
                <input
                  type="time"
                  value={editedShift.endTime}
                  onChange={(e) => setEditedShift({ ...editedShift, endTime: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">وقت الراحة (البريك):</label>
                <input
                  type="time"
                  value={editedShift.breakStart}
                  onChange={(e) => setEditedShift({ ...editedShift, breakStart: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">مدة الراحة (دقيقة):</label>
                <input
                  type="number"
                  value={editedShift.breakDurationMinutes}
                  onChange={(e) => setEditedShift({ ...editedShift, breakDurationMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">سماحية التأخير الصباحية (دقيقة):</label>
                <input
                  type="number"
                  value={editedShift.generalGraceMinutes}
                  onChange={(e) => setEditedShift({ ...editedShift, generalGraceMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-white font-mono"
                />
              </div>
              <div className="flex items-end">
                <span className="text-[11px] text-slate-500 pb-2">
                  الحضور قبل 8:{editedShift.generalGraceMinutes} ص يُحسب بدون خصم.
                </span>
              </div>
            </div>

            {/* General Overtime, Overnight & Friday Rules (Applies to any worker who stays late or works Friday) */}
            <div className="border-t border-slate-800 pt-3 space-y-2.5">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>قواعد احتساب الإضافي وسهر المبيت (تطبق تلقائياً على أي عامل يسهر أو يبيت):</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 font-mono p-3 rounded bg-slate-950 border border-slate-800/80">
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">حد نهاية سهر المبيت:</label>
                  <input
                    type="time"
                    value={overnightEndThreshold}
                    onChange={(e) => setOvernightEndThreshold(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">بصمة الفجر قبله = انصراف لليوم السابق</span>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">نافذة الحضور المبكر:</label>
                  <input
                    type="time"
                    value={earlyArrivalWindowStart}
                    onChange={(e) => setEarlyArrivalWindowStart(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">البصمة بعدها تبدأ حسابها من 8:00 ص</span>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">معامل يوم الجمعة:</label>
                  <input
                    type="number"
                    step="0.5"
                    value={fridayMultiplier}
                    onChange={(e) => setFridayMultiplier(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-white"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">2.0x (اليوم بيومين = 16 ساعة)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
