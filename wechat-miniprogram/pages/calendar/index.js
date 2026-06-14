const { RecordCategory, OvertimeType, LeaveType } = require('../../utils/constants');
const { syncUserData, loadRecords, saveRecords, loadSettings, saveSettings, loadHourlyRate, saveHourlyRate } = require('../../utils/storage');
const { payrollEstimate } = require('../../utils/records');
const { formatDate, calcDuration, getMonthMeta } = require('../../utils/time');
const { writeTempFile, handleGeneratedFile, exportRecordsToCSV, chooseAndReadJSON } = require('../../utils/files');
const { sanitizeOneDecimalInput, parseOneDecimal } = require('../../utils/decimal');
const { uploadImage, uploadVoice, getTempUrls, downloadCloudFile, resolveRecordMedia, deleteCloudFiles } = require('../../utils/cloud-files');

const SELECTED_MONTH_CURSOR_KEY = 'ot_selected_month_cursor';
const CALC_PREFS_KEY = 'ot_stats_calc_prefs';

const RANGE_OPTIONS = [
  { key: '3m', label: '近3个月' },
  { key: '6m', label: '近6个月' },
  { key: '12m', label: '近12个月' },
  { key: 'year', label: '今年' }
];

const EMPTY_CALC_RESULT = {
  weekday: 0,
  weekend: 0,
  holiday: 0,
  leave: 0,
  weighted: 0,
  settlementHours: 0,
  amount: 0
};

const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
const LUNAR_DAY_NAMES = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

/* ========== helper functions ========== */

function monthCursorFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateFromMonthCursor(cursor) {
  const parts = String(cursor).split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  return new Date(year, (month || 1) - 1, 1);
}

function formatDisplayDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_NAMES[date.getDay()]}`;
}

function getPseudoLunarText(day) {
  return LUNAR_DAY_NAMES[(day - 1) % 30];
}

function recordTagClass(record) {
  if (!record) return '';
  if (record.category === RecordCategory.LEAVE) return 'leave';
  if (record.type === OvertimeType.WEEKEND) return 'weekend';
  if (record.type === OvertimeType.HOLIDAY) return 'holiday';
  return 'weekday';
}

function buildNotePreview(note) {
  const text = String(note || '').trim();
  if (!text) return '';
  return text.length > 4 ? `${text.slice(0, 4)}...` : text;
}

function isWeekendDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.getDay() === 0 || date.getDay() === 6;
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

function cloneImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((item) => typeof item === 'string' && item).slice(0, 3);
}

function cloneForm(form) {
  return {
    category: form.category,
    type: form.type,
    startTime: form.startTime,
    endTime: form.endTime,
    duration: form.duration,
    note: form.note,
    images: cloneImages(form.images),
    _resolvedUrls: Array.isArray(form._resolvedUrls) ? form._resolvedUrls.slice(0, 3) : [],
    voiceId: typeof form.voiceId === 'string' ? form.voiceId : '',
    _voiceLocalPath: typeof form._voiceLocalPath === 'string' ? form._voiceLocalPath : '',
    voiceDuration: Number(form.voiceDuration) > 0 ? Number(form.voiceDuration) : 0
  };
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

function buildMonthDays(currentDate, records, selectedDate) {
  const meta = getMonthMeta(currentDate);
  const year = meta.year;
  const month = meta.month;
  const daysInMonth = meta.daysInMonth;
  const firstDay = meta.firstDay;
  const days = [];

  for (let i = 0; i < firstDay; i += 1) {
    days.push({ empty: true, key: `empty-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateStr = formatDate(date);
    const record = records.find((item) => item.date === dateStr);
    days.push({
      empty: false,
      key: dateStr,
      day,
      dateStr,
      selected: selectedDate === dateStr,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: formatDate(new Date()) === dateStr,
      lunarText: getPseudoLunarText(day),
      record,
      notePreview: buildNotePreview(record && record.note),
      tagClass: recordTagClass(record)
    });
  }

  return days;
}

function buildSelectedDayState(dateStr, records) {
  const record = records.find((item) => item.date === dateStr) || null;
  return {
    selectedDate: dateStr,
    selectedDateText: dateStr ? formatDisplayDate(dateStr) : '',
    selectedDayRecord: record
  };
}

function buildSettingsData(records, settings) {
  const data = normalizeSettingsState(settings);
  data.records = records;
  data.settings = settings;
  return data;
}

