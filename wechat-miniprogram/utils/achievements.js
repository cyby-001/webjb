// 成就系统：32 个成就，全部由全量记录纯函数推导（幂等）
// evaluateAchievements 返回 [{ id, date }]，date 为成就达成的自然日（YYYY-MM-DD）
const ACHIEVEMENTS = [
  { id: 'first_overtime', name: '初入江湖', category: '初次经历', emoji: '🌱', desc: '第一次记录有效加班', quote: '第一次把加班交给了记录' },
  { id: 'first_saturday', name: '周末去哪儿了', category: '初次经历', emoji: '📅', desc: '第一次周六加班', quote: '第一次把周六交给了工作' },
  { id: 'first_sunday', name: '周日限定', category: '初次经历', emoji: '☀️', desc: '第一次周日加班', quote: '周日也没能逃过工作' },
  { id: 'first_holiday', name: '假期失踪人口', category: '初次经历', emoji: '🏖️', desc: '第一次法定节假日加班', quote: '假期和你见了一面，然后被工作接走了' },
  { id: 'overtime_2h', name: '小试牛刀', category: '单次加班', emoji: '🐣', desc: '单次平日加班 ≥2小时', quote: '今天的私人时间被占用了一部分' },
  { id: 'overtime_4h', name: '公司镇宅石', category: '单次加班', emoji: '🗿', desc: '单次平日加班 ≥4小时', quote: '你已经和公司融为一体' },
  { id: 'overtime_8h', name: '灵魂出窍', category: '单次加班', emoji: '👻', desc: '单次平日加班 ≥8小时', quote: '身体还在公司，灵魂已经下班' },
  { id: 'overtime_12h', name: '这已经算一天了', category: '单次加班', emoji: '🌗', desc: '单次平日加班 ≥12小时', quote: '这到底算加班，还是又上了一天班？' },
  { id: 'end_22', name: '夜幕降临', category: '深夜经历', emoji: '🌆', desc: '平日加班结束时间 ≥22:00', quote: '夜已经开始了，你还没有下班' },
  { id: 'end_23', name: '夜猫子', category: '深夜经历', emoji: '🦉', desc: '平日加班结束时间 ≥23:00', quote: '这个点还在工作，猫都准备睡觉了' },
  { id: 'cross_midnight', name: '日夜颠倒', category: '深夜经历', emoji: '🌓', desc: '加班跨越00:00（结束时间在次日凌晨）', quote: '昨天的工作，今天凌晨才算结束' },
  { id: 'end_5am', name: '天快亮了', category: '深夜经历', emoji: '🌅', desc: '跨零点且结束时间 ≥05:00', quote: '你和太阳完成了一次交接班' },
  { id: 'weekend_4', name: '周末常驻人口', category: '周末', emoji: '🏠', desc: '同一自然月内 ≥4个周六/周日加班', quote: '周末已经开始认识你了' },
  { id: 'weekend_night', name: '周末夜行者', category: '周末', emoji: '🌙', desc: '周六/周日加班且结束时间 ≥22:00', quote: '别人准备睡觉的时候，你还在工作' },
  { id: 'holiday_2days', name: '假期也没跑掉', category: '节假日', emoji: '🎏', desc: '同一节假日连续两天加班', quote: '假期成功地加了个班' },
  { id: 'overtime_3days', name: '三连加班', category: '连续加班', emoji: '🔥', desc: '连续3个自然日加班', quote: '连续三天，你都没有准时下班' },
  { id: 'overtime_7days', name: '七日无休', category: '连续加班', emoji: '📆', desc: '连续7个自然日加班', quote: '一周过去了，你还在加班' },
  { id: 'overtime_14days', name: '公司基础设施', category: '连续加班', emoji: '🏢', desc: '连续14个自然日加班', quote: '你已经成为公司基础设施的一部分，记得基础设施也需要维护保养' },
  { id: 'overtime_30days', name: '不要解锁这个', category: '连续加班', emoji: '😵', desc: '连续30个自然日加班', quote: '你真的解锁了，如果一直是这个状态，值得找个时间喘口气' },
  { id: 'total_50h', name: '时间开始有重量', category: '累计加班', emoji: '⚖️', desc: '累计有效加班 ≥50小时', quote: '你已经花了不少私人时间在工作上' },
  { id: 'total_100h', name: '一整天都不见了', category: '累计加班', emoji: '😶', desc: '累计有效加班 ≥100小时', quote: '这已经相当于12.5个8小时工作日' },
  { id: 'total_500h', name: '时间黑洞', category: '累计加班', emoji: '🕳️', desc: '累计有效加班 ≥500小时', quote: '时间似乎掉进了某个黑洞，如果最近一直这样，记得留一点时间给自己' },
  { id: 'first_leave', name: '第一次请假', category: '请假经历', emoji: '🍃', desc: '第一次记录有效请假', quote: '工作暂停了一下' },
  { id: 'first_full_day_leave', name: '今天不上班', category: '请假经历', emoji: '🛌', desc: '第一次完整请假 ≥1天', quote: '今天的工作与你无关' },
  { id: 'leave_3days', name: '人间蒸发', category: '请假经历', emoji: '💨', desc: '单次连续请假 ≥3天', quote: '连续几天从工作世界暂时消失' },
  { id: 'leave_5days', name: '长假开始', category: '请假经历', emoji: '🎉', desc: '单次连续请假 ≥5天', quote: '这次是真的休息了一阵' },
  { id: 'leave_then_overtime', name: '假期结束综合征', category: '请假经历', emoji: '🔁', desc: '连续请假结束后第一个工作日加班', quote: '假期刚结束，工作已经开始反击' },
  { id: 'light_week', name: '这周还挺松', category: '平衡记录', emoji: '🍀', desc: '自然周内无任何加班记录', quote: '这周一次班都没加，难得的松弛感' },
  { id: 'no_overtime_month', name: '这个月挺清净', category: '平衡记录', emoji: '🍵', desc: '自然月内无任何加班记录', quote: '这个月完全没有加班记录，挺难得的' },
  { id: 'weekend_intact_month', name: '周末完整保留', category: '平衡记录', emoji: '🧩', desc: '自然月内所有周六日均无加班记录', quote: '这个月的周末，一次都没被工作占用' },
  { id: 'comp_leave_used', name: '调休真的用上了', category: '平衡记录', emoji: '🎫', desc: '记录一次调休请假', quote: '欠你的调休，这次真的兑现了' },
  { id: 'early_finish_streak', name: '连续收得不晚', category: '平衡记录', emoji: '🎈', desc: '连续5天有加班记录且结束时间均 ≤20:00', quote: '最近几天虽然有加班，但收得都不算晚' }
];

