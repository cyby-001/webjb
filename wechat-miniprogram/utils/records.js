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

  const weighted = weekday * 1.5 + weekend * 2 + holiday * 3;
  const netHours = Math.max(0, weighted - leave);

  return {
    weekday: Number(weekday.toFixed(1)),
    weekend: Number(weekend.toFixed(1)),
    holiday: Number(holiday.toFixed(1)),
    leave: Number(leave.toFixed(1)),
    weighted: Number(weighted.toFixed(1)),
    amount: Number((netHours * Number(hourlyRate || 0)).toFixed(2))
  };
}

module.exports = { payrollEstimate };