function updateFormField(form, field, value) {
  const next = cloneForm(form);
  next[field] = value;
  return next;
}

function updateSettingRestPeriods(periods, index, field, value) {
  const next = clonePeriods(periods);
  if (!next[index]) return next;
  next[index][field] = value;
  return next;
}

/* ========== stats helper functions ========== */

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

function buildAllTimeSummary(records) {
  const otRecords = records.filter((item) => item.category !== RecordCategory.LEAVE);
  return {
    totalOtHours: Number(otRecords.reduce((sum, item) => sum + Number(item.duration || 0), 0).toFixed(1)),
    totalOtCount: otRecords.length
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

function buildCalcResult(records, startDate, endDate, hourlyRate) {
  if (!startDate || !endDate || startDate > endDate) return { ...EMPTY_CALC_RESULT };
  return payrollEstimate(records, startDate, endDate, hourlyRate);
}

function loadCalcPrefs() {
  const saved = wx.getStorageSync(CALC_PREFS_KEY) || {};
  return {
    calcStart: typeof saved.calcStart === 'string' ? saved.calcStart : '',
    calcEnd: typeof saved.calcEnd === 'string' ? saved.calcEnd : ''
  };
}

function saveCalcPrefs(calcStart, calcEnd) {
  wx.setStorageSync(CALC_PREFS_KEY, { calcStart, calcEnd });
}

function resolveCalcRange(selectedMonthCursor, savedPrefs) {
  const targetDate = dateFromMonthCursor(selectedMonthCursor);
  return {
    calcStart: savedPrefs.calcStart || `${selectedMonthCursor}-01`,
    calcEnd: savedPrefs.calcEnd || formatDate(endOfMonth(targetDate))
  };
}

function buildMonthLabel(targetDate) {
  return `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月 · 概览`;
}

/* ========== Page ========== */

Page({
  data: {
    currentTab: 'calendar',

    /* --- shared chrome --- */
    navTop: 0,
    navHeight: 44,
    heroHeight: 64,
    capsuleSpace: 96,
    menuTop: 72,
    showTopMenu: false,
    showSettingsSheet: false,
    records: [],
    settingOtDefaultStart: '18:00',
    settingOtDefaultEnd: '20:00',
    settingLeaveDefaultStart: '08:00',
    settingLeaveDefaultEnd: '17:00',
    settingRestPeriods: [],

    /* --- calendar view --- */
    weekShort: WEEK_SHORT,
    currentMonthCursor: monthCursorFromDate(new Date()),
    monthTitle: '',
    monthDays: [],
    lunarInfo: '',
    settings: {},
    showEditor: false,
    selectedDate: '',
    selectedDateText: '',
    selectedDayRecord: null,
    editingRecordId: '',
    form: {
      category: RecordCategory.OVERTIME,
      type: OvertimeType.WEEKDAY,
      startTime: '18:00',
      endTime: '20:00',
      duration: 2,
      note: '',
      images: [],
      _resolvedUrls: [],
      voiceId: '',
      _voiceLocalPath: '',
      voiceDuration: 0
    },
    overtimeTypeOptions: [OvertimeType.WEEKDAY, OvertimeType.WEEKEND, OvertimeType.HOLIDAY],
    leaveTypeOptions: [LeaveType.COMPENSATORY, LeaveType.PERSONAL, LeaveType.SICK, LeaveType.ANNUAL, LeaveType.OTHER],
    currentTypeOptions: [OvertimeType.WEEKDAY, OvertimeType.WEEKEND, OvertimeType.HOLIDAY],
    isRecording: false,
    isFormVoicePlaying: false,
    isCardVoicePlaying: false,

    /* --- stats view --- */
    monthLabel: '',
    currentYearLabel: '',
    selectedMonthCursor: monthCursorFromDate(new Date()),
    rangeOptions: RANGE_OPTIONS,
    activeRange: '6m',
    detailFilter: 'all',
    chartHint: '',
    monthSummary: { otHours: 0, leaveHours: 0, otCount: 0, leaveCount: 0 },
    yearSummary: { yearOtHours: 0, yearOtDays: 0 },
    allTimeSummary: { totalOtHours: 0, totalOtCount: 0 },
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

  /* ========== lifecycle ========== */

  onLoad(options) {
    this.pendingQuickAdd = options && options.action === 'add';
    if (options && /^\d{4}-\d{2}$/.test(options.month || '')) {
      this.pendingMonthCursor = options.month;
      this.setData({ currentMonthCursor: options.month });
      wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, options.month);
    }
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
    this.initChrome();
    this.initVoice();
  },

  onShow() {
    this.reloadAll();
    if (this.data.currentTab === 'stats') {
      this.reloadStats();
    }
  },

  /* ========== chrome ========== */

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

  initVoice() {
    this.recorderManager = wx.getRecorderManager();
    this.innerAudioContext = wx.createInnerAudioContext();

    this.recorderManager.onStop((res) => {
      const { tempFilePath, duration } = res;
      const seconds = Math.ceil((duration || 0) / 1000);
      this.saveVoiceToCloud(tempFilePath, seconds);
    });

    this.recorderManager.onError(() => {
      this.setData({ isRecording: false });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });

    this.innerAudioContext.onEnded(() => {
      this.setData({ isFormVoicePlaying: false, isCardVoicePlaying: false });
    });

    this.innerAudioContext.onStop(() => {
      this.setData({ isFormVoicePlaying: false, isCardVoicePlaying: false });
    });

    this.innerAudioContext.onError((err) => {
      console.warn('[audio error]', err);
      this.setData({ isFormVoicePlaying: false, isCardVoicePlaying: false });
    });
  },

  /* ========== tab switching ========== */

  switchTab(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || e || '';
    if (tab === this.data.currentTab) return;
    if (tab === 'stats') {
      this.reloadStats();
    }
    this.setData({ currentTab: tab }, () => {
      if (tab === 'calendar') {
        this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
      }
    });
  },

  /* ========== calendar: data loading ========== */

  reloadAll() {
    const currentDate = dateFromMonthCursor(this.data.currentMonthCursor);
    const applyState = (records, settings) => {
      this.setData(buildSettingsData(records, settings), () => {
        this.refreshCalendar(currentDate);
        const quickAddFromStorage = !!wx.getStorageSync('ot_quick_add');
        if (quickAddFromStorage) wx.removeStorageSync('ot_quick_add');
        if (quickAddFromStorage || this.pendingQuickAdd) {
          this.pendingQuickAdd = false;
          this.openEditorForDate(formatDate(new Date()), true);
        }
      });
    };

    const selectedDate = this.data.selectedDate || formatDate(currentDate);

    const needsMediaResolve = (r) => {
      if (!r) return false;
      const hasMedia = (r.images && r.images.length) || r.voiceId;
      if (!hasMedia) return false;
      const noCache = !(r._resolvedUrls && r._resolvedUrls.length);
      const expired = r._resolvedAt && Date.now() - r._resolvedAt > 5400000;
      const hasBlank = r._resolvedUrls && r._resolvedUrls.some((url) => !url);
      return noCache || expired || hasBlank;
    };

    const loadAndApply = () => {
      const localRecords = loadRecords();
      const localSettings = loadSettings();
      if (JSON.stringify(localRecords) === JSON.stringify(this.data.records)) return;
      const record = localRecords.find((r) => r.date === selectedDate);
      if (needsMediaResolve(record)) {
        resolveRecordMedia(record).then(() => applyState(localRecords, localSettings));
      } else {
        applyState(localRecords, localSettings);
      }
    };

    loadAndApply();
    syncUserData().then(async (state) => {
      if (!state) return;
      if (JSON.stringify(state.records) === JSON.stringify(this.data.records)) return;
      for (const r of state.records) {
        if (needsMediaResolve(r)) {
          await resolveRecordMedia(r);
        }
      }
      wx.setStorageSync('ot_records', state.records);
      applyState(state.records, state.settings);
    });
  },

  refreshCalendar(currentDate) {
    const currentMonthCursor = monthCursorFromDate(currentDate);
    const monthTitle = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    let selectedDate = this.data.selectedDate;
    const selectedInMonth = selectedDate && selectedDate.startsWith(currentMonthCursor);
    const candidateDays = buildMonthDays(currentDate, this.data.records, selectedInMonth ? selectedDate : '');
    const targetDay = selectedInMonth
      ? candidateDays.find((item) => item.dateStr === selectedDate)
      : candidateDays.find((item) => !item.empty && item.isToday) || candidateDays.find((item) => !item.empty);
    selectedDate = targetDay ? targetDay.dateStr : '';
    const monthDays = buildMonthDays(currentDate, this.data.records, selectedDate);
    const lunarInfo = targetDay ? `农历 ${targetDay.lunarText}` : '';
    const selectedDayState = buildSelectedDayState(selectedDate, this.data.records);
    wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, currentMonthCursor);
    this.setData({ currentMonthCursor, monthTitle, monthDays, lunarInfo, ...selectedDayState });
  },

  prevMonth() {
    const current = dateFromMonthCursor(this.data.currentMonthCursor);
    this.refreshCalendar(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  },

  nextMonth() {
    const current = dateFromMonthCursor(this.data.currentMonthCursor);
    this.refreshCalendar(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  },

  onTapDay(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    const target = this.data.monthDays.find((item) => item.dateStr === dateStr);
    const monthDays = this.data.monthDays.map((item) => (
      item.empty ? item : Object.assign({}, item, { selected: item.dateStr === dateStr })
    ));
    this.setData({
      ...buildSelectedDayState(dateStr, this.data.records),
      monthDays,
      lunarInfo: target ? `农历 ${target.lunarText}` : ''
    }, () => {
      this.resolveSelectedMedia();
    });
  },

  /* ========== calendar: editor ========== */

  async openEditorForDate(dateStr, forceNew) {
    const existing = forceNew ? null : this.data.records.find((item) => item.date === dateStr);
    const targetDate = new Date(`${dateStr}T00:00:00`);
    const settings = this.data.settings;
    let form;
    let editingRecordId = '';

    if (existing) {
      const images = cloneImages(existing.images);
      const voiceId = typeof existing.voiceId === 'string' ? existing.voiceId : '';
      let resolvedUrls = existing._resolvedUrls || [];
      let voiceLocalPath = existing._voiceLocalPath || '';

      if (images.length && (!resolvedUrls.length || resolvedUrls[0] && resolvedUrls[0].startsWith('cloud://'))) {
        resolvedUrls = await getTempUrls(images);
      }
      if (voiceId && !voiceLocalPath) {
        voiceLocalPath = await downloadCloudFile(voiceId);
      }

      form = {
        category: existing.category || RecordCategory.OVERTIME,
        type: existing.type || OvertimeType.WEEKDAY,
        startTime: existing.startTime,
        endTime: existing.endTime,
        duration: Number(existing.duration || 0),
        note: existing.note || '',
        images,
        _resolvedUrls: resolvedUrls.filter(Boolean),
        voiceId,
        _voiceLocalPath: voiceLocalPath,
        voiceDuration: Number(existing.voiceDuration) > 0 ? Number(existing.voiceDuration) : 0
      };
      editingRecordId = existing.id;
    } else {
      const type = targetDate.getDay() === 0 || targetDate.getDay() === 6 ? OvertimeType.WEEKEND : OvertimeType.WEEKDAY;
      const startTime = settings.otDefaultStart;
      const endTime = settings.otDefaultEnd;
      form = {
        category: RecordCategory.OVERTIME,
        type,
        startTime,
        endTime,
        duration: calcDuration(startTime, endTime, settings.restPeriods),
        note: '',
        images: [],
        _resolvedUrls: [],
        voiceId: '',
        _voiceLocalPath: '',
        voiceDuration: 0
      };
    }

    this.setData({
      showEditor: true,
      selectedDate: dateStr,
      selectedDateText: formatDisplayDate(dateStr),
      editingRecordId,
      form,
      currentTypeOptions: form.category === RecordCategory.OVERTIME ? this.data.overtimeTypeOptions : this.data.leaveTypeOptions
    });
  },

  closeEditor() {
    if (this.data.isRecording && this.recorderManager) {
      this.recorderManager.stop();
    }
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
    }
    this.setData({ showEditor: false, editingRecordId: '', isRecording: false, isFormVoicePlaying: false, isCardVoicePlaying: false });
  },

  switchCategory(e) {
    const category = e.currentTarget.dataset.category;
    if (!category || category === this.data.form.category) return;

    const settings = this.data.settings;
    const selectedDate = this.data.selectedDate;
    const form = cloneForm(this.data.form);
    form.category = category;

    const leaveStart = settings.leaveDefaultStart;
    const leaveEnd = settings.leaveDefaultEnd;
    const otStart = settings.otDefaultStart;
    const otEnd = settings.otDefaultEnd;
    const overtimeDefaultType = isWeekendDate(selectedDate) ? OvertimeType.WEEKEND : OvertimeType.WEEKDAY;

    if (category === RecordCategory.OVERTIME) {
      if (this.data.leaveTypeOptions.includes(form.type)) form.type = overtimeDefaultType;
      if (form.startTime === leaveStart && form.endTime === leaveEnd) {
        form.startTime = otStart;
        form.endTime = otEnd;
        form.duration = calcDuration(otStart, otEnd, settings.restPeriods);
      }
    }

    if (category === RecordCategory.LEAVE) {
      if (this.data.overtimeTypeOptions.includes(form.type)) form.type = LeaveType.COMPENSATORY;
      if (form.startTime === otStart && form.endTime === otEnd) {
        form.startTime = leaveStart;
        form.endTime = leaveEnd;
        form.duration = calcDuration(leaveStart, leaveEnd, settings.restPeriods);
      }
    }

    this.setData({ form, currentTypeOptions: category === RecordCategory.OVERTIME ? this.data.overtimeTypeOptions : this.data.leaveTypeOptions });
  },

  onTypeChange(e) {
    const index = Number(e.detail.value);
    const form = updateFormField(this.data.form, 'type', this.data.currentTypeOptions[index]);
    this.setData({ form });
  },

  onTimeChange(e) {
    const field = e.currentTarget.dataset.field;
    const form = updateFormField(this.data.form, field, e.detail.value);
    form.duration = calcDuration(form.startTime, form.endTime, this.data.settings.restPeriods);
    this.setData({ form });
  },

  onDurationInput(e) {
    const duration = sanitizeOneDecimalInput(e.detail.value);
    const form = updateFormField(this.data.form, 'duration', duration);
    this.setData({ form });
  },

  onNoteInput(e) {
    const form = updateFormField(this.data.form, 'note', e.detail.value);
    this.setData({ form });
  },

  async chooseRecordImages() {
    const currentImages = cloneImages(this.data.form.images);
    const remainCount = 3 - currentImages.length;
    if (remainCount <= 0) {
      wx.showToast({ title: '最多添加3张图片', icon: 'none' });
      return;
    }

    const choose = wx.chooseMedia
      ? new Promise((resolve, reject) => {
          wx.chooseMedia({
            count: remainCount,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => resolve((res.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean)),
            fail: reject
          });
        })
      : new Promise((resolve, reject) => {
          wx.chooseImage({
            count: remainCount,
            sourceType: ['album', 'camera'],
            success: (res) => resolve(res.tempFilePaths || []),
            fail: reject
          });
        });

    let paths;
    try {
      paths = await choose;
    } catch (error) {
      if (error && error.errMsg && error.errMsg.indexOf('cancel') !== -1) return;
      wx.showToast({ title: '图片添加失败', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '上传中...' });
    const cloudIds = [];
    for (const tempPath of paths) {
      const id = await uploadImage(tempPath);
      if (id) cloudIds.push(id);
    }
    wx.hideLoading();

    const images = currentImages.concat(cloudIds).slice(0, 3);
    const localPaths = [];
    for (const cloudId of images) {
      const path = cloudId ? await downloadCloudFile(cloudId) : '';
      localPaths.push(path);
    }
    const form = updateFormField(this.data.form, 'images', images);
    this.setData({ form: updateFormField(form, '_resolvedUrls', localPaths) });
  },

  previewRecordImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const urls = (this.data.form._resolvedUrls || []).filter(Boolean);
    if (!urls[index]) return;
    wx.previewImage({ urls, current: urls[index] });
  },

  previewSelectedDayImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const record = this.data.selectedDayRecord;
    const urls = (record && record._resolvedUrls || []).filter(Boolean);
    if (!urls[index]) return;
    wx.previewImage({ urls, current: urls[index] });
  },

  removeRecordImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = cloneImages(this.data.form.images);
    images.splice(index, 1);
    const form = updateFormField(this.data.form, 'images', images);
    const resolved = cloneImages(this.data.form._resolvedUrls);
    resolved.splice(index, 1);
    this.setData({ form: updateFormField(form, '_resolvedUrls', resolved) });
  },

  saveRecord() {
    if (!this.data.selectedDate) return;

    const recordId = this.data.editingRecordId || Date.now().toString();
    const existing = this.data.records.find((item) => item.id === recordId);
    const nextRecord = {
      id: recordId,
      date: this.data.selectedDate,
      category: this.data.form.category,
      type: this.data.form.type,
      startTime: this.data.form.startTime,
      endTime: this.data.form.endTime,
      duration: parseOneDecimal(this.data.form.duration, 0),
      note: this.data.form.note || '',
      images: cloneImages(this.data.form.images),
      voiceId: this.data.form.voiceId || '',
      voiceDuration: this.data.form.voiceDuration || 0,
      _resolvedUrls: Array.isArray(this.data.form._resolvedUrls) ? this.data.form._resolvedUrls.slice(0, 3) : [],
      _voiceLocalPath: this.data.form._voiceLocalPath || ''
    };

    if (existing) {
      const oldImages = cloneImages(existing.images);
      const newImages = nextRecord.images;
      const removedImages = oldImages.filter((id) => !newImages.includes(id));
      if (removedImages.length) deleteCloudFiles(removedImages).catch(() => {});
      if (existing.voiceId && existing.voiceId !== nextRecord.voiceId) {
        deleteCloudFiles([existing.voiceId]).catch(() => {});
      }
    }

    const records = this.data.records.filter((item) => item.date !== this.data.selectedDate && item.id !== recordId);
    records.push(nextRecord);
    records.sort((a, b) => (a.date < b.date ? 1 : -1));
    saveRecords(records);

    this.setData({ records, showEditor: false, editingRecordId: '' }, () => {
      this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
      wx.showToast({ title: '已保存', icon: 'success' });
    });
  },

  deleteRecord() {
    if (!this.data.editingRecordId) return;
    wx.showModal({
      title: '确认删除',
      content: '这条记录会被永久删除。',
      success: (res) => {
        if (!res.confirm) return;
        const records = this.data.records.filter((item) => item.id !== this.data.editingRecordId);
        const deleting = this.data.records.find((item) => item.id === this.data.editingRecordId);
        if (deleting) {
          const cloudIds = [...(deleting.images || []), deleting.voiceId || ''].filter(Boolean);
          if (cloudIds.length) deleteCloudFiles(cloudIds).catch(() => {});
        }
        saveRecords(records);
        this.setData({ records, showEditor: false, editingRecordId: '' }, () => {
          this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
          wx.showToast({ title: '已删除', icon: 'success' });
        });
      }
    });
  },

  /* ========== calendar: media ========== */

  async resolveSelectedMedia() {
    const record = this.data.selectedDayRecord;
    if (!record) return;
    const urlsExpired = record._resolvedAt && Date.now() - record._resolvedAt > 5400000;
    const needImages = record.images && record.images.length
      && (!(record._resolvedUrls && record._resolvedUrls.length) || urlsExpired);
    const needVoice = record.voiceId && !record._voiceLocalPath;
    if (!needImages && !needVoice) return;

    try {
      const resolved = await resolveRecordMedia(record);
      if (resolved) {
        this.setData({ selectedDayRecord: resolved });
      }
    } catch (err) {
      console.warn('[resolve selected media failed]', err);
    }
  },

  /* ========== calendar: voice ========== */

  toggleVoiceRecord() {
    if (this.data.isRecording) {
      this.recorderManager.stop();
      this.setData({ isRecording: false });
      return;
    }

    this.innerAudioContext.stop();
    this.setData({ isFormVoicePlaying: false, isCardVoicePlaying: false });

    this.recorderManager.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'aac'
    });
    this.setData({ isRecording: true });
  },

  async saveVoiceToCloud(tempFilePath, duration) {
    if (!tempFilePath) {
      this.setData({ isRecording: false });
      return;
    }
    const form = updateFormField(this.data.form, '_voiceLocalPath', tempFilePath);
    this.setData({ form: updateFormField(form, 'voiceDuration', duration), isRecording: false });
    uploadVoice(tempFilePath).then((voiceId) => {
      if (voiceId) {
        const f = updateFormField(this.data.form, 'voiceId', voiceId);
        this.setData({ form: f });
      }
    });
  },

  async toggleFormVoicePlay() {
    const localPath = this.data.form._voiceLocalPath;
    if (!localPath) return;

    if (this.data.isFormVoicePlaying) {
      this.innerAudioContext.stop();
      return;
    }

    this.setData({ isCardVoicePlaying: false });
    this.innerAudioContext.src = localPath;
    this.innerAudioContext.play();
    this.setData({ isFormVoicePlaying: true });
  },

  async toggleCardVoicePlay() {
    const record = this.data.selectedDayRecord;
    if (!record || !record.voiceDuration) return;

    if (this.data.isCardVoicePlaying) {
      this.innerAudioContext.stop();
      return;
    }

    this.setData({ isFormVoicePlaying: false });

    let playPath = record._voiceLocalPath;
    if (!playPath) {
      if (!record.voiceId) {
        wx.showToast({ title: '语音同步中，请稍后', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '加载语音...' });
      playPath = await downloadCloudFile(record.voiceId);
      if (playPath) {
        playPath = await this.copyToPermanent(playPath);
      }
      wx.hideLoading();
      if (!playPath) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        return;
      }
      record._voiceLocalPath = playPath;
    }

    this.innerAudioContext.src = playPath;
    this.innerAudioContext.play();
    this.setData({ isCardVoicePlaying: true });
  },

  copyToPermanent(tempPath) {
    if (!tempPath) return Promise.resolve('');
    return new Promise((resolve) => {
      const fs = wx.getFileSystemManager && wx.getFileSystemManager();
      if (!fs || !fs.saveFile) { resolve(tempPath); return; }
      fs.saveFile({
        tempFilePath: tempPath,
        success(res) { resolve(res.savedFilePath); },
        fail() {
          resolve(tempPath);
        }
      });
    });
  },

  deleteFormVoice(e) {
    if (e) e.stopPropagation && e.stopPropagation();
    const form = updateFormField(this.data.form, 'voiceId', '');
    this.setData({ form: updateFormField(updateFormField(form, '_voiceLocalPath', ''), 'voiceDuration', 0) });
  },

  /* ========== stats: data loading ========== */

  reloadStats() {
    try {
    const records = loadRecords();
    const settings = loadSettings();
    const hourlyRate = loadHourlyRate();
    const fallbackCursor = monthCursorFromDate(new Date());
    const selectedMonthCursor = this.pendingMonthCursor
      || wx.getStorageSync(SELECTED_MONTH_CURSOR_KEY)
      || fallbackCursor;
    const targetDate = dateFromMonthCursor(selectedMonthCursor);
    const calcPrefs = loadCalcPrefs();
    const calcRange = resolveCalcRange(selectedMonthCursor, calcPrefs);

    const monthSummary = buildMonthSummaryForCursor(records, selectedMonthCursor);
    const yearSummary = buildYearSummaryForDate(records, targetDate);
    const allTimeSummary = buildAllTimeSummary(records);
    const donut = buildDonut(records, selectedMonthCursor);
    const trend = buildTrendData(records, this.data.activeRange, targetDate);
    const trendBars = buildTrendBars(trend);
    const maxTrend = trend.reduce((best, item) =>
      (!best || Number(item.otHours || 0) > Number(best.otHours || 0) ? item : best), null);
    const trendMaxText = maxTrend && maxTrend.otHours > 0
      ? `${maxTrend.label} ${maxTrend.otHours}h` : '';
    const avgMonthlyOt = trend.length
      ? Number((trend.reduce((sum, item) => sum + Number(item.otHours || 0), 0) / trend.length).toFixed(1)) : 0;
    const detailRecords = buildDetailRecords(records, this.data.activeRange, this.data.detailFilter, targetDate);
    const chartHint = trendBars.length
      ? `${trendBars[trendBars.length - 1].shortLabel}月：加班 ${trendBars[trendBars.length - 1].otHours}h / 请假 ${trendBars[trendBars.length - 1].leaveHours}h` : '';
    const calcStart = calcRange.calcStart;
    const calcEnd = calcRange.calcEnd;
    const calcResult = buildCalcResult(records, calcStart, calcEnd, hourlyRate);

    const settingsData = normalizeSettingsState(settings);

    this.setData({
      ...settingsData,
      records,
      settings,
      hourlyRate,
      selectedMonthCursor,
      currentYearLabel: String(targetDate.getFullYear()),
      monthLabel: buildMonthLabel(targetDate),
      calcStart,
      calcEnd,
      monthSummary,
      yearSummary,
      allTimeSummary,
      avgMonthlyOt,
      donut,
      trendBars,
      trendMaxText,
      detailRecords,
      chartHint,
      calcResult
    });

    this.pendingMonthCursor = null;
    } catch (err) {
      console.error('[reloadStats error]', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /* ========== stats: interactions ========== */

  setRange(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeRange) return;
    this.setData({ activeRange: key }, () => this.reloadStats());
  },

  setDetailFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (!filter || filter === this.data.detailFilter) return;
    this.setData({ detailFilter: filter }, () => this.reloadStats());
  },

  switchStatsMonth(offset) {
    const current = dateFromMonthCursor(this.data.selectedMonthCursor || monthCursorFromDate(new Date()));
    const targetDate = new Date(current.getFullYear(), current.getMonth() + offset, 1);
    const selectedMonthCursor = monthCursorFromDate(targetDate);
    const calcStart = `${selectedMonthCursor}-01`;
    const calcEnd = formatDate(endOfMonth(targetDate));
    this.pendingMonthCursor = selectedMonthCursor;
    wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, selectedMonthCursor);
    saveCalcPrefs(calcStart, calcEnd);
    this.setData({
      selectedMonthCursor,
      currentYearLabel: String(targetDate.getFullYear()),
      monthLabel: buildMonthLabel(targetDate),
      calcStart,
      calcEnd
    }, () => this.reloadStats());
  },

  prevStatsMonth() {
    this.switchStatsMonth(-1);
  },

  nextStatsMonth() {
    this.switchStatsMonth(1);
  },

  onRateInput(e) {
    const hourlyRate = sanitizeOneDecimalInput(e.detail.value);
    const rateValue = parseOneDecimal(hourlyRate, 0);
    saveHourlyRate(rateValue);
    this.setData({
      hourlyRate,
      calcResult: buildCalcResult(this.data.records, this.data.calcStart, this.data.calcEnd, rateValue)
    });
  },

  onCalcDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const nextStart = field === 'calcStart' ? value : this.data.calcStart;
    const nextEnd = field === 'calcEnd' ? value : this.data.calcEnd;
    saveCalcPrefs(nextStart, nextEnd);
    this.setData({
      [field]: value,
      calcResult: buildCalcResult(this.data.records, nextStart, nextEnd, this.data.hourlyRate)
    });
  },

  onTrendTap(e) {
    const ds = e.currentTarget.dataset;
    this.setData({ chartHint: `${ds.label}月：加班 ${ds.ot}h / 请假 ${ds.leave}h` });
  },

  /* ========== shared: top menu & settings ========== */

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
    data.showSettingsSheet = true;
    this.closeTopMenu();
    this.setData(data);
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
    const settingRestPeriods = updateSettingRestPeriods(this.data.settingRestPeriods, index, field, e.detail.value);
    this.setData({ settingRestPeriods });
  },

  onSettingsRestTimeChange(e) {
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

  saveSettingsSheet() {
    const settings = {
      otDefaultStart: this.data.settingOtDefaultStart,
      otDefaultEnd: this.data.settingOtDefaultEnd,
      leaveDefaultStart: this.data.settingLeaveDefaultStart,
      leaveDefaultEnd: this.data.settingLeaveDefaultEnd,
      restPeriods: clonePeriods(this.data.settingRestPeriods)
    };
    const data = normalizeSettingsState(settings);
    data.settings = settings;
    data.showSettingsSheet = false;
    saveSettings(settings);
    this.setData(data);
    wx.showToast({ title: '设置已保存', icon: 'success' });
  },

  /* ========== shared: import / export ========== */

  backupJSON() {
    this.closeTopMenu();
    writeTempFile(`overtime_backup_${Date.now()}.json`, JSON.stringify(this.data.records || [], null, 2))
      .then((path) => {
        handleGeneratedFile(path, { kind: 'json', successText: '备份已生成' });
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
            this.reloadAll();
            if (this.data.currentTab === 'stats') this.reloadStats();
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
        handleGeneratedFile(path, { kind: 'csv', successText: '表格已导出' });
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
        const allCloudIds = [];
        this.data.records.forEach((record) => {
          if (record.images) allCloudIds.push(...record.images);
          if (record.voiceId) allCloudIds.push(record.voiceId);
        });
        if (allCloudIds.length) deleteCloudFiles(allCloudIds).catch(() => {});
        saveRecords([]);
        this.setData({ records: [], showEditor: false, editingRecordId: '' }, () => {
          if (this.data.currentTab === 'stats') {
            this.reloadStats();
          } else {
            this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
          }
          wx.showToast({ title: '已清除', icon: 'success' });
        });
      }
    });
  },

  /* ========== quick add ========== */

  quickAdd() {
    const dateStr = this.data.selectedDate || formatDate(new Date());
    this.openEditorForDate(dateStr, false);
  },

  /* ========== share ========== */

  onShareAppMessage() {
    const month = this.data.currentMonthCursor || monthCursorFromDate(new Date());
    return {
      title: `加班记录助手 · ${month}`,
      path: `/pages/calendar/index?month=${month}`
    };
  },

  onShareTimeline() {
    const month = this.data.currentMonthCursor || monthCursorFromDate(new Date());
    return {
      title: `加班记录助手 · ${month}`,
      query: `month=${month}`
    };
  },

  noop() {}
});
