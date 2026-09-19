const assert = require('assert');
const { lunarFor } = require('../utils/lunar');

// 锚点：2025 春节 = 正月初一
let l = lunarFor('2025-01-29');
assert.strictEqual(l.lMonth, 1);
assert.strictEqual(l.lDay, 1);
assert.strictEqual(l.dayCn, '初一');
// 锚点：2026 中秋 = 八月十五
l = lunarFor('2026-09-25');
assert.strictEqual(l.monthCn, '八月');
assert.strictEqual(l.dayCn, '十五');
// 锚点：2025 闰六月初一
l = lunarFor('2025-07-25');
assert.ok(l.isLeap);
assert.strictEqual(l.lMonth, 6);
// 非法输入
assert.strictEqual(lunarFor(''), null);

console.log('lunar tests passed');
