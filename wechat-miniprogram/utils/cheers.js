// 保存加班记录后的随机鼓励语
const CHEERS = {
  late: [
    { emoji: '🌙', text: '这么晚还在拼，明天你领导画饼都有素材了' },
    { emoji: '🦉', text: '夜色是你的工位，星星是你的同事' },
    { emoji: '🛌', text: '快回去休息吧，床已经想你想得不行了' },
    { emoji: '✨', text: '深夜加班费（ hopes ）已到账，请注意查收' },
    { emoji: '🌃', text: '这个城市的灯火有你一份，辛苦了' },
    { emoji: '☕', text: '深夜的咖啡因，都是明天的斗志' },
    { emoji: '💪', text: '别人在梦里，你在事业里' },
    { emoji: '😴', text: '记录已保存，人赶紧保存到床上' },
    { emoji: '🌌', text: '城市都睡了，只有你和文档还醒着' },
    { emoji: '🚕', text: '末班车都快等你等急了，快收个尾吧' },
    { emoji: '🌕', text: '月亮都下班了，你还在岗，是真敬业' },
    { emoji: '🏙️', text: '凌晨的写字楼里，你就是最后一盏灯' },
    { emoji: '🛗', text: '连电梯都开始打哈欠了，赶紧回去吧' },
    { emoji: '📅', text: '日历都翻到明天了，记得早点回去休息' }
  ],
  weekend: [
    { emoji: '📅', text: '周末都在奋斗，这份工谁看了不点赞' },
    { emoji: '🏆', text: '周末加班选手，年度敬业奖预定' },
    { emoji: '🏖️', text: '别人的周末是海滩，你的周末是案海' },
    { emoji: '🔥', text: '周末还在燃烧，事业心拉满了' },
    { emoji: '🦸', text: '休班日出勤，你就是办公室的超级英雄' },
    { emoji: '🍜', text: '干完这顿记得吃顿好的犒劳自己' },
    { emoji: '💼', text: '周末工时+1，钱包厚度+1' },
    { emoji: '🌟', text: '在别人休息时前进，你已经赢在周一了' },
    { emoji: '🎡', text: '别人的周末在游乐园，你的周末在工位园' },
    { emoji: '📆', text: '周末打卡成功，这份自律值得裱起来' },
    { emoji: '🛋️', text: '家里的沙发已经等你很久了，干完就回' },
    { emoji: '🎬', text: '别人在追剧，你在追项目进度' },
    { emoji: '🧺', text: '周末还这么拼，记得给生活也留点空' },
    { emoji: '⛰️', text: '周末爬的不是山，是事业的下一个小高峰' }
  ],
  long: [
    { emoji: '🛠️', text: '这时长，建议直接颁一枚勋章' },
    { emoji: '🚀', text: '这么长的班，你是把一天过成两天了吧' },
    { emoji: '🔋', text: '电量预警！记得补充能量再战' },
    { emoji: '🧱', text: '搬砖界的天花板，说的就是你' },
    { emoji: '📈', text: '工时曲线蹭蹭涨，年终汇报有得写了' },
    { emoji: '🫡', text: '铁人！这个时长我先敬为上' },
    { emoji: '⏰', text: '时间管理大师，就是你本人了' },
    { emoji: '🥇', text: '今日工时冠军诞生！' },
    { emoji: '✨', text: '打工人打工魂，打工人是人上人，今天也是发光发热的一天' },
    { emoji: '🌆', text: '别人已经下班回家，你还在为今天的任务加班加点' },
    { emoji: '🗓️', text: '别人周末在休息，你还在为工作忙碌，一样值得被夸一句"自律"' },
    { emoji: '⚡', text: '忙起来的时候觉得自己无所不能，累起来的时候只想瘫一会儿' },
    { emoji: '🔔', text: '别人的"注意休息"提醒，成了你加班时的日常背景音' },
    { emoji: '🧘', text: '所谓成长，就是加班次数越来越多，脾气还能保持基本稳定（努力中）' },
    { emoji: '🏅', text: '今天的你，只差一个"优秀员工"奖状了' },
    { emoji: '🪑', text: '同事陆续都走了，只剩你还在坚守岗位' },
    { emoji: '📱', text: '你的手机相册里，工作消息截图比风景照还多' },
    { emoji: '🤝', text: '加班到现在，感觉自己和这份工作已经有了革命友谊' },
    { emoji: '🏋️', text: '别人晒健身打卡，你晒加班打卡，一样是在坚持' },
    { emoji: '🐟', text: '今天打算摸鱼的时间，全用来假装很忙了' },
    { emoji: '🚪', text: '你和老板之间的差距，可能就是一个"准时下班的自由"' },
    { emoji: '🧩', text: '这活干到现在，你已经比谁都清楚该怎么收尾了' },
    { emoji: '📋', text: '计划好的休息没赶上，倒是把加班安排上了' },
    { emoji: '⏳', text: '时间过得比你想的快，一抬头又是加班的一天' },
    { emoji: '🧋', text: '今天的加班费，约等于一杯奶茶钱，也算是个安慰' },
    { emoji: '🎭', text: '你现在的状态，堪称"人在岗位，心已经下班"' },
    { emoji: '🙃', text: '别人劝你"早点休息"，你说"再等一下，快好了"' },
    { emoji: '🌊', text: '加班加到怀疑人生，但至少证明了你抗压能力真不差' },
    { emoji: '💡', text: '灯还亮着，你的钱包大概还是那么瘪，但精神可嘉' },
    { emoji: '✅', text: '今天的任务完成了，感觉又能多撑一天' },
    { emoji: '🥋', text: '你已经练就了"边困边坚持"的绝技' },
    { emoji: '🫓', text: '老板画的饼，你已经悄悄吃了不少了' },
    { emoji: '🕯️', text: '这波加班，纯纯的是在"燃烧自己，照亮工作"' }
  ],
  normal: [
    { emoji: '💪', text: '又肝了一天，钱包正在变厚的路上' },
    { emoji: '📝', text: '记录已保存，努力都被看见了' },
    { emoji: '🌱', text: '每一分付出，都在悄悄升值' },
    { emoji: '💰', text: '工时+1，距离小目标又近了一步' },
    { emoji: '🎯', text: '今天的班，没有白加' },
    { emoji: '☕', text: '辛苦了，记得喝口水再冲' },
    { emoji: '🚶', text: '干得漂亮，早点回家休息' },
    { emoji: '📊', text: '打卡成功！坚持记录的都是狠人' },
    { emoji: '🍀', text: '又是充实的一天，记录+1' },
    { emoji: '🌇', text: '天色渐晚，收工快乐' },
    { emoji: '🫖', text: '劳逸结合，别忘了站起来活动一下' },
    { emoji: '🎈', text: '今日份努力已签收' },
    { emoji: '🧸', text: '辛苦啦，回家好好放松' },
    { emoji: '🛤️', text: '稳步前进，积少成多' }
  ]
};

function toMinutes(timeText) {
  const parts = (timeText || '').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function pickFrom(pool, lastText) {
  // 避免连续两次抽到同一句
  let candidates = pool;
  if (lastText && pool.length > 1) {
    candidates = pool.filter((item) => item.text !== lastText);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// record: { startTime, endTime, duration }；opts: { isWeekend, isHoliday, lastText }
function pickCheer(record, opts) {
  const options = opts || {};
  const endTime = toMinutes(record && record.endTime);
  const startTime = toMinutes(record && record.startTime);
  let pool;
  if (endTime >= 23 * 60 || (endTime > 0 && endTime < 6 * 60) || startTime < 6 * 60) {
    pool = CHEERS.late;
  } else if (options.isHoliday || options.isWeekend) {
    pool = CHEERS.weekend;
  } else if (Number(record && record.duration) >= 4) {
    pool = CHEERS.long;
  } else {
    pool = CHEERS.normal;
  }
  return pickFrom(pool, options.lastText);
}

module.exports = { pickCheer };
