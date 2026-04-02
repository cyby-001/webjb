const { RecordCategory, OvertimeType } = require('../../utils/constants');
const { syncUserData, loadRecords, loadHourlyRate, saveHourlyRate, saveRecords, loadSettings, saveSettings } = require('../../utils/storage');
const { payrollEstimate } = require('../../utils/records');
const { formatDate, monthKey } = require('../../utils/time');
const { writeTempFile, handleGeneratedFile, exportRecordsToCSV, chooseAndReadJSON } = require('../../utils/files');

const SELECTED_MONTH_CURSOR_KEY = 'ot_selected_month_cursor';

const RANGE_OPTIONS = [
  { key: '3m', label: '近3个月' },
  { key: '6m', label: '近6个月' },
  { key: '12m', label: '近12个月' },
  { key: 'year', label: '今年' }
];

function monthCursorFromDate(date) {
  return monthKey(date);
}

function dateFromMonthCursor(cursor) {
  const match = String(cursor || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildMonthSummaryForCursor(records, cursor) {
  const monthRecords = records.filter((item) => String(item.date || '').startsWith(cursor));
  const otRecords = monthRecords.filter((item) => item.category !== RecordCategory.LEAVE);
  const leaveRecords = monthRecords.filter((item) => item.category === RecordCategory.LEAVE);
  return {
    otHours: Number(otRecords.reduce((sum, item) => sum + Number(item.duration || 0), 0).toFixed(1)),
    leaveHours: Number(leaveRecords.reduce((sum, item) => sum + Number(item.duration || 0), 0).toFixed(1)),
    otCount: otRecords.length,
    leaveCount: leaveRecords.length
  };
}

function buildYearSummaryForDate(records, date) {
  const year = String(date.getFullYear());
  const yearRecords = records.filter((item) => String(item.date || '').startsWith(year));
  const otRecords = yearRecords.filter((item) => item.category !== RecordCategory.LEAVE);
  return {
    yearOtHours: Number(otRecords.reduce((sum, item) => sum + Number(item.duration || 0), 0).toFixed(1)),
    yearOtDays: new Set(otRecords.map((item) => item.date)).size
  };
}

function buildTrendForDate(records, rangeKey, anchorDate) {
  const months = rangeKey === '3m' ? 3 : rangeKey === '12m' ? 12 : rangeKey === 'year' ? anchorDate.getMonth() + 1 : 6;
  const data = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
    const key = monthCursorFromDate(date);
    const monthRecords = records.filter((item) => String(item.date || '').startsWith(key));
    let otHours = 0;
    let leaveHours = 0;
    monthRecords.forEach((item) => {
      if (item.category === RecordCategory.LEAVE) leaveHours += Number(item.duration || 0);
      else otHours += Number(item.duration || 0);
    });
    data.push({
      month: key,
      label: `${String(date.getMonth() + 1).padStart(2, '0')}月`,
      otHours: Number(otHours.toFixed(1)),
      leaveHours: Number(leaveHours.toFixed(1))
    });
  }
  return data;
}

function clonePeriod(item) {
  return {
    id: item.id,
    label: item.label,
    start: item.start,
    end: item.end
  };
}

function clonePeriods(periods) {
  if (!Array.isArray(periods)) return [];
  return periods.map(clonePeriod);
}

function normalizeSettingsState(settings) {
  return {
    settingOtDefaultStart: settings.otDefaultStart,
    settingOtDefaultEnd: settings.otDefaultEnd,
    settingLeaveDefaultStart: settings.leaveDefaultStart,
    settingLeaveDefaultEnd: settings.leaveDefaultEnd,
    settingRestPeriods: clonePeriods(settings.restPeriods)
  };
}

function buildDonut(records, monthKey) {
  const monthRecords = records.filter((item) => String(item.date || '').startsWith(monthKey));
  let weekday = 0;
  let weekend = 0;
  let holiday = 0;

  monthRecords.forEach((item) => {
    if (item.category === RecordCategory.LEAVE) return;
    const hours = Number(item.duration || 0);
    if (item.type === OvertimeType.HOLIDAY) holiday += hours;
    else if (item.type === OvertimeType.WEEKEND) weekend += hours;
    else weekday += hours;
  });

  const total = weekday + weekend + holiday;
  const weekdayPct = total > 0 ? (weekday / total) * 100 : 58;
  const weekendPct = total > 0 ? (weekend / total) * 100 : 27;
  const holidayPct = total > 0 ? 100 - weekdayPct - weekendPct : 15;
  const weekdayEnd = weekdayPct.toFixed(2);
  const weekendEnd = (weekdayPct + weekendPct).toFixed(2);
  const holidayEnd = (weekdayPct + weekendPct + holidayPct).toFixed(2);

  return {
    weekday: Number(weekday.toFixed(1)),
    weekend: Number(weekend.toFixed(1)),
    holiday: Number(holiday.toFixed(1)),
    style: total > 0
      ? `background: conic-gradient(#4f7af5 0 ${weekdayEnd}%, #ff7a1a ${weekdayEnd}% ${weekendEnd}%, #ef4444 ${weekendEnd}% ${holidayEnd}%);`
      : 'background: conic-gradient(#dbe3ef 0 100%);'
  };
}

function buildTrendData(records, rangeKey, anchorDate) {
  return buildTrendForDate(records, rangeKey, anchorDate);
}

function buildTrendBars(trend) {
  let maxVal = 1;
  trend.forEach((item) => {
    const value = Math.max(Number(item.otHours || 0), Number(item.leaveHours || 0));
    if (value > maxVal) maxVal = value;
  });

  return trend.map((item) => ({
    month: item.month,
    label: item.label,
    otHours: item.otHours,
    leaveHours: item.leaveHours,
    shortLabel: item.label.replace('月', ''),
    otHeight: Math.max(6, Math.round((Number(item.otHours || 0) / maxVal) * 138)),
    leaveHeight: Math.max(6, Math.round((Number(item.leaveHours || 0) / maxVal) * 138))
  }));
}

function getRangeStartDate(rangeKey, anchorDate) {
  if (rangeKey === '3m') return new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 2, 1);
  if (rangeKey === '12m') return new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 11, 1);
  if (rangeKey === 'year') return new Date(anchorDate.getFullYear(), 0, 1);
  return new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 5, 1);
}

