const assert = require('assert');
const { ACHIEVEMENTS, evaluateAchievements } = require('../utils/achievements');

assert.strictEqual(ACHIEVEMENTS.length, 32, '32 个成就');

const TODAY = '2026-03-10';
const ot = (date, type, start, end, duration) => ({ id: date + type + start, date, category: '加班', type, startTime: start, endTime: end, duration });
const lv = (date, type, duration) => ({ id: 'L' + date + type, date, category: '请假', type, startTime: '08:00', endTime: '17:00', duration: duration || 9 });
// 返回 { id: date } 便于断言
const eval_ = (records, opts) => {
  const map = {};
  evaluateAchievements(records, { today: TODAY, ...(opts || {}) }).forEach(({ id, date }) => { map[id] = date; });
  return map;
};

// 空记录 → 无解锁
assert.deepStrictEqual(eval_([]), {});

// 初次经历 + 触发日期 = 对应记录日期
let r = eval_([ot('2026-03-09', '平日加班', '18:00', '20:00', 2)]);
assert.strictEqual(r.first_overtime, '2026-03-09');
assert.strictEqual(r.overtime_2h, '2026-03-09');
assert.ok(!r.first_saturday);

// 周六/周日
r = eval_([ot('2026-03-07', '周末加班', '10:00', '12:00', 2)]);
assert.strictEqual(r.first_saturday, '2026-03-07');
assert.ok(!r.overtime_2h, '周末加班不算平日单次成就');

// 平日-only：周末 8h 不解锁灵魂出窍
r = eval_([ot('2026-03-06', '平日加班', '12:00', '20:00', 8)]);
assert.strictEqual(r.overtime_8h, '2026-03-06');
assert.ok(!eval_([ot('2026-03-07', '周末加班', '09:00', '17:00', 8)]).overtime_8h);

// 深夜：仅平日；跨零点；凌晨5点
r = eval_([ot('2026-03-06', '平日加班', '18:00', '22:30', 4)]);
assert.strictEqual(r.end_22, '2026-03-06');
assert.ok(!r.end_23);
r = eval_([ot('2026-03-06', '周末加班', '18:00', '23:30', 5)]);
assert.ok(!r.end_23, 'end_23 仅平日');
r = eval_([ot('2026-03-06', '平日加班', '20:00', '02:00', 5)]);
assert.strictEqual(r.cross_midnight, '2026-03-06');
assert.ok(!r.end_5am);
r = eval_([ot('2026-03-06', '平日加班', '20:00', '05:30', 8)]);
assert.strictEqual(r.end_5am, '2026-03-06');

// 连续加班 3 天 → 达成日为第 3 天
r = eval_([ot('2026-03-05', '平日加班', '18:00', '20:00', 2), ot('2026-03-06', '平日加班', '18:00', '20:00', 2), ot('2026-03-07', '周末加班', '10:00', '12:00', 2)]);
assert.strictEqual(r.overtime_3days, '2026-03-07');

// 累计 50h → 达成日为累加跨过 50h 的那天（10 次 × 5h，第 10 次在 3/3）
r = eval_([
  ot('2026-01-05', '平日加班', '18:00', '23:00', 5),
  ot('2026-02-02', '平日加班', '18:00', '23:00', 5),
  ...['2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13', '2026-02-14', '2026-02-15', '2026-02-16']
    .map((d) => ot(d, '平日加班', '18:00', '23:00', 5)),
  ot('2026-03-03', '平日加班', '18:00', '23:00', 5)
]);
assert.strictEqual(r.total_50h, '2026-03-03');
assert.ok(!r.total_100h);

// 累计成就只统计近一年（today 往前 365 天）内的记录
r = eval_([
  ...Array.from({ length: 10 }, (_, i) => ot(`2024-06-${String(i + 1).padStart(2, '0')}`, '平日加班', '18:00', '23:00', 5)),
  ot('2026-03-01', '平日加班', '18:00', '20:00', 2)
]);
assert.ok(!r.total_50h, '一年前的记录不计入累计');
r = eval_(Array.from({ length: 10 }, (_, i) => ot(`2025-03-${String(i + 11).padStart(2, '0')}`, '平日加班', '18:00', '23:00', 5)));
assert.strictEqual(r.total_50h, '2025-03-20', '窗口内的记录照常累计');

// 周末夜行者 + weekend_4（3 月周末日：7,8,14,15…达成日为第 4 个周末日 3/15）
r = eval_([ot('2026-03-07', '周末加班', '14:00', '22:30', 8)]);
assert.strictEqual(r.weekend_night, '2026-03-07');
r = eval_([7, 8, 14, 15].map((d) => ot(`2026-03-${String(d).padStart(2, '0')}`, '周末加班', '10:00', '12:00', 2)));
assert.strictEqual(r.weekend_4, '2026-03-15');

