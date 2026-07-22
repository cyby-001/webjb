const { RecordCategory, OvertimeType } = require('./constants');

function payrollEstimate(records, startDate, endDate, hourlyRate) {
  const selected = records.filter((r) => r.date >= startDate && r.date <= endDate);
  let weekday = 0;
  let weekend = 0;
  let holiday = 0;
  let leave = 0;

  selected.forEach((r) => {
    const h = Number(r.duration || 0);
    if (r.category === RecordCategory.LEAVE) {
      leave += h;
      return;
    }
    if (r.type === OvertimeType.WEEKEND) weekend += h;
    else if (r.type === OvertimeType.HOLIDAY) holiday += h;
    else weekday += h;
  });

  let remainingLeave = leave;

  const deduct = (hours) => {
    if (remainingLeave <= 0) return hours;
    const deduction = Math.min(hours, remainingLeave);
    remainingLeave -= deduction;
    return hours - deduction;
  };

  const payableWeekday = deduct(weekday);
  const payableWeekend = deduct(weekend);
  const payableHoliday = deduct(holiday);
  const settlementHours = payableWeekday + payableWeekend + payableHoliday;
  const weighted = payableWeekday * 1.5 + payableWeekend * 2 + payableHoliday * 3;

  return {
    weekday: Number(weekday.toFixed(2)),
    weekend: Number(weekend.toFixed(2)),
    holiday: Number(holiday.toFixed(2)),
    leave: Number(leave.toFixed(2)),
    weighted: Number(weighted.toFixed(2)),
    settlementHours: Number(settlementHours.toFixed(2)),
    amount: Number((weighted * Number(hourlyRate || 0)).toFixed(2))
  };
}

module.exports = { payrollEstimate };
