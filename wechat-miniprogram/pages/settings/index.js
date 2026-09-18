const { loadSettings, saveSettings, isCloudSyncEnabled, setCloudSyncEnabled } = require('../../utils/storage');
const { clonePeriods } = require('../../utils/records');
const { DEFAULT_COLORS, COLOR_CHOICES } = require('../../utils/constants');

const COLOR_TYPES = [
  { type: 'weekday', label: '平日' },
  { type: 'weekend', label: '周末' },
  { type: 'holiday', label: '节假日' },
  { type: 'leave', label: '请假' }
];

function updateSettingRestPeriods(periods, index, field, value) {
  const next = clonePeriods(periods);
  if (!next[index]) return next;
  next[index][field] = value;
  return next;
}

Page({
  data: {
    settingOtDefaultStart: '18:00',
    settingOtDefaultEnd: '20:00',
    settingLeaveDefaultStart: '08:00',
    settingLeaveDefaultEnd: '17:00',
    settingDurationFormat: 'hour',
    settingPeriodStartDay: 1,
    settingWeekStart: 'sunday',
    colorTypes: COLOR_TYPES,
    colorOptions: COLOR_CHOICES,
    settingColors: { ...DEFAULT_COLORS },
    colorPickerType: '',
    colorPickerLabel: '',
    settingRestPeriods: [],
    settingCloudSync: true,
    settingCheer: true,
    settingCalcAllTime: false
  },

  onLoad() {
    const settings = loadSettings();
    this.setData({
      settingOtDefaultStart: settings.otDefaultStart,
      settingOtDefaultEnd: settings.otDefaultEnd,
      settingLeaveDefaultStart: settings.leaveDefaultStart,
      settingLeaveDefaultEnd: settings.leaveDefaultEnd,
      settingDurationFormat: settings.durationFormat || 'hour',
      settingPeriodStartDay: settings.periodStartDay || 1,
      settingWeekStart: settings.weekStart || 'sunday',
      settingColors: { ...(settings.colors || DEFAULT_COLORS) },
      settingRestPeriods: clonePeriods(settings.restPeriods),
      settingCloudSync: isCloudSyncEnabled(),
      settingCheer: settings.cheerEnabled !== false,
      settingCalcAllTime: settings.calcAllTime === true
    });
  },

  persist() {
    setCloudSyncEnabled(this.data.settingCloudSync);
    saveSettings({
      otDefaultStart: this.data.settingOtDefaultStart,
      otDefaultEnd: this.data.settingOtDefaultEnd,
      leaveDefaultStart: this.data.settingLeaveDefaultStart,
      leaveDefaultEnd: this.data.settingLeaveDefaultEnd,
      durationFormat: this.data.settingDurationFormat || 'hour',
      periodStartDay: Number(this.data.settingPeriodStartDay) || 1,
      weekStart: this.data.settingWeekStart,
      colors: { ...this.data.settingColors },
      cheerEnabled: this.data.settingCheer,
      calcAllTime: this.data.settingCalcAllTime,
      // 保留计算页选择的加班费规则，避免写设置时被重置
      payRule: loadSettings().payRule,
      restPeriods: clonePeriods(this.data.settingRestPeriods)
    });
  },

  onUnload() {
    this.persist();
  },

  onSettingsTimeChange(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    this.persist();
  },

  onSettingsRestFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const settingRestPeriods = updateSettingRestPeriods(this.data.settingRestPeriods, index, field, e.detail.value);
    this.setData({ settingRestPeriods });
    if (field !== 'label') this.persist();
  },

  addSettingsRest() {
    const settingRestPeriods = clonePeriods(this.data.settingRestPeriods);
    settingRestPeriods.push({ id: Date.now().toString(), label: '休息', start: '12:00', end: '13:00' });
    this.setData({ settingRestPeriods });
    this.persist();
  },

  removeSettingsRest(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ settingRestPeriods: this.data.settingRestPeriods.filter((_, i) => i !== index) });
    this.persist();
  },

  onDurationFormatChange(e) {
    this.setData({ settingDurationFormat: e.currentTarget.dataset.mode });
    this.persist();
  },

  onWeekStartChange(e) {
    this.setData({ settingWeekStart: e.currentTarget.dataset.value });
    this.persist();
  },

  onPeriodStartDayInput(e) {
    // 允许临时清空以便用户输入，blur/离开页面时规整
    this.setData({ settingPeriodStartDay: e.detail.value });
  },

  onPeriodStartDayBlur() {
    this.setData({ settingPeriodStartDay: Number(this.data.settingPeriodStartDay) || 1 });
    this.persist();
  },

  onCloudSyncChange(e) {
    this.setData({ settingCloudSync: e.detail.value });
    this.persist();
  },

  onCheerChange(e) {
    this.setData({ settingCheer: e.detail.value });
    this.persist();
  },

  onCalcAllTimeChange(e) {
    this.setData({ settingCalcAllTime: e.detail.value });
    this.persist();
  },

  openColorPicker(e) {
    const type = e.currentTarget.dataset.type;
    const row = COLOR_TYPES.find((t) => t.type === type);
    this.setData({ colorPickerType: type, colorPickerLabel: row ? row.label : '' });
  },

  selectColor(e) {
    const type = this.data.colorPickerType;
    if (!type) return;
    this.setData({ [`settingColors.${type}`]: e.currentTarget.dataset.value, colorPickerType: '' });
    this.persist();
  },

  closeColorPicker() {
    this.setData({ colorPickerType: '' });
  },

  noop() {}
});
