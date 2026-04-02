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

const DEFAULT_SETTINGS = {
  otDefaultStart: '18:00',
  otDefaultEnd: '20:00',
  leaveDefaultStart: '08:00',
  leaveDefaultEnd: '17:00',
  restPeriods: [
    { id: '1', start: '12:00', end: '13:00', label: '午休' },
    { id: '2', start: '17:00', end: '18:00', label: '晚饭' }
  ]
};

module.exports = {
  STORAGE_KEYS,
  RecordCategory,
  OvertimeType,
  LeaveType,
  DEFAULT_SETTINGS
};