const assert = require('assert');
const { calcDuration, endForDuration, buildStatsMonthOptions } = require('../utils/time');

const rests = [
  { start: '12:00', end: '13:00', label: '午休' },
  { start: '17:00', end: '18:00', label: '晚饭' }
];

// 无休息
assert.strictEqual(endForDuration('18:00', 2, []), '20:00');
// 跨天
assert.strictEqual(endForDuration('23:00', 2, []), '01:00');
// 跨越午休：12:00 干 1h → 结束 14:00
assert.strictEqual(endForDuration('12:00', 1, rests), '14:00');
assert.strictEqual(calcDuration('12:00', '14:00', rests), 1);

// 反推与正算一致（含休息时段）
for (const [start, dur] of [['18:00', 2.5], ['08:00', 3], ['12:00', 2], ['23:30', 1.5]]) {
  const end = endForDuration(start, dur, rests);
  const back = calcDuration(start, end, rests);
  assert.ok(Math.abs(back - dur) < 0.01, `${start}+${dur}h -> ${end} -> ${back}`);
}

// buildStatsMonthOptions：最早记录月 ~ 当前月
const pad2 = (n) => String(n).padStart(2, '0');
const now = new Date();
const curKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
const opts = buildStatsMonthOptions([{ date: '2026-03-15' }, { date: '2026-01-05' }, { date: '2026-05-01' }]);
assert.strictEqual(opts[0].cursor, '2026-01', '起点为最早记录月');
assert.strictEqual(opts[opts.length - 1].cursor, curKey, '终点为当前月');
assert.ok(opts.every((o, i) => i === 0 || o.cursor > opts[i - 1].cursor), '按月递增');
// 无记录 → 仅当前月
assert.deepStrictEqual(buildStatsMonthOptions([]), [{ label: `${now.getFullYear()}年${now.getMonth() + 1}月`, cursor: curKey }]);
// 跨年月
const span = buildStatsMonthOptions([{ date: '2024-11-01' }]);
assert.strictEqual(span[0].cursor, '2024-11');
assert.strictEqual(span[span.length - 1].cursor, curKey);
assert.strictEqual(span[2].cursor, '2025-01', '12月后翻年到1月');

console.log('time tests passed');
