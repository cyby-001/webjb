const assert = require('assert');
const { payrollEstimate, buildClockRecord } = require('../utils/records');
const { RecordCategory, OvertimeType } = require('../utils/constants');

// 打卡模式记录要素
(function clockRecordBasics() {
  const settings = { otDefaultStart: '18:00', leaveDefaultStart: '08:00', restPeriods: [{ start: '12:00', end: '13:00' }] };
  // 2026-09-18 周五 20:30 下班 → 平日 18:00~20:30 = 2.5h
  let r = buildClockRecord('2026-09-18', '20:30', settings);
  assert.strictEqual(r.type, OvertimeType.WEEKDAY);
  assert.strictEqual(r.startTime, '18:00');
  assert.strictEqual(r.duration, 2.5);
  // 2026-09-19 周六 12:30 → 周末，起点用全天班 08:00，扣午休 0.5h = 4h
  r = buildClockRecord('2026-09-19', '12:30', settings);
  assert.strictEqual(r.type, OvertimeType.WEEKEND);
  assert.strictEqual(r.startTime, '08:00');
  assert.strictEqual(r.duration, 4);
  // 2026-10-01 国庆节 → 节假日类型
  assert.strictEqual(buildClockRecord('2026-10-01', '12:30', settings).type, OvertimeType.HOLIDAY);
  // 未到默认开始时间 → null（周五 17:59）
  assert.strictEqual(buildClockRecord('2026-09-18', '17:59', settings), null);
  // 半小时向下取整：20:39 → 记到 20:30
  r = buildClockRecord('2026-09-18', '20:39', settings);
  assert.strictEqual(r.endTime, '20:30');
  assert.strictEqual(r.duration, 2.5);
  // 20:20 → 记到 20:00
  assert.strictEqual(buildClockRecord('2026-09-18', '20:20', settings).endTime, '20:00');
  // 取整后不足一个起点间隔 → null（周六 08:20 → 08:00 = 起点本身）
  assert.strictEqual(buildClockRecord('2026-09-19', '08:20', settings), null);
})();

function record(category, type, duration, date = '2026-04-01') {
  return { category, type, duration, date };
}

(function shouldKeepOriginalHoursVisibleWhileDeductingForSettlement() {
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 2),
    record(RecordCategory.OVERTIME, OvertimeType.WEEKEND, 3),
    record(RecordCategory.OVERTIME, OvertimeType.HOLIDAY, 4),
    record(RecordCategory.LEAVE, '', 3)
  ], '2026-04-01', '2026-04-30', 10);

  assert.deepStrictEqual(result, {
    weekday: 2,
    weekend: 3,
    holiday: 4,
    leave: 3,
    weighted: 16,
    settlementHours: 6,
    amount: 160,
    tierText: null
  });
})();

(function shouldNotGoNegativeWhenLeaveExceedsOvertime() {
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 1),
    record(RecordCategory.LEAVE, '', 5)
  ], '2026-04-01', '2026-04-30', 10);

  assert.deepStrictEqual(result, {
    weekday: 1,
    weekend: 0,
    holiday: 0,
    leave: 5,
    weighted: 0,
    settlementHours: 0,
    amount: 0,
    tierText: null
  });
})();

(function shouldApplyCustomRuleMultipliers() {
  // 平日 x1 周末 x1.5 节假日 x2：2*1 + 3*1.5 + 4*2 = 14.5，无请假
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 2),
    record(RecordCategory.OVERTIME, OvertimeType.WEEKEND, 3),
    record(RecordCategory.OVERTIME, OvertimeType.HOLIDAY, 4)
  ], '2026-04-01', '2026-04-30', 10, { weekday: 1, weekend: 1.5, holiday: 2, deductLeave: true });

  assert.strictEqual(result.weighted, 14.5);
  assert.strictEqual(result.amount, 145);
})();

