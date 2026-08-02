const { loadSettings, saveSettings, isCloudSyncEnabled, setCloudSyncEnabled } = require('../../utils/storage');
const { clonePeriods } = require('../../utils/records');

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

  onPeriodStartDayInput(e) {
    // 允许临时清空以便用户输入，保存时再规整
    this.setData({ settingPeriodStartDay: e.detail.value });
  },

  onCloudSyncChange(e) {
    this.setData({ settingCloudSync: e.detail.value });
  },

  saveSettings() {
    const settings = {
      otDefaultStart: this.data.settingOtDefaultStart,
      otDefaultEnd: this.data.settingOtDefaultEnd,
      leaveDefaultStart: this.data.settingLeaveDefaultStart,
      leaveDefaultEnd: this.data.settingLeaveDefaultEnd,
      durationFormat: this.data.settingDurationFormat || 'hour',
      periodStartDay: Number(this.data.settingPeriodStartDay) || 1,
      restPeriods: clonePeriods(this.data.settingRestPeriods)
    };
    setCloudSyncEnabled(this.data.settingCloudSync);
    saveSettings(settings);
    wx.showToast({ title: '设置已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  }
});
