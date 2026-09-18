// 更新法定节假日数据：node scripts/update-holidays.js [year ...]
// 不带参数时默认刷新「今年 + 明年」（明年公告一般在 11~12 月发布，发布后跑一次即可）
// 数据源: https://github.com/NateScarlet/holiday-cn
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'utils', 'holidays-data.js');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'holiday-updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) return get(res.headers.location).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

(async () => {
  const now = new Date().getFullYear();
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  if (!years.length) years.push(now, now + 1);

  const data = fs.existsSync(OUT) ? require(OUT) : {};
  for (const year of years) {
    try {
      const json = JSON.parse(await get(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`));
      data[String(year)] = json.days.map((d) => ({ date: d.date, name: d.name, off: d.isOffDay }));
      console.log(`${year}: ${data[String(year)].length} 条`);
    } catch (e) {
      console.warn(`${year}: 跳过（${e.message}）`);
    }
  }

  const banner = '// 法定节假日数据，来源 holiday-cn（https://github.com/NateScarlet/holiday-cn）\n'
    + '// 更新方式: node scripts/update-holidays.js（每年 11~12 月次年公告后跑一次）\n';
  fs.writeFileSync(OUT, banner + `module.exports = ${JSON.stringify(data)};\n`);
  console.log(`已写入 ${OUT}（年份: ${Object.keys(data).join(', ')}）`);
})();
