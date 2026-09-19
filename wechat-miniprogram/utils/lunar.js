// 真农历换算，数据表来自 solarlunar@2.0.6（1900-2100），仅包装本项目需要的部分
const sl = require('./solarlunar.min');

// dateStr: 'YYYY-MM-DD' → { lMonth, lDay, isLeap, monthCn, dayCn }，异常返回 null
function lunarFor(dateStr) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  if (!y || !m || !d) return null;
  const l = sl.solar2lunar(y, m, d);
  return l && l.lDay ? l : null;
}

module.exports = { lunarFor };
