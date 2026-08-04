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
    settingCloudSync: true
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
      settingCloudSync: isCloudSyncEnabled()
    });
  },

  onSettingsTimeChange(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onSettingsRestFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const settingRestPeriods = updateSettingRestPeriods(this.data.settingRestPeriods, index, field, e.detail.value);
    this.setData({ settingRestPeriods });
  },

  addSettingsRest() {
    const settingRestPeriods = clonePeriods(this.data.settingRestPeriods);
    settingRestPeriods.push({ id: Date.now().toString(), label: '休息', start: '12:00', end: '13:00' });
    this.setData({ settingRestPeriods });
  },

  removeSettingsRest(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ settingRestPeriods: this.data.settingRestPeriods.filter((_, i) => i !== index) });
  },

  onDurationFormatChange(e) {
    this.setData({ settingDurationFormat: e.currentTarget.dataset.mode });
  },

  onWeekStartChange(e) {
    this.setData({ settingWeekStart: e.currentTarget.dataset.value });
  },

  onPeriodStartDayInput(e) {
    // 允许临时清空以便用户输入，保存时再规整
    this.setData({ settingPeriodStartDay: e.detail.value });
  },

  onCloudSyncChange(e) {
    this.setData({ settingCloudSync: e.detail.value });
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
  },

  closeColorPicker() {
    this.setData({ colorPickerType: '' });
  },

  saveSettings() {
    const settings = {
      otDefaultStart: this.data.settingOtDefaultStart,
      otDefaultEnd: this.data.settingOtDefaultEnd,
      leaveDefaultStart: this.data.settingLeaveDefaultStart,
      leaveDefaultEnd: this.data.settingLeaveDefaultEnd,
      durationFormat: this.data.settingDurationFormat || 'hour',
      periodStartDay: Number(this.data.settingPeriodStartDay) || 1,
      weekStart: this.data.settingWeekStart,
      colors: { ...this.data.settingColors },
      restPeriods: clonePeriods(this.data.settingRestPeriods)
    };
    setCloudSyncEnabled(this.data.settingCloudSync);
    saveSettings(settings);
    wx.showToast({ title: '设置已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  noop() {}
});