(function shouldNotDeductLeaveWhenRuleDisablesIt() {
  // 不抵扣调休：weighted 与金额不受请假影响
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 2),
    record(RecordCategory.LEAVE, '', 3)
  ], '2026-04-01', '2026-04-30', 10, { weekday: 1.5, weekend: 2, holiday: 3, deductLeave: false });

  assert.strictEqual(result.weighted, 3);
  assert.strictEqual(result.settlementHours, 2);
  assert.strictEqual(result.amount, 30);
})();

(function shouldFallbackToStandardWhenRuleInvalid() {
  // 缺省 / 非法规则 → 法定标准
  const records = [record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 2)];
  assert.strictEqual(payrollEstimate(records, '2026-04-01', '2026-04-30', 10).weighted, 3);
  assert.strictEqual(payrollEstimate(records, '2026-04-01', '2026-04-30', 10, { weekday: -1 }).weighted, 3);
})();

// 阶梯规则（档位固定加班费）：开始 40h、每档 5h、首档 600、每档递增 100、最大 60h
const TIER_RULE = { mode: 'tier', startHours: 40, intervalHours: 5, baseAmount: 600, stepIncrement: 100, maxHours: 60, deductLeave: true };

(function shouldPayFirstBracketAmount() {
  // 42h 落在 40–45h 档 → 600 元
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 42, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, TIER_RULE);

  assert.strictEqual(result.amount, 600);
  assert.strictEqual(result.tierText, '40–45h');
  assert.strictEqual(result.weighted, 0);
})();

(function shouldIncreaseByStepIncrement() {
  // 47h 落在 45–50h 档 → 600 + 100 = 700
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 47, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, TIER_RULE);

  assert.strictEqual(result.amount, 700);
  assert.strictEqual(result.tierText, '45–50h');
})();

(function shouldCapAtMaxHours() {
  // 58h 落在 55–60h 档 → 600 + 100 × 3 = 900
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 58, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, TIER_RULE);

  assert.strictEqual(result.amount, 900);
  assert.strictEqual(result.tierText, '55–60h');
})();

(function shouldAddOneMoreWhenBeyondMaxHours() {
  // 62h 超出最大 60h → 封顶档 900 之上再加一次递增 → 1000
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 62, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, TIER_RULE);

  assert.strictEqual(result.amount, 1000);
  assert.strictEqual(result.tierText, '60h 以上');
})();

(function shouldPayNothingBelowStartHours() {
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 30, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, TIER_RULE);

  assert.strictEqual(result.amount, 0);
  assert.strictEqual(result.tierText, null);
})();

(function shouldDeductLeaveBeforeBracketing() {
  // 45h 抵扣 5h 请假 → 40h → 首档 600；不抵扣时 45h → 临界归上一档 40–45h → 600
  const records = [record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 45, '2026-04-01'), record(RecordCategory.LEAVE, '', 5, '2026-04-02')];
  assert.strictEqual(payrollEstimate(records, '2026-04-01', '2026-04-30', 10, TIER_RULE).amount, 600);
  assert.strictEqual(
    payrollEstimate(records, '2026-04-01', '2026-04-30', 10, { ...TIER_RULE, deductLeave: false }).amount,
    600
  );
  // 46h 才落进 45–50h 档 → 700
  assert.strictEqual(
    payrollEstimate([record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 46, '2026-04-01')], '2026-04-01', '2026-04-30', 10, TIER_RULE).amount,
    700
  );
})();

(function shouldIgnoreTierConfigWhenModeIsNotTier() {
  // 带 tier 参数但 mode 不是 tier → 走固定倍数
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 2, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, { ...TIER_RULE, mode: 'standard', weekday: 1.5, weekend: 2, holiday: 3 });

  assert.strictEqual(result.weighted, 3);
  assert.strictEqual(result.amount, 30);
})();

// 前置档：前几段间隔与金额自定义，之后统一间隔/递增
// 例：40–42h 600 元、42–45h 650 元，之后每 5h 一档递增 50 元，最大 60h
const FRONT_RULE = {
  mode: 'tier',
  startHours: 40,
  frontBrackets: [{ hours: 2, amount: 600 }, { hours: 3, amount: 650 }],
  intervalHours: 5,
  baseAmount: 600,
  stepIncrement: 50,
  maxHours: 60,
  deductLeave: true
};

