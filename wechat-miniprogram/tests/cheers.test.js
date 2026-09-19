const assert = require('assert');
const { pickCheer } = require('../utils/cheers');

// 各场景都能抽出文案且不报错（深夜 / 周末 / 节假日 / 普通 / 超长）
assert.ok(pickCheer({ startTime: '20:00', endTime: '23:30', duration: 3.5 }));
assert.ok(pickCheer({ startTime: '02:00', endTime: '05:00', duration: 3 }, { isWeekend: true }));
assert.ok(pickCheer({ startTime: '18:00', endTime: '20:00', duration: 2 }, { isWeekend: false }));
assert.ok(pickCheer({ startTime: '10:00', endTime: '16:00', duration: 6 }, { isWeekend: true }));
assert.ok(pickCheer({ startTime: '09:00', endTime: '14:00', duration: 5 }, { isHoliday: true }));

// 去重：传入 lastText 后不再抽到同一句
const record = { startTime: '18:00', endTime: '20:00', duration: 2 };
const lastText = '今天的班，没有白加'; // normal 池中的一句
for (let i = 0; i < 40; i += 1) {
  const c = pickCheer(record, { lastText });
  assert.notStrictEqual(c.text, lastText);
}

// 返回结构
const c = pickCheer(record, {});
assert.ok(c.emoji && typeof c.text === 'string');

console.log('cheers tests passed');