const OVERTIME_TYPE = '平日加班';
const HOLIDAY_TYPE = '节假日加班';
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(dateStr) {
  return new Date((dateStr || '').replace(/-/g, '/') + ' 00:00:00');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d, n) {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + n);
  return next;
}

function minDate(current, candidate) {
  if (candidate && (!current || candidate < current)) return candidate;
  return current;
}

// 连续 n 个自然日的首个窗口：返回窗口最后一天，未达成返回 null
function firstStreakCompletion(dates, n) {
  const sorted = [...new Set(dates)].sort();
  let count = 0;
  let prev = null;
  for (const dateStr of sorted) {
    count = prev && (toDate(dateStr) - toDate(prev)) === DAY_MS ? count + 1 : 1;
    prev = dateStr;
    if (count >= n) return dateStr;
  }
  return null;
}

function isWeekendDate(dateStr) {
  const day = toDate(dateStr).getDay();
  return day === 0 || day === 6;
}

// records: 全量记录；opts: { leaveFullDayHours, today }
// 返回当前应解锁的全部成就 [{ id, date }]（含历史，调用方自行 diff）
function evaluateAchievements(records, opts) {
  const options = opts || {};
  const leaveFullDay = Number(options.leaveFullDayHours) > 0 ? Number(options.leaveFullDayHours) : 9;
  const today = options.today ? toDate(options.today) : new Date();
  today.setHours(0, 0, 0, 0);

  const all = Array.isArray(records) ? records : [];
  const ot = all.filter((r) => r.category === '加班');
  const leave = all.filter((r) => r.category === '请假');
  const results = [];
  const add = (id, date) => { if (date && !results.some((x) => x.id === id)) results.push({ id, date }); };

  if (!all.length) return [];

  const otByDate = new Map();
  ot.forEach((r) => {
    if (!otByDate.has(r.date)) otByDate.set(r.date, []);
    otByDate.get(r.date).push(r);
  });

  /* --- 初次经历 --- */
  add('first_overtime', ot.map((r) => r.date).sort()[0]);
  add('first_saturday', ot.filter((r) => toDate(r.date).getDay() === 6).map((r) => r.date).sort()[0]);
  add('first_sunday', ot.filter((r) => toDate(r.date).getDay() === 0).map((r) => r.date).sort()[0]);
  add('first_holiday', ot.filter((r) => r.type === HOLIDAY_TYPE).map((r) => r.date).sort()[0]);

  /* --- 单次加班（仅平日加班类型） --- */
  const weekdayOt = ot.filter((r) => r.type === OVERTIME_TYPE);
  [[2, 'overtime_2h'], [4, 'overtime_4h'], [8, 'overtime_8h'], [12, 'overtime_12h']].forEach(([hours, id]) => {
    add(id, weekdayOt.filter((r) => (Number(r.duration) || 0) >= hours).map((r) => r.date).sort()[0]);
  });

  /* --- 深夜经历 --- */
  add('end_22', weekdayOt.filter((r) => r.endTime >= '22:00').map((r) => r.date).sort()[0]);
  add('end_23', weekdayOt.filter((r) => r.endTime >= '23:00').map((r) => r.date).sort()[0]);
  add('cross_midnight', ot.filter((r) => r.endTime && r.startTime && r.endTime < r.startTime).map((r) => r.date).sort()[0]);
  add('end_5am', ot.filter((r) => r.endTime && r.startTime && r.endTime < r.startTime && r.endTime >= '05:00').map((r) => r.date).sort()[0]);
  add('weekend_night', ot.filter((r) => isWeekendDate(r.date) && r.endTime >= '22:00').map((r) => r.date).sort()[0]);

  /* --- 周末 / 节假日 --- */
  // weekend_4：每月周末日排序后取第 4 个，取最早的达成日
  const byMonth = {};
  otByDate.forEach((_, dateStr) => {
    if (isWeekendDate(dateStr)) (byMonth[dateStr.slice(0, 7)] = byMonth[dateStr.slice(0, 7)] || []).push(dateStr);
  });
  let weekend4Date = null;
  Object.values(byMonth).forEach((dates) => {
    dates.sort();
    if (dates.length >= 4) weekend4Date = minDate(weekend4Date, dates[3]);
  });
  add('weekend_4', weekend4Date);

  const holidayDates = new Set(ot.filter((r) => r.type === HOLIDAY_TYPE).map((r) => r.date));
  let holiday2Date = null;
  holidayDates.forEach((d) => {
    const next = fmtDate(addDays(toDate(d), 1));
    if (holidayDates.has(next)) holiday2Date = minDate(holiday2Date, next);
  });
  add('holiday_2days', holiday2Date);

  /* --- 连续加班 / 累计 --- */
  const otDateList = [...otByDate.keys()];
  add('overtime_3days', firstStreakCompletion(otDateList, 3));
  add('overtime_7days', firstStreakCompletion(otDateList, 7));
  add('overtime_14days', firstStreakCompletion(otDateList, 14));
  add('overtime_30days', firstStreakCompletion(otDateList, 30));

  const totalThresholds = [[50, 'total_50h'], [100, 'total_100h'], [500, 'total_500h']];
  const otByDateSorted = [...ot].sort((a, b) => (a.date < b.date ? -1 : 1));
  let cum = 0;
  const totalHit = {};
  for (const r of otByDateSorted) {
    cum += Number(r.duration) || 0;
    totalThresholds.forEach(([hours, id]) => {
      if (!totalHit[id] && cum >= hours) totalHit[id] = r.date;
    });
  }
  totalThresholds.forEach(([, id]) => add(id, totalHit[id]));

  /* --- 请假经历 --- */
  add('first_leave', leave.map((r) => r.date).sort()[0]);
  add('first_full_day_leave', leave.filter((r) => (Number(r.duration) || 0) >= leaveFullDay).map((r) => r.date).sort()[0]);
  add('comp_leave_used', leave.filter((r) => r.type === '调休').map((r) => r.date).sort()[0]);

  const leaveRuns = [];
  {
    const sorted = [...new Set(leave.map((r) => r.date))].sort();
    let cur = null;
    sorted.forEach((dateStr) => {
      if (cur && (toDate(dateStr) - toDate(cur.end)) === DAY_MS) {
        cur.end = dateStr;
        cur.len += 1;
      } else {
        cur = { start: dateStr, end: dateStr, len: 1 };
        leaveRuns.push(cur);
      }
    });
  }
  const firstLeaveRunN = (n) => {
    const run = leaveRuns.find((r) => r.len >= n);
    return run ? fmtDate(addDays(toDate(run.start), n - 1)) : null;
  };
  add('leave_3days', firstLeaveRunN(3));
  add('leave_5days', firstLeaveRunN(5));
  const thenOt = leaveRuns.find((r) => otByDate.has(fmtDate(addDays(toDate(r.end), 1))));
  add('leave_then_overtime', thenOt ? fmtDate(addDays(toDate(thenOt.end), 1)) : null);

  /* --- 平衡记录 --- */
  const earlyDates = [];
  otByDate.forEach((dayRecords, dateStr) => {
    if (dayRecords.every((r) => r.endTime > r.startTime && r.endTime <= '20:00')) earlyDates.push(dateStr);
  });
  add('early_finish_streak', firstStreakCompletion(earlyDates, 5));

  // 周期结算：限定在首次记录之后的完整自然周/月，避免新装用户误触发
  const firstDate = toDate(all.map((r) => r.date).sort()[0]);

  // light_week：有使用痕迹且无加班的完整自然周，达成日为周日
  let weekStart = addDays(firstDate, (8 - firstDate.getDay()) % 7);
  while (addDays(weekStart, 6) < today) {
    const weekEnd = addDays(weekStart, 6);
    let weekOt = 0;
    let weekHasRecord = false;
    all.forEach((r) => {
      const d = toDate(r.date);
      if (d >= weekStart && d <= weekEnd) {
        weekHasRecord = true;
        if (r.category === '加班') weekOt += Number(r.duration) || 0;
      }
    });
    if (weekHasRecord && weekOt === 0) { add('light_week', fmtDate(weekEnd)); break; }
    weekStart = addDays(weekStart, 7);
  }

  // no_overtime_month / weekend_intact_month：首次记录月份之后的完整自然月，达成日为月末
  let monthCursor = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 1);
  while (new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0) < today) {
    const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const monthPrefix = `${monthCursor.getFullYear()}-${pad(monthCursor.getMonth() + 1)}`;
    const monthOt = ot.filter((r) => r.date.slice(0, 7) === monthPrefix);
    if (monthOt.length === 0) add('no_overtime_month', fmtDate(monthEnd));
    if (monthOt.every((r) => !isWeekendDate(r.date))) add('weekend_intact_month', fmtDate(monthEnd));
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    if (results.some((x) => x.id === 'no_overtime_month') && results.some((x) => x.id === 'weekend_intact_month')) break;
  }

  return results;
}

module.exports = { ACHIEVEMENTS, evaluateAchievements };