// 节假日连续两天 → 达成日为第 2 天
r = eval_([ot('2026-01-01', '节假日加班', '10:00', '12:00', 2), ot('2026-01-02', '节假日加班', '10:00', '12:00', 2)]);
assert.strictEqual(r.holiday_2days, '2026-01-02');
assert.strictEqual(r.first_holiday, '2026-01-01');

// 请假相关
r = eval_([lv('2026-03-06', '事假')]);
assert.strictEqual(r.first_leave, '2026-03-06');
assert.strictEqual(r.first_full_day_leave, '2026-03-06');
r = eval_([lv('2026-03-02', '年假'), lv('2026-03-03', '年假'), lv('2026-03-04', '年假'), ot('2026-03-05', '平日加班', '18:00', '20:00', 2)]);
assert.strictEqual(r.leave_3days, '2026-03-04');
assert.strictEqual(r.leave_then_overtime, '2026-03-05');
r = eval_([lv('2026-03-06', '调休', 4)]);
assert.strictEqual(r.comp_leave_used, '2026-03-06');
assert.ok(!eval_([lv('2026-03-06', '调休', 4)]).first_full_day_leave, '4h 调休不算完整请假');

// 连续请假自动跨过周末：周四五 + 周一 = 3 天请假，达成日为第 3 个请假日（周一）
r = eval_([lv('2026-03-05', '年假'), lv('2026-03-06', '年假'), lv('2026-03-09', '年假')]);
assert.strictEqual(r.leave_3days, '2026-03-09');
// 间隔含工作日则不跨：周四 + 周一（缺周五请假）不算连续
r = eval_([lv('2026-03-05', '年假'), lv('2026-03-09', '年假')]);
assert.ok(!r.leave_3days);

// 法定节假日可桥接：9/30 请假 + 国庆休 10/1-10/7 + 10/8、10/9 请假 = 3 个请假日，达成日 10/9
r = eval_([lv('2026-09-30', '年假'), lv('2026-10-08', '年假'), lv('2026-10-09', '年假')], { today: '2026-11-01' });
assert.strictEqual(r.leave_3days, '2026-10-09');
// 调休补班日（10/10 周六上班）不可桥接：10/9 与 10/12-13 断开，只有 2 个请假日
r = eval_([lv('2026-10-09', '年假'), lv('2026-10-12', '年假'), lv('2026-10-13', '年假')], { today: '2026-11-01' });
assert.ok(!r.leave_3days, '补班日不视为休息日');

// early_finish_streak：连续 5 天收工 ≤20:00 → 达成日第 5 天
r = eval_(Array.from({ length: 5 }, (_, i) => ot(`2026-03-0${2 + i}`, '平日加班', '16:00', '19:30', 3.5)));
assert.strictEqual(r.early_finish_streak, '2026-03-06');
r = eval_(Array.from({ length: 5 }, (_, i) => ot(`2026-03-0${2 + i}`, '平日加班', '16:00', '21:30', 5.5)));
assert.ok(!r.early_finish_streak);

// light_week：有使用痕迹但无加班的完整周 → 达成日为周日
r = eval_([ot('2026-03-01', '平日加班', '18:00', '20:00', 2), lv('2026-03-03', '事假')]);
assert.strictEqual(r.light_week, '2026-03-08');
assert.ok(!eval_([ot('2026-03-01', '平日加班', '18:00', '20:00', 2), ot('2026-03-03', '平日加班', '20:00', '21:00', 1)]).light_week);

// no_overtime_month / weekend_intact_month → 达成日为月末
r = eval_([ot('2026-01-20', '平日加班', '18:00', '20:00', 2), lv('2026-02-10', '事假')]);
assert.strictEqual(r.no_overtime_month, '2026-02-28');
assert.strictEqual(r.weekend_intact_month, '2026-02-28');
r = eval_([ot('2026-01-20', '平日加班', '18:00', '20:00', 2), ot('2026-02-08', '周末加班', '10:00', '12:00', 2)]);
assert.ok(!r.no_overtime_month && !r.weekend_intact_month);
r = eval_([ot('2026-01-20', '平日加班', '18:00', '20:00', 2), ot('2026-02-09', '平日加班', '18:00', '20:00', 2)]);
assert.strictEqual(r.weekend_intact_month, '2026-02-28');
assert.ok(!r.no_overtime_month);

// 新装用户当月不结算
r = eval_([ot('2026-03-01', '平日加班', '18:00', '20:00', 2)]);
assert.ok(!r.light_week && !r.no_overtime_month && !r.weekend_intact_month);

console.log('achievements tests passed');
