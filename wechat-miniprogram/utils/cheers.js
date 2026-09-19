// 保存加班记录后的随机鼓励语
const CHEERS = {
  late: [
    { emoji: '🌙', text: '这么晚还在拼，全公司最亮的星都没你亮' },
    { emoji: '🦉', text: '夜色是你的工位，星星是你的同事' },
    { emoji: '🛌', text: '快回去休息吧，床已经想你想得不行了' },
    { emoji: '✨', text: '深夜的努力已存档，请注意查收' },
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
    { emoji: '💼', text: '周末出勤成功，进度条悄悄拉满' },
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
    { emoji: '⚡', text: '忙起来的时候觉得自己无所不能，累起来的时候只想瘫一会儿' },
    { emoji: '🏅', text: '今天的你，只差一个"优秀员工"奖状了' },
    { emoji: '🪑', text: '同事陆续都走了，只剩你还在坚守岗位' },
    { emoji: '🧩', text: '这活干到现在，你已经比谁都清楚该怎么收尾了' },
    { emoji: '📋', text: '计划好的休息没赶上，倒是把加班安排上了' },
    { emoji: '⏳', text: '时间过得比你想的快，一抬头又是加班的一天' },
    { emoji: '🧋', text: '忙了这么久，喝点好的，休息才是正经事' },
    { emoji: '🎭', text: '你现在的状态，堪称"人在岗位，心已经下班"' },
    { emoji: '🙃', text: '别人劝你"早点休息"，你说"再等一下，快好了"' },
    { emoji: '✅', text: '今天的任务完成了，感觉又能多撑一天' },
    { emoji: '🥋', text: '你已经练就了"边困边坚持"的绝技' }
  ],
  normal: [
    { emoji: '📝', text: '记录已保存，努力都被看见了' },
    { emoji: '🌱', text: '每一分付出，都在悄悄升值' },
    { emoji: '🎯', text: '今天的班，没有白加' },
    { emoji: '☕', text: '辛苦了，记得喝口水再冲' },
    { emoji: '🚶', text: '干得漂亮，早点回家休息' },
    { emoji: '📊', text: '打卡成功！坚持记录的都是狠人' },
    { emoji: '🍀', text: '又是充实的一天，记录+1' },
    { emoji: '🌇', text: '天色渐晚，收工快乐' },
    { emoji: '🫖', text: '劳逸结合，别忘了站起来活动一下' },
    { emoji: '🎈', text: '今日份努力已签收' },
    { emoji: '🧸', text: '辛苦啦，回家好好放松' },
    { emoji: '🛤️', text: '稳步前进，积少成多' },
    { emoji: '🍲', text: '今晚值得吃顿好的' },
    { emoji: '🎧', text: '回家的路上，把今天交给音乐' }
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
