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

function minutesToTime(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// start-end 区间内与休息时段的重叠时长（小时）
function restHoursBetween(start, end, restPeriods) {
  let startMin = toMinutes(start);
  let endMin = toMinutes(end);
  if (endMin <= startMin) endMin += 24 * 60;
  let restHours = 0;
  (restPeriods || []).forEach((item) => {
    let restStart = toMinutes(item.start);
    let restEnd = toMinutes(item.end);
    if (restEnd <= restStart) restEnd += 24 * 60;
    const overlapStart = Math.max(startMin, restStart);
    const overlapEnd = Math.min(endMin, restEnd);
    if (overlapEnd > overlapStart) {
      restHours += (overlapEnd - overlapStart) / 60;
    }
  });
  return restHours;
}

function calcDuration(start, end, restPeriods) {
  let startMin = toMinutes(start);
  let endMin = toMinutes(end);
  if (endMin <= startMin) endMin += 24 * 60;
  const totalHours = (endMin - startMin) / 60 - restHoursBetween(start, end, restPeriods);
  return Math.max(0, Number(totalHours.toFixed(2)));
}

// 由开始时间和时长反推结束时间，使 calcDuration 与该时长一致（迭代补偿休息时段）
function endForDuration(start, durationHours, restPeriods) {
  const targetMin = Math.round(Number(durationHours) * 60);
  if (!Number.isFinite(targetMin)) return start;
  let endMin = toMinutes(start) + targetMin;
  for (let i = 0; i < 5; i += 1) {
    const rest = Math.round(restHoursBetween(start, minutesToTime(endMin), restPeriods) * 60);
    const next = toMinutes(start) + targetMin + rest;
    if (Math.abs(next - endMin) < 1) break;
    endMin = next;
  }
  return minutesToTime(endMin);
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

// 月份选择器选项：最早记录月 ~ 当前月，格式 { label, cursor: 'YYYY-MM' }（todayStr 仅测试注入用）
function buildStatsMonthOptions(records, todayStr) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = todayStr ? new Date(`${todayStr.replace(/-/g, '/')} 00:00:00`) : new Date();
  const maxKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  let minKey = maxKey;
  (records || []).forEach((r) => {
    const key = (r.date || '').slice(0, 7);
    if (key && key < minKey) minKey = key;
  });
  const options = [];
  let y = Number(minKey.slice(0, 4));
  let m = Number(minKey.slice(5, 7));
  while (`${y}-${pad(m)}` <= maxKey) {
    options.push({ label: `${y}年${m}月`, cursor: `${y}-${pad(m)}` });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return options;
}

module.exports = {
  formatDate,
  calcDuration,
  getPeriodKey,
  getMonthMeta,
  endForDuration,
  buildStatsMonthOptions
};
