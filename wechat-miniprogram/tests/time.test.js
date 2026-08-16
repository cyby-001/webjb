const assert = require('assert');
const { calcDuration, endForDuration } = require('../utils/time');

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

console.log('time tests passed');
