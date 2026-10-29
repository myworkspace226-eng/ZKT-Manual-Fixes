import React, { useState } from 'react';
import { 
  DoorOpen, 
  Plus, 
  CheckCircle2, 
  FileSpreadsheet, 
  Calendar, 
  Clock, 
  User, 
  History, 
  AlertCircle, 
  X, 
  Edit2, 
  Trash2, 
  Save,
  AlertTriangle
} from 'lucide-react';
import { GatePass, Worker } from '../types';
import { exportToExcel } from '../utils/attendanceEngine';

interface GatePassManagerProps {
  gatePasses: GatePass[];
  workers: Worker[];
  onAddGatePass: (gatePass: GatePass) => void;
  onCompleteGatePass: (id: string, returnTime: string) => void;
  onUpdateGatePass?: (gatePass: GatePass) => void;
  onDeleteGatePass?: (id: string) => void;
}

export const GatePassManager: React.FC<GatePassManagerProps> = ({
  gatePasses,
  workers,
  onAddGatePass,
  onCompleteGatePass,
  onUpdateGatePass,
  onDeleteGatePass,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedWorkerCode, setSelectedWorkerCode] = useState<number>(workers.length > 0 ? workers[0].code : 0);
  const [passDate, setPassDate] = useState<string>(todayStr);
  const [passType, setPassType] = useState<'temporary' | 'rest_of_day' | 'delay'>('temporary');
  const [passReason, setPassReason] = useState<'official_mission' | 'medical' | 'personal_with_deduction' | 'personal_excused' | 'delay_manager' | 'delay_family'>('official_mission');
  const [reasonDetails, setReasonDetails] = useState<string>('');
  const [exitTime, setExitTime] = useState<string>('12:00');
  const [expectedReturnTime, setExpectedReturnTime] = useState<string>('14:30');
  const [approver, setApprover] = useState<string>('شؤون العاملين');
  const [formError, setFormError] = useState<string | null>(null);

  const [completingPassId, setCompletingPassId] = useState<string | null>(null);
  const [returnInputTime, setReturnInputTime] = useState<string>('14:00');

  // Edit Gate Pass Modal State (Point 10)
  const [editingPass, setEditingPass] = useState<GatePass | null>(null);
  const [editWorkerCode, setEditWorkerCode] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>('');
  const [editType, setEditType] = useState<'temporary' | 'rest_of_day' | 'delay'>('temporary');
  const [editReason, setEditReason] = useState<'official_mission' | 'medical' | 'personal_with_deduction' | 'personal_excused' | 'delay_manager' | 'delay_family'>('official_mission');
  const [editReasonDetails, setEditReasonDetails] = useState<string>('');
  const [editExitTime, setEditExitTime] = useState<string>('');
  const [editReturnTime, setEditReturnTime] = useState<string>('');
  const [editApprover, setEditApprover] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'active' | 'completed'>('active');

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filter state
  const [dateFilter, setDateFilter] = useState<string>('all'); // 'all' or 'today' or specific

  const isSelectedDateRetroactive = passDate < todayStr;

  const handleCreatePass = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const worker = workers.find((w) => w.code === selectedWorkerCode);
    if (!worker) return;

    let approvedDelayMinutes: number | undefined = undefined;
    if (passType === 'delay') {
      const [sH, sM] = exitTime.split(':').map(Number);
      const [rH, rM] = (expectedReturnTime || '').split(':').map(Number);
      const diff = (rH * 60 + rM) - (sH * 60 + sM);
      if (isNaN(diff) || diff <= 0) {
        setFormError('وقت نهاية التأخير يجب أن يكون بعد وقت البداية');
        return;
      }
      approvedDelayMinutes = diff;
    }

    const defaultReasonText = () => {
      if (passType === 'delay') {
        return `إذن تأخير معتمد (${approvedDelayMinutes} دقيقة)`;
      }
      if (passReason === 'official_mission') return 'مأمورية رسمية';
      if (passReason === 'medical') return 'كشف طبي وتأمين';
      if (passReason === 'personal_excused') return 'إذن شخصي معتمد';
      if (passReason === 'delay_manager') return 'إذن تأخير من المدير';
      if (passReason === 'delay_family') return 'طارئ عائلي';
      return 'إذن شخصي مخصوم';
    };

    const newPass: GatePass = {
      id: `gp-${Date.now()}`,
      workerCode: worker.code,
      workerName: worker.name,
      department: worker.department,
      date: passDate,
      exitTime: exitTime,
      returnTime: passType === 'rest_of_day' ? undefined : (expectedReturnTime || undefined),
      type: passType,
      reason: passReason,
      reasonText: reasonDetails.trim() || defaultReasonText(),
      approvedBy: approver || 'شؤون العاملين',
      status: (passType === 'rest_of_day' || passType === 'delay') ? 'completed' : 'active',
      isRetroactive: isSelectedDateRetroactive,
      approvedDelayMinutes: approvedDelayMinutes,
    };

    onAddGatePass(newPass);
    setShowAddModal(false);
    setReasonDetails('');
    setPassDate(todayStr);
    setFormError(null);
  };

  const handleOpenEdit = (pass: GatePass) => {
    setEditingPass(pass);
    setEditWorkerCode(pass.workerCode);
    setEditDate(pass.date);
    setEditType(pass.type);
    setEditReason(pass.reason);
    setEditReasonDetails(pass.reasonText);
    setEditExitTime(pass.exitTime);
    setEditReturnTime(pass.returnTime || '');
    setEditApprover(pass.approvedBy);
    setEditStatus(pass.status);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPass) return;

    let editApprovedDelayMinutes: number | undefined = undefined;
    if (editType === 'delay') {
      const [sH, sM] = editExitTime.split(':').map(Number);
      const [rH, rM] = (editReturnTime || '').split(':').map(Number);
      const diff = (rH * 60 + rM) - (sH * 60 + sM);
      if (isNaN(diff) || diff <= 0) {
        setFormError('وقت نهاية التأخير يجب أن يكون بعد وقت البداية');
        return;
      }
      editApprovedDelayMinutes = diff;
    }

    const worker = workers.find((w) => w.code === editWorkerCode);
    const updatedPass: GatePass = {
      ...editingPass,
      workerCode: editWorkerCode,
      workerName: worker ? worker.name : editingPass.workerName,
      department: worker ? worker.department : editingPass.department,
      date: editDate,
      type: editType,
      reason: editReason,
      reasonText: editReasonDetails.trim() || editingPass.reasonText,
      exitTime: editExitTime,
      returnTime: editType === 'rest_of_day' ? undefined : (editReturnTime || undefined),
      approvedBy: editApprover.trim() || 'شؤون العاملين',
      status: (editType === 'rest_of_day' || editType === 'delay') ? 'completed' : editStatus,
      isRetroactive: editDate < todayStr,
      approvedDelayMinutes: editApprovedDelayMinutes,
    };

    if (onUpdateGatePass) {
      onUpdateGatePass(updatedPass);
    }
    setEditingPass(null);
    setFormError(null);
  };

  const handleDelete = (id: string) => {
    if (onDeleteGatePass) {
      onDeleteGatePass(id);
    }
    setConfirmDeleteId(null);
  };

  const handleSaveReturn = (id: string) => {
    onCompleteGatePass(id, returnInputTime);
    setCompletingPassId(null);
  };

  const filteredPasses = gatePasses.filter((p) => {
    if (dateFilter === 'today') return p.date === todayStr;
    if (dateFilter !== 'all') return p.date === dateFilter;
    return true;
  });

  const handleExport = () => {
    if (gatePasses.length === 0) return;
    const data = filteredPasses.map((p) => ({
      'كود العامل': p.workerCode,
      'اسم العامل': p.workerName,
      'القسم': p.department,
      'تاريخ التصريح': p.date,
      'أثر رجعي': p.isRetroactive ? 'نعم (متأخر من الأمن)' : 'في حينه',
      'وقت الخروج': p.exitTime,
      'وقت العودة': p.returnTime || (p.type === 'rest_of_day' ? 'مغادرة لآخر اليوم' : 'معلق'),
      'النوع': p.type === 'temporary' ? 'مؤقت وعودة' : 'مغادرة نهاية الوردية',
      'السبب': p.reasonText,
      'المعتمد': p.approvedBy,
      'الحالة': p.status === 'completed' ? 'معتمد ومنتهي' : 'ساري بالخارج',
    }));
    exportToExcel(data, 'أذونات_الخروج', `تصاريح_الخروج_${passDate}`);
  };

  const getReasonLabel = (reason: GatePass['reason']) => {
    switch (reason) {
      case 'official_mission':
        return 'مأمورية عمل';
      case 'medical':
        return 'كشف طبي / عيادة';
      case 'personal_excused':
        return 'شخصي معتمد (مدفوع)';
      case 'personal_with_deduction':
        return 'شخصي (مخصوم)';
      default:
        return 'إذن';
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>أذونات وتصاريح الخروج</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              ({filteredPasses.length})
            </span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Date Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                dateFilter === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                dateFilter === 'today' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              اليوم
            </button>
            <input
              type="date"
              value={dateFilter === 'all' || dateFilter === 'today' ? '' : dateFilter}
              onChange={(e) => setDateFilter(e.target.value || 'all')}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white cursor-pointer font-mono"
            />
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium cursor-pointer transition-colors border border-slate-700"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>تصدير Excel</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إصدار تصريح جديد</span>
          </button>
        </div>
      </div>

      {/* Retroactive Info Banner */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-2.5 flex items-center gap-2 text-xs text-blue-300">
        <History className="w-4 h-4 shrink-0 text-blue-400" />
        <span>
          <strong>دعم الإدخال بأثر رجعي:</strong> يمكنك إصدار أو تعديل تصريح بتاريخ سابق (أيام ماضية) لتسوية كشوفات الأمن المتأخرة، ويتم تعديل حالة الغياب والخصم فوراً.
        </span>
      </div>

      {/* Passes Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {filteredPasses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800 font-medium">
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">العامل</th>
                  <th className="py-2.5 px-3">القسم</th>
                  <th className="py-2.5 px-3 text-center">النوع</th>
                  <th className="py-2.5 px-3 text-center">وقت الخروج</th>
                  <th className="py-2.5 px-3 text-center">وقت العودة</th>
                  <th className="py-2.5 px-3">السبب والتفاصيل</th>
                  <th className="py-2.5 px-3">المعتمد</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredPasses.map((pass) => (
                  <tr key={pass.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                      {pass.date}
                      {pass.isRetroactive && (
                        <span className="block text-[9px] text-amber-400 font-sans">
                          (أثر رجعي)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-sans font-bold text-white">{pass.workerName}</div>
                      <div className="text-[10px] text-slate-400">#{pass.workerCode}</div>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-400">{pass.department}</td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        pass.type === 'rest_of_day' 
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-800/50' 
                          : 'bg-blue-950/40 text-blue-300 border border-blue-800/50'
                      }`}>
                        {pass.type === 'rest_of_day' ? 'مغادرة لآخر اليوم' : 'مؤقت وعودة'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-amber-400 font-bold">{pass.exitTime}</td>
                    <td className="py-2 px-3 text-center">
                      {pass.returnTime ? (
                        <span className="text-emerald-400 font-bold">{pass.returnTime}</span>
                      ) : pass.type === 'rest_of_day' ? (
                        <span className="text-slate-500 font-sans text-[11px]">نهاية اليوم</span>
                      ) : completingPassId === pass.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="time"
                            value={returnInputTime}
                            onChange={(e) => setReturnInputTime(e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white"
                          />
                          <button
                            onClick={() => handleSaveReturn(pass.id)}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                            title="حفظ العودة"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCompletingPassId(pass.id)}
                          className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-sans transition-colors cursor-pointer"
                        >
                          تسجيل العودة
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-300">
                      <div className="text-xs">{pass.reasonText}</div>
                      <div className="text-[10px] text-slate-400">{getReasonLabel(pass.reason)}</div>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-400">{pass.approvedBy}</td>
                    <td className="py-2 px-3 text-center font-sans">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${
                        pass.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {pass.status === 'completed' ? 'معتمد ومنتهي' : 'ساري بالخارج'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(pass)}
                          className="p-1 rounded bg-slate-800 hover:bg-blue-600/30 text-slate-300 hover:text-blue-300 transition-colors cursor-pointer"
                          title="تعديل بيانات التصريح"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === pass.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(pass.id)}
                              className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                            >
                              تأكيد
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(pass.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-600/30 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                            title="حذف التصريح"
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
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد أذونات أو تصاريح خروج مسجلة للتصفية المحددة.
          </div>
        )}
      </div>

      {/* Add Pass Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">إصدار تصريح خروج / إذن أمن</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePass} className="space-y-3.5 text-xs">
              {/* Date & Worker */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>تاريخ التصريح</span>
                  </label>
                  <input
                    type="date"
                    value={passDate}
                    onChange={(e) => setPassDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>اختيار العامل</span>
                  </label>
                  <select
                    value={selectedWorkerCode}
                    onChange={(e) => setSelectedWorkerCode(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  >
                    {workers.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-rose-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                  <button type="button" onClick={() => setFormError(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
                </div>
              )}

              {/* Pass Type & Times */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">نوع التصريح</label>
                  <select
                    value={passType}
                    onChange={(e) => {
                      const val = e.target.value as 'temporary' | 'rest_of_day' | 'delay';
                      setPassType(val);
                      setFormError(null);
                      if (val === 'delay') {
                        setExitTime('08:00');
                        setExpectedReturnTime('10:00');
                        setPassReason('delay_manager');
                      } else if (val === 'temporary') {
                        setExitTime('12:00');
                        setExpectedReturnTime('14:30');
                        setPassReason('official_mission');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="temporary">مؤقت (خروج وعودة)</option>
                    <option value="rest_of_day">مغادرة لآخر اليوم</option>
                    <option value="delay">إذن تأخير (بداية يوم متأخرة)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{passType === 'delay' ? 'وقت بداية التأخير (بداية الوردية)' : 'وقت الخروج'}</span>
                  </label>
                  <input
                    type="time"
                    value={exitTime}
                    onChange={(e) => setExitTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                {passType === 'delay' ? (
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>وقت نهاية التأخير (وصول العامل)</span>
                    </label>
                    <input
                      type="time"
                      value={expectedReturnTime}
                      onChange={(e) => setExpectedReturnTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                      required
                    />
                  </div>
                ) : passType === 'temporary' ? (
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>وقت العودة المتوقع</span>
                    </label>
                    <input
                      type="time"
                      value={expectedReturnTime}
                      onChange={(e) => setExpectedReturnTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">حالة العودة</label>
                    <div className="p-2 bg-slate-950/60 rounded border border-slate-800 text-slate-400">
                      مغادرة لليوم التالي
                    </div>
                  </div>
                )}
              </div>

              {/* Reason Category */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">
                  {passType === 'delay' ? 'سبب إذن التأخير' : 'نوع سبب الخروج'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {passType === 'delay' ? (
                    <>
                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'delay_manager' ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'delay_manager'}
                          onChange={() => setPassReason('delay_manager')}
                          className="hidden"
                        />
                        <span>إذن تأخير من المدير</span>
                      </label>

                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'delay_family' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'delay_family'}
                          onChange={() => setPassReason('delay_family')}
                          className="hidden"
                        />
                        <span>طارئ عائلي</span>
                      </label>

                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'personal_excused' ? 'bg-emerald-600/20 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'personal_excused'}
                          onChange={() => setPassReason('personal_excused')}
                          className="hidden"
                        />
                        <span>شخصي معتمد</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'official_mission' ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'official_mission'}
                          onChange={() => setPassReason('official_mission')}
                          className="hidden"
                        />
                        <span>مأمورية عمل رسمية</span>
                      </label>

                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'medical' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'medical'}
                          onChange={() => setPassReason('medical')}
                          className="hidden"
                        />
                        <span>كشف طبي / تأمين صحي</span>
                      </label>

                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'personal_excused' ? 'bg-emerald-600/20 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'personal_excused'}
                          onChange={() => setPassReason('personal_excused')}
                          className="hidden"
                        />
                        <span>شخصي معتمد (بدون خصم)</span>
                      </label>

                      <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        passReason === 'personal_with_deduction' ? 'bg-rose-600/20 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}>
                        <input
                          type="radio"
                          name="reason"
                          checked={passReason === 'personal_with_deduction'}
                          onChange={() => setPassReason('personal_with_deduction')}
                          className="hidden"
                        />
                        <span>شخصي (يخصم من الساعات)</span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* Reason Details */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">ملاحظات وسبب التصريح التفصيلي</label>
                <input
                  type="text"
                  placeholder="مثال: شراء مستلزمات لصيانة خط الإنتاج / استلام بوالص الشحن..."
                  value={reasonDetails}
                  onChange={(e) => setReasonDetails(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                />
              </div>

              {/* Approver */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">المسؤول المعتمد</label>
                <input
                  type="text"
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  required
                />
              </div>

              {isSelectedDateRetroactive && (
                <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/50 flex items-center gap-2 text-amber-300 text-[11px]">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>تنبيه: هذا التصريح بتاريخ سابق ({passDate}). سيتم اعتماده كإذن متأخر بأثر رجعي.</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer shadow-sm"
                >
                  حفظ وإصدار التصريح
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Pass Modal (Point 10) */}
      {editingPass && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">
                  تعديل تصريح الخروج (#{editingPass.id})
                </h3>
              </div>
              <button
                onClick={() => setEditingPass(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              {/* Date & Worker */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>تاريخ التصريح</span>
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    <span>العامل</span>
                  </label>
                  <select
                    value={editWorkerCode}
                    onChange={(e) => setEditWorkerCode(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  >
                    {workers.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} - {w.name} ({w.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pass Type, Exit, and Return Times */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">نوع التصريح</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as 'temporary' | 'rest_of_day' | 'delay')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="temporary">مؤقت (خروج وعودة)</option>
                    <option value="rest_of_day">مغادرة لآخر اليوم</option>
                    <option value="delay">إذن تأخير (بداية يوم متأخرة)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{editType === 'delay' ? 'وقت بداية التأخير (بداية الوردية)' : 'وقت الخروج'}</span>
                  </label>
                  <input
                    type="time"
                    value={editExitTime}
                    onChange={(e) => setEditExitTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{editType === 'delay' ? 'وقت نهاية التأخير (وصول العامل)' : 'وقت العودة (الفعلي)'}</span>
                  </label>
                  <input
                    type="time"
                    value={editReturnTime}
                    onChange={(e) => setEditReturnTime(e.target.value)}
                    disabled={editType === 'rest_of_day'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Reason Category */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">نوع سبب الخروج</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    editReason === 'official_mission' ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="radio"
                      name="editReason"
                      checked={editReason === 'official_mission'}
                      onChange={() => setEditReason('official_mission')}
                      className="hidden"
                    />
                    <span>مأمورية عمل رسمية</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    editReason === 'medical' ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="radio"
                      name="editReason"
                      checked={editReason === 'medical'}
                      onChange={() => setEditReason('medical')}
                      className="hidden"
                    />
                    <span>كشف طبي / تأمين صحي</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    editReason === 'personal_excused' ? 'bg-emerald-600/20 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="radio"
                      name="editReason"
                      checked={editReason === 'personal_excused'}
                      onChange={() => setEditReason('personal_excused')}
                      className="hidden"
                    />
                    <span>شخصي معتمد (بدون خصم)</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    editReason === 'personal_with_deduction' ? 'bg-rose-600/20 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}>
                    <input
                      type="radio"
                      name="editReason"
                      checked={editReason === 'personal_with_deduction'}
                      onChange={() => setEditReason('personal_with_deduction')}
                      className="hidden"
                    />
                    <span>شخصي (يخصم من الساعات)</span>
                  </label>
                </div>
              </div>

              {/* Reason Details */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">ملاحظات وسبب التصريح التفصيلي</label>
                <input
                  type="text"
                  value={editReasonDetails}
                  onChange={(e) => setEditReasonDetails(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  required
                />
              </div>

              {/* Approver & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">المسؤول المعتمد</label>
                  <input
                    type="text"
                    value={editApprover}
                    onChange={(e) => setEditApprover(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">حالة التصريح</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'completed')}
                    disabled={editType === 'rest_of_day'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-blue-500"
                  >
                    <option value="active">ساري بالخارج (لم يعد بعد)</option>
                    <option value="completed">معتمد ومنتهي (عاد للعمل)</option>
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPass(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
