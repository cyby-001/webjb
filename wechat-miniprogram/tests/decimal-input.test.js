const assert = require('assert');
const { sanitizeOneDecimalInput, parseOneDecimal } = require('../utils/decimal');

assert.strictEqual(sanitizeOneDecimalInput('1.'), '1.');
assert.strictEqual(sanitizeOneDecimalInput('1.25'), '1.2');
assert.strictEqual(sanitizeOneDecimalInput('.5'), '0.5');
assert.strictEqual(sanitizeOneDecimalInput('03.49'), '3.4');
assert.strictEqual(sanitizeOneDecimalInput('abc12.3x4'), '12.3');

assert.strictEqual(parseOneDecimal('1.'), 1);
assert.strictEqual(parseOneDecimal('1.25'), 1.2);
assert.strictEqual(parseOneDecimal(''), 0);

console.log('decimal input tests passed');
