const STORAGE_KEYS = {
  RECORDS: 'ot_records',
  RATE: 'ot_rate',
  SETTINGS: 'ot_settings'
};

const RecordCategory = {
  OVERTIME: '加班',
  LEAVE: '请假'
};

const OvertimeType = {
  WEEKDAY: '平日加班',
  WEEKEND: '周末加班',
  HOLIDAY: '节假日加班'
};

const LeaveType = {
  COMPENSATORY: '调休',
  PERSONAL: '事假',
  SICK: '病假',
  ANNUAL: '年假',
  OTHER: '其他'
};

// 各记录类型默认颜色（平日/周末/节假日/请假）
const DEFAULT_COLORS = {
  weekday: '#4f7af5',
  weekend: '#ff8b35',
  holiday: '#ef4444',
  leave: '#b38cff'
};

// 加班费计算规则：法定标准预设 + 自定义（mode='custom'，倍数可编辑）+ 阶梯（mode='tier'）
const PAY_RULES = [
  { id: 'standard', name: '法定标准', weekday: 1.5, weekend: 2, holiday: 3, deductLeave: true }
];

const DEFAULT_PAY_RULE = { mode: 'standard', weekday: 1.5, weekend: 2, holiday: 3, deductLeave: true };

const DEFAULT_SETTINGS = {
  otDefaultStart: '18:00',
  otDefaultEnd: '20:00',
  leaveDefaultStart: '08:00',
  leaveDefaultEnd: '17:00',
  durationFormat: 'hour',
  periodStartDay: 1,
  weekStart: 'sunday',
  colors: DEFAULT_COLORS,
  cheerEnabled: true,
  calcAllTime: false,
  payBarEnabled: true,
  payRule: DEFAULT_PAY_RULE,
  restPeriods: [
    { id: '1', start: '12:00', end: '13:00', label: '午休' }
  ]
};

// 记录类型可选的颜色色板
const COLOR_CHOICES = [
  '#4f7af5', '#6366f1', '#8b5cf6', '#a855f7',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#f97316', '#f59e0b', '#eab308', '#ef4444',
  '#f43f5e', '#ec4899', '#64748b'
];

module.exports = {
  STORAGE_KEYS,
  RecordCategory,
  OvertimeType,
  LeaveType,
  DEFAULT_SETTINGS,
  DEFAULT_COLORS,
  COLOR_CHOICES,
  PAY_RULES,
  DEFAULT_PAY_RULE
};
