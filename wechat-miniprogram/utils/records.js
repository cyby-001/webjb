const { RecordCategory, OvertimeType } = require('./constants');
const { calcDuration } = require('./time');
const { entryFor } = require('./holidays');

// 打卡模式：由当前时刻生成加班记录要素，结束时间半小时向下取整。
// 平日起点 otDefaultStart，周末/节假日起点 leaveDefaultStart（与编辑层默认一致），
// 取整后不晚于起点返回 null
function buildClockRecord(dateStr, nowText, settings) {
  const s = settings || {};
  const day = new Date(`${dateStr.replace(/-/g, '/')} 00:00:00`).getDay();
  const entry = entryFor(dateStr);
  const isRest = (entry && entry.off) || day === 0 || day === 6;
  const startTime = isRest ? (s.leaveDefaultStart || '08:00') : (s.otDefaultStart || '18:00');
  const parts = (nowText || '').split(':').map(Number);
  if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const total = Math.floor((parts[0] * 60 + parts[1]) / 30) * 30;
  const endTime = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  if (endTime <= startTime) return null;
  const duration = calcDuration(startTime, endTime, s.restPeriods);
  if (duration <= 0) return null;
  return {
    date: dateStr,
    category: RecordCategory.OVERTIME,
    type: entry && entry.off ? OvertimeType.HOLIDAY : (day === 0 || day === 6 ? OvertimeType.WEEKEND : OvertimeType.WEEKDAY),
    startTime,
    endTime,
    duration: Number(duration.toFixed(2))
  };
}

function cloneImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((item) => typeof item === 'string' && item).slice(0, 3);
}

function clonePeriods(periods) {
  if (!Array.isArray(periods)) return [];
  return periods.map((item) => ({
    id: item.id,
    start: item.start,
    end: item.end,
    label: item.label
  }));
}

