// 法定节假日数据来自 holiday-cn（https://github.com/NateScarlet/holiday-cn），按年存放于 holidays-data.js
// 每年 11~12 月国务院公告次年安排后更新一次数据文件
const HOLIDAYS = require('./holidays-data');

function entryFor(dateStr) {
  const list = HOLIDAYS[dateStr.slice(0, 4)] || [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].date === dateStr) return list[i];
  }
  return null;
}

// 是否休息日：命中官方数据（含调休补班）以官方为准，未收录的年份按普通周末判断
function isRestDay(dateStr) {
  const entry = entryFor(dateStr);
  if (entry) return entry.off;
  const day = new Date((dateStr || '').replace(/-/g, '/') + ' 00:00:00').getDay();
  return day === 0 || day === 6;
}

module.exports = { entryFor, isRestDay };