function buildDetailRecords(records, rangeKey, filter, anchorDate) {
  const startDate = formatDate(getRangeStartDate(rangeKey, anchorDate));
  const endDate = formatDate(endOfMonth(anchorDate));
  return records
    .filter((item) => item.date >= startDate && item.date <= endDate)
    .filter((item) => {
      if (filter === 'ot') return item.category !== RecordCategory.LEAVE;
      if (filter === 'leave') return item.category === RecordCategory.LEAVE;
      return true;
    })
    .sort((a, b) => {
      if (a.date === b.date) return Number(b.id || 0) - Number(a.id || 0);
      return a.date < b.date ? 1 : -1;
    })
    .map((item) => ({
      id: item.id,
      date: item.date,
      category: item.category,
      type: item.type,
      duration: item.duration,
      note: item.note,
      shortDate: item.date.slice(5).replace('-', '/'),
      badgeText: item.category === RecordCategory.LEAVE
        ? '请假'
        : (item.type === OvertimeType.WEEKEND || item.type === OvertimeType.HOLIDAY ? '周末' : '平日'),
      badgeClass: item.category === RecordCategory.LEAVE
        ? 'leave'
        : (item.type === OvertimeType.WEEKEND || item.type === OvertimeType.HOLIDAY ? 'weekend' : 'weekday')
    }));
}

function updateSettingRestPeriods(periods, index, field, value) {
  const next = clonePeriods(periods);
  if (!next[index]) return next;
  next[index][field] = value;
  return next;
}

const EMPTY_CALC_RESULT = {
  weekday: 0,
  weekend: 0,
  holiday: 0,
  leave: 0,
  weighted: 0,
  amount: 0
};

function buildCalcResult(records, startDate, endDate, hourlyRate) {
  if (!startDate || !endDate || startDate > endDate) return { ...EMPTY_CALC_RESULT };
  return payrollEstimate(records, startDate, endDate, hourlyRate);
}