// rule: { weekday, weekend, holiday, deductLeave, mode, startHours, frontBrackets, intervalHours, baseAmount, stepIncrement, maxHours }
// mode='tier'（阶梯固定加班费）：结算周期内累计应付加班时长落入档位 → 当月固定金额。
// 前置档（最多 3 个）：间隔与金额逐个自定义；之后的统一档从 startHours+Σ前置间隔 起，
// 每档 = 上一档金额 + stepIncrement，直到 maxHours 封顶；无前置档时首档金额 = baseAmount
function payrollEstimate(records, startDate, endDate, hourlyRate, rule) {
  const r = rule && typeof rule === 'object' ? rule : {};
  const num = (v, dft) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : dft;
  };
  const mulWeekday = num(r.weekday, 1.5);
  const mulWeekend = num(r.weekend, 2);
  const mulHoliday = num(r.holiday, 3);
  const deductLeaveEnabled = r.deductLeave !== false;
  const fronts = Array.isArray(r.frontBrackets)
    ? r.frontBrackets
      .map((f) => ({ hours: Number(f && f.hours), amount: Number(f && f.amount) }))
      .filter((f) => f.hours > 0 && f.amount >= 0)
    : [];
  const tierCfg = r.mode === 'tier'
    ? {
      start: num(r.startHours, 40),
      interval: num(r.intervalHours, 5),
      base: Number(r.baseAmount) > 0 ? Number(r.baseAmount) : 600,
      step: Number.isFinite(Number(r.stepIncrement)) && Number(r.stepIncrement) >= 0 ? Number(r.stepIncrement) : 100,
      max: num(r.maxHours, 60)
    }
    : null;

  const selected = records.filter((r2) => r2.date >= startDate && r2.date <= endDate);
  const otRecords = selected
    .filter((rec) => rec.category === RecordCategory.OVERTIME)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const leave = selected
    .filter((rec) => rec.category === RecordCategory.LEAVE)
    .reduce((sum, rec) => sum + Number(rec.duration || 0), 0);

  const typeMul = (rec) => {
    if (rec.type === OvertimeType.WEEKEND) return mulWeekend;
    if (rec.type === OvertimeType.HOLIDAY) return mulHoliday;
    return mulWeekday;
  };

  let remainingLeave = deductLeaveEnabled ? leave : 0;
  let weighted = 0;
  let settlementHours = 0;

  otRecords.forEach((rec) => {
    let hours = Number(rec.duration || 0);
    if (remainingLeave > 0) {
      const deduction = Math.min(hours, remainingLeave);
      remainingLeave -= deduction;
      hours -= deduction;
    }
    if (hours <= 0) return;
    settlementHours += hours;
    if (!tierCfg) weighted += hours * typeMul(rec);
  });

  let amount;
  let tierText = null;
  if (tierCfg) {
    // 阶梯固定金额：按时长落档，金额与小时薪无关
    let bracket = 0;
    if (settlementHours >= tierCfg.start && (fronts.length || tierCfg.base > 0)) {
      // 先走前置档：间隔与金额逐个自定义
      // 临界点归上一档（≤ 上限）：42h 归 40–42h 档、45h 归 42–45h 档
      let pos = tierCfg.start;
      let rem = settlementHours - tierCfg.start;
      let lastAmount = null;
      let hit = false;
      for (const f of fronts) {
        if (rem <= f.hours) {
          bracket = f.amount;
          tierText = `${pos}–${pos + f.hours}h`;
          hit = true;
          break;
        }
        rem -= f.hours;
        pos += f.hours;
        lastAmount = f.amount;
      }
      // 统一档：每档 = 上一档金额 + 递增金额（无前置档时首档 = baseAmount）
      // 临界点同样归上一档：档位 (下限, 上限]，n = ceil(rem / interval) - 1
      if (!hit && tierCfg.interval > 0) {
        const baseVal = fronts.length ? lastAmount + tierCfg.step : tierCfg.base;
        const n = Math.max(0, Math.ceil(rem / tierCfg.interval) - 1);
        const maxN = tierCfg.max > pos ? Math.max(0, Math.ceil((tierCfg.max - pos) / tierCfg.interval) - 1) : Infinity;
        if (settlementHours > tierCfg.max) {
          // 严格超出最大时长：在封顶档之上再加一次递增
          bracket = baseVal + (maxN + 1) * tierCfg.step;
          tierText = `${tierCfg.max}h 以上`;
        } else {
          const capped = tierCfg.max > pos;
          const idx = Math.min(n, maxN);
          const lastFrom = capped ? Math.max(pos, tierCfg.max - tierCfg.interval) : Infinity;
          const from = Math.min(pos + idx * tierCfg.interval, lastFrom);
          const to = capped ? Math.min(from + tierCfg.interval, tierCfg.max) : from + tierCfg.interval;
          bracket = baseVal + idx * tierCfg.step;
          tierText = `${from}–${to}h`;
        }
      }
    }
    weighted = 0;
    amount = Number(bracket.toFixed(2));
  } else {
    amount = Number((weighted * Number(hourlyRate || 0)).toFixed(2));
  }

  const totalWeekday = otRecords.filter((rec) => rec.type === OvertimeType.WEEKDAY).reduce((s, rec) => s + Number(rec.duration || 0), 0);
  const totalWeekend = otRecords.filter((rec) => rec.type === OvertimeType.WEEKEND).reduce((s, rec) => s + Number(rec.duration || 0), 0);
  const totalHoliday = otRecords.filter((rec) => rec.type === OvertimeType.HOLIDAY).reduce((s, rec) => s + Number(rec.duration || 0), 0);

  return {
    weekday: Number(totalWeekday.toFixed(2)),
    weekend: Number(totalWeekend.toFixed(2)),
    holiday: Number(totalHoliday.toFixed(2)),
    leave: Number(leave.toFixed(2)),
    weighted: Number(weighted.toFixed(2)),
    settlementHours: Number(settlementHours.toFixed(2)),
    amount,
    tierText
  };
}

module.exports = { payrollEstimate, cloneImages, clonePeriods, buildClockRecord };
