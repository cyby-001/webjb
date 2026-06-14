const assert = require('assert');
const { payrollEstimate } = require('../utils/records');
const { RecordCategory, OvertimeType } = require('../utils/constants');

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
    amount: 160
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
    amount: 0
  });
})();

console.log('payrollEstimate tests passed');