Page({
  data: {
    navTop: 0,
    navHeight: 44,
    heroHeight: 64,
    capsuleSpace: 96,
    menuTop: 72,
    showTopMenu: false,
    showSettingsSheet: false,
    monthLabel: '',
    currentYearLabel: '',
    selectedMonthCursor: monthCursorFromDate(new Date()),
    rangeOptions: RANGE_OPTIONS,
    activeRange: '6m',
    detailFilter: 'all',
    chartHint: '',
    records: [],
    settingOtDefaultStart: '18:00',
    settingOtDefaultEnd: '20:00',
    settingLeaveDefaultStart: '08:00',
    settingLeaveDefaultEnd: '17:00',
    settingRestPeriods: [],
    monthSummary: { otHours: 0, leaveHours: 0, otCount: 0, leaveCount: 0 },
    yearSummary: { yearOtHours: 0, yearOtDays: 0 },
    avgMonthlyOt: 0,
    donut: { weekday: 0, weekend: 0, holiday: 0, style: 'background: conic-gradient(#dbe3ef 0 100%);' },
    trendBars: [],
    trendMaxText: '',
    detailRecords: [],
    hourlyRate: 25,
    calcStart: '',
    calcEnd: '',
    calcResult: { ...EMPTY_CALC_RESULT }
  },

  onLoad(options) {
    if (options && /^\d{4}-\d{2}$/.test(options.month || '')) {
      this.pendingMonthCursor = options.month;
      wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, options.month);
    }
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
    this.initChrome();
  },

  onShow() {
    const applyViewState = () => {
      const fallbackCursor = monthCursorFromDate(new Date());
      const selectedMonthCursor = this.pendingMonthCursor || wx.getStorageSync(SELECTED_MONTH_CURSOR_KEY) || fallbackCursor;
      const targetDate = dateFromMonthCursor(selectedMonthCursor);
      const data = normalizeSettingsState(loadSettings());
      data.selectedMonthCursor = selectedMonthCursor;
      data.currentYearLabel = String(targetDate.getFullYear());
      data.monthLabel = `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月 · 概览`;
      data.calcStart = `${selectedMonthCursor}-01`;
      data.calcEnd = formatDate(endOfMonth(targetDate));
      this.setData(data, () => this.reloadData());
    };

    applyViewState();
    syncUserData().then(() => applyViewState());
  },

  initChrome() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = info.statusBarHeight || 20;
    const windowWidth = info.windowWidth || info.screenWidth || 375;
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navHeight = menuButton ? menuButton.height + (menuButton.top - statusBarHeight) * 2 : 44;
    const heroHeight = statusBarHeight + navHeight;
    const capsuleSpace = menuButton ? Math.max(88, Math.round(windowWidth - menuButton.left + 12)) : 96;
    const menuTop = statusBarHeight + navHeight + 16;
    this.setData({ navTop: statusBarHeight, navHeight, heroHeight, capsuleSpace, menuTop });
  },

  reloadData() {
    const records = loadRecords();
    const hourlyRate = loadHourlyRate();
    const targetDate = dateFromMonthCursor(this.data.selectedMonthCursor || monthCursorFromDate(new Date()));
    const selectedMonthCursor = monthCursorFromDate(targetDate);
    const monthSummary = buildMonthSummaryForCursor(records, selectedMonthCursor);
    const yearSummary = buildYearSummaryForDate(records, targetDate);
    const donut = buildDonut(records, selectedMonthCursor);
    const trend = buildTrendData(records, this.data.activeRange, targetDate);
    const trendBars = buildTrendBars(trend);
    const maxTrend = trend.reduce((best, item) => (!best || Number(item.otHours || 0) > Number(best.otHours || 0) ? item : best), null);
    const trendMaxText = maxTrend && maxTrend.otHours > 0 ? `${maxTrend.label} ${maxTrend.otHours}h` : '';
    const avgMonthlyOt = trend.length ? Number((trend.reduce((sum, item) => sum + Number(item.otHours || 0), 0) / trend.length).toFixed(1)) : 0;
    const detailRecords = buildDetailRecords(records, this.data.activeRange, this.data.detailFilter, targetDate);
    const chartHint = trendBars.length ? `${trendBars[trendBars.length - 1].shortLabel}月：加班 ${trendBars[trendBars.length - 1].otHours}h / 请假 ${trendBars[trendBars.length - 1].leaveHours}h` : '';
    const calcStart = this.data.calcStart || `${selectedMonthCursor}-01`;
    const calcEnd = this.data.calcEnd || formatDate(endOfMonth(targetDate));
    const calcResult = buildCalcResult(records, calcStart, calcEnd, hourlyRate);
    this.setData({ selectedMonthCursor, records, hourlyRate, monthSummary, yearSummary, avgMonthlyOt, donut, trendBars, trendMaxText, detailRecords, chartHint, calcStart, calcEnd, calcResult });
  },

  setRange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeRange) return;
    this.setData({ activeRange: key }, () => this.reloadData());
  },

  setDetailFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!filter || filter === this.data.detailFilter) return;
    this.setData({ detailFilter: filter }, () => this.reloadData());
  },


  onRateInput(e) {
    const value = Number(e.detail.value);
    const hourlyRate = Number.isFinite(value) ? value : 0;
    this.setData({
      hourlyRate,
      calcResult: buildCalcResult(this.data.records, this.data.calcStart, this.data.calcEnd, hourlyRate)
    });
  },

  onCalcDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const nextStart = field === 'calcStart' ? value : this.data.calcStart;
    const nextEnd = field === 'calcEnd' ? value : this.data.calcEnd;
    this.setData({
      [field]: value,
      calcResult: buildCalcResult(this.data.records, nextStart, nextEnd, this.data.hourlyRate)
    });
  },

  onTrendTap(e) {
    const ds = e.currentTarget.dataset;
    this.setData({ chartHint: `${ds.label}月：加班 ${ds.ot}h / 请假 ${ds.leave}h` });
  },

  doEstimate() {
    if (!this.data.calcStart || !this.data.calcEnd || this.data.calcStart > this.data.calcEnd) {
      wx.showToast({ title: '日期范围不合法', icon: 'none' });
      return;
    }
    const result = buildCalcResult(this.data.records, this.data.calcStart, this.data.calcEnd, this.data.hourlyRate);
    saveHourlyRate(this.data.hourlyRate);
    this.setData({ calcResult: result });
  },

  toggleTopMenu() {
    this.setData({ showTopMenu: !this.data.showTopMenu });
  },

  closeTopMenu() {
    this.setData({ showTopMenu: false });
  },

  goPrivacyPage() {
    this.closeTopMenu();
    wx.navigateTo({ url: '/pages/privacy/index' });
  },

  goAboutPage() {
    this.closeTopMenu();
    wx.navigateTo({ url: '/pages/about/index' });
  },

  goFeedbackPage() {
    this.closeTopMenu();
    wx.navigateTo({ url: '/pages/feedback/index' });
  },
  openSettings() {
    const data = normalizeSettingsState(loadSettings());
    this.setData({
      ...data,
      showTopMenu: false,
      showSettingsSheet: true
    });
  },

  closeSettingsSheet() {
    this.setData({ showSettingsSheet: false });
  },

  onSettingsTimeChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onSettingsRestFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    this.setData({ settingRestPeriods: updateSettingRestPeriods(this.data.settingRestPeriods, index, field, e.detail.value) });
  },

  onSettingsRestTimeChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    this.setData({ settingRestPeriods: updateSettingRestPeriods(this.data.settingRestPeriods, index, field, e.detail.value) });
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

  saveSettingsSheet() {
    const settings = {
      otDefaultStart: this.data.settingOtDefaultStart,
      otDefaultEnd: this.data.settingOtDefaultEnd,
      leaveDefaultStart: this.data.settingLeaveDefaultStart,
      leaveDefaultEnd: this.data.settingLeaveDefaultEnd,
      restPeriods: clonePeriods(this.data.settingRestPeriods)
    };
    const data = normalizeSettingsState(settings);
    data.showSettingsSheet = false;
    saveSettings(settings);
    this.setData(data);
    wx.showToast({ title: '设置已保存', icon: 'success' });
  },

  backupJSON() {
    this.closeTopMenu();
    writeTempFile(`overtime_backup_${Date.now()}.json`, JSON.stringify(this.data.records || [], null, 2))
      .then((path) => {
        handleGeneratedFile(path, { kind: 'json', successText: '备份文件已生成' });
      })
      .catch(() => {
        wx.showToast({ title: '备份失败', icon: 'none' });
      });
  },

  importJSON() {
    chooseAndReadJSON()
      .then((parsed) => {
        wx.showModal({
          title: '确认导入',
          content: `检测到 ${parsed.length} 条记录，导入会覆盖当前数据。`,
          success: (res) => {
            if (!res.confirm) return;
            saveRecords(parsed);
            this.closeTopMenu();
            this.reloadData();
            wx.showToast({ title: '导入成功', icon: 'success' });
          }
        });
      })
      .catch((error) => {
        wx.showToast({ title: error && error.message === 'invalid-json' ? 'JSON 格式不正确' : '读取文件失败', icon: 'none' });
      });
  },

  exportTable() {
    this.closeTopMenu();
    writeTempFile(`overtime_records_${Date.now()}.csv`, exportRecordsToCSV(this.data.records || []))
      .then((path) => {
        handleGeneratedFile(path, { kind: 'csv', successText: '表格文件已生成' });
      })
      .catch(() => {
        wx.showToast({ title: '导出失败', icon: 'none' });
      });
  },

  clearAllRecords() {
    this.closeTopMenu();
    wx.showModal({
      title: '清除全部记录',
      content: '确认清除所有加班和请假记录吗？此操作不可恢复。',
      success: (res) => {
        if (!res.confirm) return;
        saveRecords([]);
        this.reloadData();
        wx.showToast({ title: '已清除', icon: 'success' });
      }
    });
  },

  goCalendar() {
    const month = this.data.selectedMonthCursor || monthCursorFromDate(new Date());
    wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, month);
    wx.redirectTo({ url: `/pages/calendar/index?month=${month}` });
  },

  quickAdd() {
    wx.setStorageSync('ot_quick_add', 1);
    const month = this.data.selectedMonthCursor || monthCursorFromDate(new Date());
    wx.redirectTo({ url: `/pages/calendar/index?action=add&month=${month}` });
  },

  onShareAppMessage() {
    const month = this.data.selectedMonthCursor || monthCursorFromDate(new Date());
    return {
      title: `加班记录助手 · ${month}`,
      path: `/pages/stats/index?month=${month}`
    };
  },

  onShareTimeline() {
    const month = this.data.selectedMonthCursor || monthCursorFromDate(new Date());
    return {
      title: `加班记录助手 · ${month}`,
      query: `month=${month}`
    };
  },

  noop() {}
});
