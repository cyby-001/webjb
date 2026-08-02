function toMinutes(timeText) {
  const parts = (timeText || '00:00').split(':').map(Number);
  const hours = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  return hours * 60 + minutes;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcDuration(start, end, restPeriods) {
  let startMin = toMinutes(start);
  let endMin = toMinutes(end);

  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  let restHours = 0;
  (restPeriods || []).forEach((item) => {
    let restStart = toMinutes(item.start);
    let restEnd = toMinutes(item.end);

    if (restEnd <= restStart) {
      restEnd += 24 * 60;
    }

    const overlapStart = Math.max(startMin, restStart);
    const overlapEnd = Math.min(endMin, restEnd);
    if (overlapEnd > overlapStart) {
      restHours += (overlapEnd - overlapStart) / 60;
    }
  });

  const totalHours = (endMin - startMin) / 60 - restHours;
  return Math.max(0, Number(totalHours.toFixed(2)));
}

function getMonthMeta(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  return { year, month, daysInMonth, firstDay };
}

function getPeriodKey(dateStr, startDay) {
  if (!startDay || startDay <= 1) return (dateStr || '').slice(0, 7);
  var d = new Date(dateStr.replace(/-/g, '/') + ' 00:00:00');
  if (isNaN(d.getTime())) return (dateStr || '').slice(0, 7);
  var day = d.getDate();
  if (day >= startDay) {
    var next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return formatDate(next).slice(0, 7);
  }
  return (dateStr || '').slice(0, 7);
}

module.exports = {
  formatDate,
  calcDuration,
  getPeriodKey,
  getMonthMeta
};
