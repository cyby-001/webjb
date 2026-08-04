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

const DEFAULT_SETTINGS = {
  otDefaultStart: '18:00',
  otDefaultEnd: '20:00',
  leaveDefaultStart: '08:00',
  leaveDefaultEnd: '17:00',
  durationFormat: 'hour',
  periodStartDay: 1,
  weekStart: 'sunday',
  colors: DEFAULT_COLORS,
  restPeriods: [
    { id: '1', start: '12:00', end: '13:00', label: '午休' },
    { id: '2', start: '17:00', end: '18:00', label: '晚饭' }
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
  COLOR_CHOICES
};