(function shouldHitFrontBracket() {
  // 41h → 前置档 1（40–42h）→ 600
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 41, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, FRONT_RULE);
  assert.strictEqual(result.amount, 600);
  assert.strictEqual(result.tierText, '40–42h');
})();

(function shouldHitSecondFrontBracket() {
  // 43h → 前置档 2（42–45h）→ 650
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 43, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, FRONT_RULE);
  assert.strictEqual(result.amount, 650);
  assert.strictEqual(result.tierText, '42–45h');
})();

(function shouldContinueUniformAfterFronts() {
  // 47h → 统一档第一档（45–50h）= 650 + 50 = 700
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 47, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, FRONT_RULE);
  assert.strictEqual(result.amount, 700);
  assert.strictEqual(result.tierText, '45–50h');
})();

(function shouldCapUniformAtMaxHours() {
  // 58h → 统一档 55–60h = 650 + 50 × 3 = 800
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 58, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, FRONT_RULE);
  assert.strictEqual(result.amount, 800);
  assert.strictEqual(result.tierText, '55–60h');
})();

(function shouldAddFrontOneMoreWhenBeyondMaxHours() {
  // 62h 超出最大 60h → 800 之上再加一次递增 → 850
  const result = payrollEstimate([
    record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, 62, '2026-04-01')
  ], '2026-04-01', '2026-04-30', 10, FRONT_RULE);
  assert.strictEqual(result.amount, 850);
  assert.strictEqual(result.tierText, '60h 以上');
})();

(function shouldUseUpperBoundForBoundaryHours() {
  // 临界点归上一档（≤ 上限）：42h → 40–42h 档（600）；45h → 42–45h 档（650）
  // 最大时长同理：60h → 55–60h 档（TIER_RULE 900）
  const mk = (h) => [record(RecordCategory.OVERTIME, OvertimeType.WEEKDAY, h, '2026-04-01')];
  assert.strictEqual(payrollEstimate(mk(42), '2026-04-01', '2026-04-30', 10, FRONT_RULE).amount, 600);
  assert.strictEqual(payrollEstimate(mk(45), '2026-04-01', '2026-04-30', 10, FRONT_RULE).amount, 650);
  assert.strictEqual(payrollEstimate(mk(60), '2026-04-01', '2026-04-30', 10, TIER_RULE).amount, 900);
  assert.strictEqual(payrollEstimate(mk(60), '2026-04-01', '2026-04-30', 10, TIER_RULE).tierText, '55–60h');
})();

// 非法倍数走默认值的存储归一化
(function shouldNormalizePayRule() {
  global.wx = { getStorageSync: () => '', setStorageSync: () => {} };
  const { loadSettings } = require('../utils/storage');
  const rule = loadSettings().payRule;
  assert.strictEqual(rule.weekday, 1.5);
  assert.strictEqual(rule.startHours, 40);
  assert.strictEqual(rule.intervalHours, 5);
})();

(function shouldNormalizeOvertimeCardCompactPreference() {
  global.wx = { getStorageSync: () => undefined, setStorageSync: () => {} };
  const { normalizeCompactCardPreference } = require('../utils/storage');
  assert.strictEqual(normalizeCompactCardPreference(undefined), true);
  assert.strictEqual(normalizeCompactCardPreference('compact'), true);
  assert.strictEqual(normalizeCompactCardPreference('expanded'), false);
  assert.strictEqual(normalizeCompactCardPreference(false), false);
})();

(function shouldNormalizeCalcModePreference() {
  global.wx = { getStorageSync: () => undefined, setStorageSync: () => {} };
  const { normalizeCalcModePreference } = require('../utils/storage');
  assert.strictEqual(normalizeCalcModePreference(undefined), 'money');
  assert.strictEqual(normalizeCalcModePreference('money'), 'money');
  assert.strictEqual(normalizeCalcModePreference('leave'), 'leave');
  assert.strictEqual(normalizeCalcModePreference('illegal'), 'money');
})();

console.log('payrollEstimate tests passed');
