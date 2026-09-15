const { RecordCategory, OvertimeType, LeaveType, DEFAULT_COLORS, PAY_RULES } = require('../../utils/constants');
const { syncUserData, loadRecords, saveRecords, loadSettings, saveSettings, loadHourlyRate, saveHourlyRate, loadUnlockedAchievements, saveUnlockedAchievements, loadCompactCardPreference, saveCompactCardPreference, loadCalcModePreference, saveCalcModePreference } = require('../../utils/storage');
const { ACHIEVEMENTS, evaluateAchievements } = require('../../utils/achievements');
const { payrollEstimate, cloneImages } = require('../../utils/records');
const { formatDate, calcDuration, getPeriodKey, getMonthMeta, endForDuration } = require('../../utils/time');
const { writeTempFile, handleGeneratedFile, exportRecordsToCSV, chooseAndReadJSON } = require('../../utils/files');
const { sanitizeOneDecimalInput, parseOneDecimal } = require('../../utils/decimal');
const { uploadFile, downloadCloudFile, resolveRecordMedia, deleteCloudFiles } = require('../../utils/cloud-files');
const { applyTimeWatermark } = require('../../utils/watermark');
const { pickCheer } = require('../../utils/cheers');
const { drawPoster, showPosterMenu } = require('../../utils/poster');

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
const WEEK_SHORT_SUNDAY = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_SHORT_MONDAY = ['一', '二', '三', '四', '五', '六', '日'];
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
  const weekStart = settings.weekStart === 'monday' ? 'monday' : 'sunday';
  return {
    settingDurationFormat: settings.durationFormat || 'hour',
    settingPeriodStartDay: settings.periodStartDay || 1,
    weekStart,
    weekShort: weekStart === 'monday' ? WEEK_SHORT_MONDAY : WEEK_SHORT_SUNDAY,
    theme: settings.colors || DEFAULT_COLORS,
    payRule: settings.payRule,
    payRuleName: payRuleDisplayName(settings.payRule)
  };
}

function filterByPeriod(records, cursor, startDay) {
  if (!startDay || startDay <= 1) {
    return records.filter((item) => String(item.date || '').startsWith(cursor));
  }
  return records.filter((item) => getPeriodKey(item.date, startDay) === cursor);
}

function buildMonthDays(currentDate, records, selectedDate, weekStart) {
  const meta = getMonthMeta(currentDate);
  const year = meta.year;
  const month = meta.month;
  const daysInMonth = meta.daysInMonth;
  const firstDay = meta.firstDay;
  // 周一开始时首日偏移换算（周日在第 7 列），使周六/周日固定在最右两列
  const offset = weekStart === 'monday' ? (firstDay + 6) % 7 : firstDay;
  const days = [];

  for (let i = 0; i < offset; i += 1) {
    days.push({ empty: true, key: `empty-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateStr = formatDate(date);
    const dayRecords = records.filter((item) => item.date === dateStr);
    const otRecords = dayRecords.filter((item) => item.category !== RecordCategory.LEAVE);
    const leaveRecords = dayRecords.filter((item) => item.category === RecordCategory.LEAVE);
    const showLeave = !otRecords.length && leaveRecords.length;
    const shown = showLeave ? leaveRecords : otRecords;
    days.push({
      empty: false,
      key: dateStr,
      day,
      dateStr,
      selected: selectedDate === dateStr,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: formatDate(new Date()) === dateStr,
      lunarText: getPseudoLunarText(day),
      dayRecords,
      dayTotal: Number(shown.reduce((sum, r) => sum + Number(r.duration || 0), 0).toFixed(1)),
      notePreview: buildNotePreview(dayRecords[0] && dayRecords[0].note),
      tagClass: showLeave ? 'leave' : recordTagClass(otRecords[0])
    });
  }

  return days;
}

function buildSelectedDayState(dateStr, records) {
  const dayRecords = dateStr ? records.filter((item) => item.date === dateStr) : [];
  return {
    selectedDate: dateStr,
    selectedDateText: dateStr ? formatDisplayDate(dateStr) : '',
    selectedDayRecords: dayRecords.map((item) => ({ ...item, badgeClass: recordTagClass(item) }))
  };
}

function needsMediaResolve(r) {
  if (!r) return false;
  const hasMedia = (r.images && r.images.length) || r.voiceId;
  if (!hasMedia) return false;
  const noCache = !(r._resolvedUrls && r._resolvedUrls.length);
  const expired = r._resolvedAt && Date.now() - r._resolvedAt > 5400000;
  const hasBlank = r._resolvedUrls && r._resolvedUrls.some((url) => !url);
  return noCache || expired || hasBlank;
}

function updateFormField(form, field, value) {
  const next = cloneForm(form);
  next[field] = value;
  return next;
}

/* ========== stats helper functions ========== */

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function buildMonthSummaryForCursor(records, cursor, startDay) {
  const monthRecords = filterByPeriod(records, cursor, startDay);
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
  const leaveRecords = records.filter((item) => item.category === RecordCategory.LEAVE);
  return {
    totalOtHours: Number(otRecords.reduce((sum, item) => sum + Number(item.duration || 0), 0).toFixed(1)),
    totalOtCount: otRecords.length,
    totalLeaveHours: Number(leaveRecords.reduce((sum, item) => sum + Number(item.duration || 0), 0).toFixed(1)),
    totalLeaveCount: leaveRecords.length
  };
}

function buildTrendForDate(records, rangeKey, anchorDate, startDay) {
  const months = rangeKey === '3m' ? 3 : rangeKey === '12m' ? 12 : rangeKey === 'year' ? anchorDate.getMonth() + 1 : 6;
  const data = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
    const key = monthCursorFromDate(date);
    const monthRecords = filterByPeriod(records, key, startDay);
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

function buildDonut(records, monthKey, startDay) {
  const monthRecords = filterByPeriod(records, monthKey, startDay);
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

  return {
    total: Number((weekday + weekend + holiday).toFixed(1)),
    weekday: Number(weekday.toFixed(1)),
    weekend: Number(weekend.toFixed(1)),
    holiday: Number(holiday.toFixed(1))
  };
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
    otHeight: Number(item.otHours || 0) > 0 ? Math.max(10, Math.round((Number(item.otHours || 0) / maxVal) * 138)) : 0,
    leaveHeight: Number(item.leaveHours || 0) > 0 ? Math.max(10, Math.round((Number(item.leaveHours || 0) / maxVal) * 138)) : 0
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
      badgeClass: recordTagClass(item),
      badgeText: item.category === RecordCategory.LEAVE
        ? '请假'
        : item.type === OvertimeType.HOLIDAY
          ? '节假日'
          : item.type === OvertimeType.WEEKEND
            ? '周末'
            : '平日'
    }));
}

function buildCalcResult(records, startDate, endDate, hourlyRate, payRule) {
  if (!startDate || !endDate || startDate > endDate) return { ...EMPTY_CALC_RESULT };
  return payrollEstimate(records, startDate, endDate, hourlyRate, payRule);
}

function payRuleDisplayName(payRule) {
  if (!payRule) return '法定标准';
  if (payRule.mode === 'custom') return '自定义';
  if (payRule.mode === 'tier') return '阶梯规则';
  const preset = PAY_RULES.find((r) => r.id === payRule.mode);
  return preset ? preset.name : '法定标准';
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

function calcPeriodRange(targetDate, startDay) {
  if (!startDay || startDay <= 1) {
    return {
      calcStart: `${monthCursorFromDate(targetDate)}-01`,
      calcEnd: formatDate(endOfMonth(targetDate))
    };
  }
  // 自定义考勤周期：上月 startDay 到本月 startDay-1
  return {
    calcStart: formatDate(new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, startDay)),
    calcEnd: formatDate(new Date(targetDate.getFullYear(), targetDate.getMonth(), startDay - 1))
  };
}

function resolveCalcRange(selectedMonthCursor, savedPrefs, startDay) {
  if (savedPrefs.calcStart && savedPrefs.calcEnd) {
    return { calcStart: savedPrefs.calcStart, calcEnd: savedPrefs.calcEnd };
  }
  return calcPeriodRange(dateFromMonthCursor(selectedMonthCursor), startDay);
}

function buildMonthLabel(targetDate) {
  return `${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月 · 概览`;
}

/* ========== Page ========== */

Page({
  data: {
    currentTab: 'calendar',
    donutSelectedIndex: -1,          // -1 表示无选中
    donutSelectedLabel: '',
    donutSelectedColor: '',
    donutSelectedHours: 0,
    donutSelectedPercent: 0,

    /* --- shared chrome --- */
    navTop: 0,
    navHeight: 44,
    heroHeight: 64,
    capsuleSpace: 96,
    menuTop: 72,
    showTopMenu: false,
    records: [],
    settingDurationFormat: 'hour',
    settingPeriodStartDay: 1,
    theme: DEFAULT_COLORS,

    /* --- calendar view --- */
    weekShort: WEEK_SHORT_SUNDAY,
    weekStart: 'sunday',
    currentMonthCursor: monthCursorFromDate(new Date()),
    monthTitle: '',
    monthDays: [],
    lunarInfo: '',
    settings: {},
    showEditor: false,
    selectedDate: '',
    selectedDateText: '',
    selectedDayRecords: [],
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
    cardVoicePlayingId: '',
    cheer: { show: false, emoji: '', text: '', title: '', caption: '' },
    unlockedAchievements: [],
    showAchievementDetailCard: false,
    achievementDetail: null,
    posterPreview: '',

    /* --- stats view --- */
    monthLabel: '',
    currentYearLabel: '',
    selectedMonthCursor: monthCursorFromDate(new Date()),
    rangeOptions: RANGE_OPTIONS,
    activeRange: '6m',
    detailFilter: 'all',
    chartHint: '',
    trendCursor: -1,
    monthSummary: { otHours: 0, leaveHours: 0, otCount: 0, leaveCount: 0 },
    yearSummary: { yearOtHours: 0, yearOtDays: 0 },
    allTimeSummary: { totalOtHours: 0, totalOtCount: 0, totalLeaveHours: 0, totalLeaveCount: 0 },
    avgMonthlyOt: 0,
    donut: { total: 0, weekday: 0, weekend: 0, holiday: 0 },
    trendBars: [],
    trendMaxText: '',
    detailRecords: [],
    hourlyRate: 25,
    payRules: PAY_RULES,
    showPayRuleSheet: false,
    payRuleDraft: null,
    calcStart: '',
    calcEnd: '',
    calcResult: { ...EMPTY_CALC_RESULT },
    calcMode: 'money',
    isCompactCard: true,
    compactRangeText: '',
    settlementDays: 0,
    settlementRemainHours: 0
  },

  /* ========== lifecycle ========== */

  onLoad(options) {
    // 开启右上角菜单的「分享给朋友 / 分享到朋友圈」
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
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
      // Canvas 可能在页面隐藏后失效，强制重建
      this.donutCtx = null;
      this.donutCanvas = null;
      this.donutCanvasReady = false;
      this.reloadStats();
    }
  },

  /* ========== chrome ========== */

  initChrome() {
    const info = wx.getWindowInfo();
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

    this.recorderManager.onError((err) => {
      console.warn('[record error]', err);
      this.setData({ isRecording: false });
      wx.showToast({ title: '录音失败', icon: 'none' });
    });

    this.innerAudioContext.onEnded(() => {
      this.setData({ isFormVoicePlaying: false, cardVoicePlayingId: '' });
    });

    this.innerAudioContext.onStop(() => {
      this.setData({ isFormVoicePlaying: false, cardVoicePlayingId: '' });
    });

    this.innerAudioContext.onError((err) => {
      console.warn('[audio error]', err);
      this.setData({ isFormVoicePlaying: false, cardVoicePlayingId: '' });
    });
  },

  /* ========== tab switching ========== */

  switchTab(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || e || '';
    if (tab === this.data.currentTab) return;

    // Canvas 随 wx:if 销毁重建，清除旧引用避免指向无效节点
    if (tab === 'stats') {
      this.donutCtx = null;
      this.donutCanvas = null;
      this.donutCanvasReady = false;
      this.donutSegments = [];
    }

    this.setData({ currentTab: tab }, () => {
      if (tab === 'calendar') {
        this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
      } else {
        this.reloadStats();
      }
    });
  },


  onReady() {
  this.donutCanvasReady = false;   // 标记 Canvas 是否已就绪
  this.donutCtx = null;
  this.donutCanvas = null;
  this.donutWidth = 0;
  this.donutHeight = 0;
  this.donutSegments = [];         // 存储扇区角度范围，用于点击检测
  },


ensureDonutCanvas(retries = 5) {
    return new Promise((resolve) => {
      if (this.donutCtx) {
        resolve(this.donutCtx);
        return;
      }

      const winInfo = wx.getWindowInfo();
      const dpr = winInfo.pixelRatio || 1;
      const windowWidth = winInfo.windowWidth || 375;
      const rpxRatio = windowWidth / 750;

      const retry = () => {
        if (retries > 0) {
          setTimeout(() => this.ensureDonutCanvas(retries - 1).then(resolve), 60);
        } else {
          console.warn('Canvas initialization failed, giving up');
          resolve(null);
        }
      };

      this.createSelectorQuery()
        .select('#overtimeDonut')
        .node((res) => {
          if (!res || !res.node) {
            retry();
            return;
          }

          try {
            const canvas = res.node;
            const widthPx = 238 * rpxRatio;
            const heightPx = 238 * rpxRatio;

            canvas.width = widthPx * dpr;
            canvas.height = heightPx * dpr;
            if (canvas.style) {
              canvas.style.width = widthPx + 'px';
              canvas.style.height = heightPx + 'px';
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('Failed to get 2d context from canvas');
            }

            ctx.scale(dpr, dpr);
            this.donutCanvas = canvas;
            this.donutCtx = ctx;
            this.donutWidth = widthPx;
            this.donutHeight = heightPx;
            this.donutCanvasReady = true;
            resolve(ctx);
          } catch (err) {
            console.error('Error setting up canvas:', err);
            retry();
          }
        })
        .exec();
    });
  },


  /* ========== calendar: data loading ========== */

  reloadAll() {
    const currentDate = dateFromMonthCursor(this.data.currentMonthCursor);
    const applyState = (records, settings) => {
      this.setData({ ...normalizeSettingsState(settings), records, settings }, () => {
        this.refreshCalendar(currentDate);
        // 存量/同步加载均静默评估成就，不弹卡
        this.refreshAchievements(records, true);
        // 从设置页返回时若停在统计页，需要重算结算卡（全时段开关等）
        if (this.data.currentTab === 'stats') this.reloadStats();
        const quickAddFromStorage = !!wx.getStorageSync('ot_quick_add');
        if (quickAddFromStorage) wx.removeStorageSync('ot_quick_add');
        if (quickAddFromStorage || this.pendingQuickAdd) {
          this.pendingQuickAdd = false;
          this.openEditorForDate(formatDate(new Date()), null);
        }
      });
    };

    const selectedDate = this.data.selectedDate || formatDate(currentDate);

    const loadAndApply = () => {
      const localRecords = loadRecords();
      const localSettings = loadSettings();
      if (JSON.stringify(localRecords) === JSON.stringify(this.data.records)
        && JSON.stringify(localSettings) === JSON.stringify(this.data.settings)) return;
      const needResolve = localRecords.filter((r) => r.date === selectedDate && needsMediaResolve(r));
      const apply = () => applyState(localRecords, localSettings);
      if (needResolve.length) {
        Promise.all(needResolve.map((r) => resolveRecordMedia(r))).then(apply);
      } else {
        apply();
      }
    };

    loadAndApply();
    syncUserData().then(async (state) => {
      if (!state) return;
      if (JSON.stringify(state.records) === JSON.stringify(this.data.records)
        && JSON.stringify(state.settings) === JSON.stringify(this.data.settings)) return;
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
    const candidateDays = buildMonthDays(currentDate, this.data.records, selectedInMonth ? selectedDate : '', this.data.weekStart);
    const targetDay = selectedInMonth
      ? candidateDays.find((item) => item.dateStr === selectedDate)
      : candidateDays.find((item) => !item.empty && item.isToday) || candidateDays.find((item) => !item.empty);
    selectedDate = targetDay ? targetDay.dateStr : '';
    const monthDays = buildMonthDays(currentDate, this.data.records, selectedDate, this.data.weekStart);
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

  async openEditorForDate(dateStr, recordId) {
    // WXML dataset 会把 id 转成字符串，统一按字符串比较，兼容数字 id（导入的旧数据）
    const existing = recordId ? this.data.records.find((item) => String(item.id) === String(recordId)) : null;
    const targetDate = new Date(`${dateStr}T00:00:00`);
    const settings = this.data.settings;
    let form;
    let editingRecordId = '';

    if (existing) {
      const images = cloneImages(existing.images);
      const voiceId = typeof existing.voiceId === 'string' ? existing.voiceId : '';
      let resolvedUrls = existing._resolvedUrls || [];
      let voiceLocalPath = existing._voiceLocalPath || '';

      if (images.length && (!resolvedUrls.length || (resolvedUrls[0] && resolvedUrls[0].startsWith('cloud://')))) {
        const paths = [];
        for (const id of images) {
          paths.push(id ? await downloadCloudFile(id) : '');
        }
        resolvedUrls = paths;
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
      const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
      const type = isWeekend ? OvertimeType.WEEKEND : OvertimeType.WEEKDAY;
      // 周末加班默认按全天班时间（与请假默认一致），平日加班按下班后时间
      const startTime = isWeekend ? settings.leaveDefaultStart : settings.otDefaultStart;
      const endTime = isWeekend ? settings.leaveDefaultEnd : settings.otDefaultEnd;
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
    this.setData({ showEditor: false, editingRecordId: '', isRecording: false, isFormVoicePlaying: false, cardVoicePlayingId: '' });
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
      // 周末加班默认即全天时间（与请假一致），不切换回下班后时间
      const isWeekend = isWeekendDate(selectedDate);
      if (form.startTime === leaveStart && form.endTime === leaveEnd && !isWeekend) {
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
    const dur = parseOneDecimal(duration, 0);
    if (form.startTime && dur > 0) {
      // 手动改时长时联动结束时间，保证时长与起止时间一致
      form.endTime = endForDuration(form.startTime, dur, this.data.settings.restPeriods);
    }
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
      wx.showToast({ title: '最多添加 3 张图片', icon: 'none' });
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

    wx.showLoading({ title: '处理中...' });
    const cloudIds = [];
    for (const tempPath of paths) {
      const stamped = await applyTimeWatermark(tempPath);
      const id = await uploadFile(stamped, 'img');
      if (id) cloudIds.push(id);
    }
    wx.hideLoading();

    const images = currentImages.concat(cloudIds).slice(0, 3);
    const prevResolved = this.data.form._resolvedUrls || [];
    const localPaths = [];
    for (let i = 0; i < images.length; i += 1) {
      const cloudId = images[i];
      if (!cloudId) { localPaths.push(''); continue; }
      // 已有图片复用之前的本地路径，只下载新上传的
      localPaths.push(prevResolved[i] || await downloadCloudFile(cloudId));
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
    const record = this.data.selectedDayRecords.find((r) => r.id === e.currentTarget.dataset.id);
    if (!record) return;
    const urls = (record._resolvedUrls || []).filter(Boolean);
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

    const recordId = String(this.data.editingRecordId || Date.now());
    const existing = this.data.records.find((item) => String(item.id) === recordId);
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

    const records = this.data.records.filter((item) => String(item.id) !== recordId);
    records.push(nextRecord);
    records.sort((a, b) => (a.date < b.date ? 1 : -1));
    saveRecords(records);

    this.setData({ records, showEditor: false, editingRecordId: '' }, () => {
      this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
      const newAchievements = this.refreshAchievements(records, false);
      if (newAchievements.length) {
        this.showAchievementCard(newAchievements[0]);
      } else if (nextRecord.category === RecordCategory.OVERTIME) {
        this.showCheer(nextRecord);
      } else {
        wx.showToast({ title: '已保存', icon: 'success' });
      }
    });
  },

  /* ========== calendar: cheer & achievements ========== */

  refreshAchievements(records, silent) {
    const settings = this.data.settings || {};
    const leaveFullDay = calcDuration(settings.leaveDefaultStart || '08:00', settings.leaveDefaultEnd || '17:00', settings.restPeriods);
    const unlocked = evaluateAchievements(records, {
      leaveFullDayHours: leaveFullDay
    });
    const stored = loadUnlockedAchievements();
    const newItems = [];
    let changed = false;
    unlocked.forEach(({ id, date }) => {
      const old = stored[id];
      if (typeof old === 'number') {
        // 旧格式（评估当天的时间戳）→ 自愈为达成日
        stored[id] = date;
        changed = true;
      } else if (!old) {
        stored[id] = date;
        changed = true;
        const item = ACHIEVEMENTS.find((a) => a.id === id);
        if (item) newItems.push(item);
      }
    });
    if (changed) saveUnlockedAchievements(stored);
    this.applyAchievementList(stored);
    return silent ? [] : newItems;
  },

  applyAchievementList(stored) {
    const unlockedAchievements = ACHIEVEMENTS
      .filter((a) => stored[a.id])
      .map((a) => ({
        id: a.id,
        emoji: a.emoji,
        name: a.name,
        category: a.category,
        desc: a.desc,
        quote: a.quote,
        time: stored[a.id]
      }));
    this.setData({ unlockedAchievements });
  },

  showAchievementCard(item) {
    if (!item) return;
    if (this.cheerTimer) clearTimeout(this.cheerTimer);
    this.setData({ cheer: { show: true, kind: 'achievement', emoji: item.emoji, title: item.name, text: item.quote, caption: '成就解锁' } });
    this.cheerTimer = setTimeout(() => {
      this.setData({ 'cheer.show': false });
    }, 2600);
  },

  showAchievementDetail(e) {
    const item = this.data.unlockedAchievements.find((a) => String(a.id) === String(e.currentTarget.dataset.id));
    if (!item) return;
    this.setData({ showAchievementDetailCard: true, achievementDetail: item });
    this.preparePosterPreview(item);
  },

  // 详情卡打开即生成海报预览（同一条成就只画一次）
  // 预览 setData 统一延迟到弹出动画（250ms）结束后，避免图片解码和动画抢帧
  preparePosterPreview(item) {
    if (this._posterCache && this._posterCache.id === item.id) {
      if (this._posterTimer) clearTimeout(this._posterTimer);
      this._posterTimer = setTimeout(() => {
        if (this.data.showAchievementDetailCard && this.data.achievementDetail
          && String(this.data.achievementDetail.id) === String(item.id)) {
          this.setData({ posterPreview: this._posterCache.path });
        }
      }, 300);
      return;
    }
    this.setData({ posterPreview: '' });
    if (this._posterTimer) clearTimeout(this._posterTimer);
    this._posterTimer = setTimeout(() => {
      drawPoster(item)
        .then((path) => {
          this._posterCache = { id: item.id, path };
          if (this.data.showAchievementDetailCard && this.data.achievementDetail
            && String(this.data.achievementDetail.id) === String(item.id)) {
            this.setData({ posterPreview: path });
          }
        })
        .catch(() => {});
    }, 300);
  },

  closeAchievementDetail() {
    this.setData({ showAchievementDetailCard: false, achievementDetail: null });
  },

  saveAchievementPosterImage() {
    const item = this.data.achievementDetail;
    if (!item || this.savingPoster) return;
    this.savingPoster = true;
    const cached = this.data.posterPreview
      && this.data.achievementDetail
      && String(this.data.achievementDetail.id) === String(item.id);
    const ready = cached ? Promise.resolve(this.data.posterPreview) : drawPoster(item);
    ready
      .then(showPosterMenu)
      .then(() => {
        if (wx.showShareImageMenu) return; // 分享面板自带操作反馈，无需 toast
        wx.showToast({ title: '海报已保存到相册', icon: 'success' });
      })
      .catch((err) => {
        const msg = (err && err.errMsg) || '';
        console.warn('[poster error]', err);
        if (/cancel/i.test(msg)) return; // 用户主动关闭分享面板，不算失败
        if (/auth/i.test(msg)) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存海报需要「添加到相册」权限，请在设置中开启',
            confirmText: '去设置',
            success: (res) => { if (res.confirm) wx.openSetting(); }
          });
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' });
        }
      })
      .then(() => { this.savingPoster = false; });
  },

  showCheer(record) {
    // 关闭开关时退回普通 toast，保留保存成功的反馈
    if (this.data.settings.cheerEnabled === false) {
      wx.showToast({ title: '已保存', icon: 'success' });
      return;
    }
    if (this.cheerTimer) clearTimeout(this.cheerTimer);
    const cheer = pickCheer(record, {
      isWeekend: record.type === OvertimeType.WEEKEND,
      isHoliday: record.type === OvertimeType.HOLIDAY,
      lastText: this.data.cheer.text
    });
    this.setData({ cheer: { show: true, kind: 'cheer', emoji: cheer.emoji, title: '', text: cheer.text, caption: '记录已保存' } });
    this.cheerTimer = setTimeout(() => {
      this.setData({ 'cheer.show': false });
    }, 2200);
  },

  deleteRecord() {
    if (!this.data.editingRecordId) return;
    wx.showModal({
      title: '确认删除',
      content: '这条记录会被永久删除。',
      success: (res) => {
        if (!res.confirm) return;
        const id = String(this.data.editingRecordId);
        const records = this.data.records.filter((item) => String(item.id) !== id);
        const deleting = this.data.records.find((item) => String(item.id) === id);
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
    const dayRecords = this.data.selectedDayRecords;
    if (!dayRecords || !dayRecords.length) return;

    try {
      for (const record of dayRecords) {
        if (needsMediaResolve(record)) {
          await resolveRecordMedia(record);
        }
      }
      this.setData({ selectedDayRecords: dayRecords });
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
    this.setData({ isFormVoicePlaying: false, cardVoicePlayingId: '' });

    const doStart = () => {
      this.recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'aac'
      });
      this.setData({ isRecording: true });
    };
    const authGuide = () => {
      wx.showModal({
        title: '需要麦克风权限',
        content: '录音需要使用麦克风，请在设置中开启权限',
        confirmText: '去设置',
        success: (res) => { if (res.confirm) wx.openSetting(); }
      });
    };

    // 录音需要 scope.record 授权，被拒过时直接引导去设置
    wx.getSetting({
      success: (res) => {
        const granted = res.authSetting['scope.record'];
        if (granted === false) {
          authGuide();
        } else if (granted) {
          doStart();
        } else {
          wx.authorize({ scope: 'scope.record', success: doStart, fail: authGuide });
        }
      },
      fail: doStart
    });
  },

  async saveVoiceToCloud(tempFilePath, duration) {
    if (!tempFilePath) {
      this.setData({ isRecording: false });
      return;
    }
    const form = updateFormField(this.data.form, '_voiceLocalPath', tempFilePath);
    this.setData({ form: updateFormField(form, 'voiceDuration', duration), isRecording: false });
    uploadFile(tempFilePath, 'voice').then((voiceId) => {
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

    this.setData({ cardVoicePlayingId: '' });
    this.innerAudioContext.src = localPath;
    this.innerAudioContext.play();
    this.setData({ isFormVoicePlaying: true });
  },

  async toggleCardVoicePlay(e) {
    const record = this.data.selectedDayRecords.find((r) => r.id === e.currentTarget.dataset.id);
    if (!record || !record.voiceDuration) return;

    if (this.data.cardVoicePlayingId === record.id) {
      this.innerAudioContext.stop();
      this.setData({ cardVoicePlayingId: '' });
      return;
    }

    this.setData({ isFormVoicePlaying: false, cardVoicePlayingId: record.id });

    let playPath = record._voiceLocalPath;
    if (!playPath) {
      if (!record.voiceId) {
        wx.showToast({ title: '语音同步中，请稍候', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '加载语音中…' });
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
  },

  editSelectedRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !this.data.selectedDate) return;
    this.openEditorForDate(this.data.selectedDate, id);
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
    const startDay = settings.periodStartDay || 1;
    const calcRange = resolveCalcRange(selectedMonthCursor, calcPrefs, startDay);
    const monthSummary = buildMonthSummaryForCursor(records, selectedMonthCursor, startDay);
    const yearSummary = buildYearSummaryForDate(records, targetDate);
    const allTimeSummary = buildAllTimeSummary(records);
    const donut = buildDonut(records, selectedMonthCursor, startDay);
    const trend = buildTrendForDate(records, this.data.activeRange, targetDate, startDay);
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
    // 全时段开关：按全部记录的最早~最晚日期统计，不随月份切换变化
    let calcStart = calcRange.calcStart;
    let calcEnd = calcRange.calcEnd;
    if (settings.calcAllTime && records.length) {
      calcStart = records[0].date;
      calcEnd = records[0].date;
      records.forEach((r) => {
        if (r.date < calcStart) calcStart = r.date;
        if (r.date > calcEnd) calcEnd = r.date;
      });
    }
    const calcResult = buildCalcResult(records, calcStart, calcEnd, hourlyRate, settings.payRule);
    const totalHours = calcResult.settlementHours || 0;
    const settlementDays = Math.floor(totalHours / 8);
    const settlementRemainHours = Number((totalHours % 8).toFixed(1));
    const compactRangeText = settings.calcAllTime && records.length ? '全部记录' : `${calcStart || '—'} ~ ${calcEnd || '—'}`;
    const savedCalcMode = loadCalcModePreference();

    const settingsData = normalizeSettingsState(settings);

    this.setData({
      ...settingsData,
      records,
      settings,
      hourlyRate,
      calcMode: savedCalcMode,
      isCompactCard: loadCompactCardPreference(),
      compactRangeText,
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
      donutSelectedIndex: -1,
      donutSelectedLabel: '',
      donutSelectedColor: '',
      donutSelectedHours: 0,
      donutSelectedPercent: 0,
      trendCursor: -1,
      trendBars,
      trendMaxText,
      detailRecords,
      chartHint,
      calcResult,
      settlementDays,
      settlementRemainHours
    }, () => {
      this.drawDonutChart();
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
    this.setData({ activeRange: key, trendCursor: -1 }, () => this.reloadStats());
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
    const startDay = this.data.settingPeriodStartDay || 1;
    const { calcStart, calcEnd } = calcPeriodRange(targetDate, startDay);
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
    const calcResult = buildCalcResult(this.data.records, this.data.calcStart, this.data.calcEnd, rateValue, this.data.payRule);
    const totalHours = calcResult.settlementHours || 0;
    this.setData({
      hourlyRate,
      calcResult,
      settlementDays: Math.floor(totalHours / 8),
      settlementRemainHours: Number((totalHours % 8).toFixed(1))
    });
  },

  onCalcDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const nextStart = field === 'calcStart' ? value : this.data.calcStart;
    const nextEnd = field === 'calcEnd' ? value : this.data.calcEnd;
    saveCalcPrefs(nextStart, nextEnd);
    const calcResult = buildCalcResult(this.data.records, nextStart, nextEnd, this.data.hourlyRate, this.data.payRule);
    const totalHours = calcResult.settlementHours || 0;
    this.setData({
      [field]: value,
      calcResult,
      settlementDays: Math.floor(totalHours / 8),
      settlementRemainHours: Number((totalHours % 8).toFixed(1))
    });
  },

  switchCalcMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.calcMode) return;
    saveCalcModePreference(mode);
    this.setData({ calcMode: mode });
  },

  toggleCompactCard() {
    const next = !this.data.isCompactCard;
    saveCompactCardPreference(next);
    this.setData({ isCompactCard: next });
  },

  /* ========== pay rule switcher ========== */

  openPayRuleSheet() {
    this.setData({ showPayRuleSheet: true, payRuleDraft: null });
  },

  closePayRuleSheet() {
    this.setData({ showPayRuleSheet: false, payRuleDraft: null });
  },

  selectPayRule(e) {
    const id = e.currentTarget.dataset.id;
    if (id === 'custom') {
      // 进入自定义编辑：以当前生效数值为底
      this.setData({ payRuleDraft: { ...this.data.payRule, mode: 'custom' } });
      return;
    }
    if (id === 'tier') {
      this.setData({ payRuleDraft: { ...this.data.payRule, mode: 'tier' } });
      return;
    }
    const preset = PAY_RULES.find((r) => r.id === id);
    if (!preset) return;
    this.applyPayRule({
      mode: preset.id,
      weekday: preset.weekday,
      weekend: preset.weekend,
      holiday: preset.holiday,
      deductLeave: preset.deductLeave
    });
  },

  onPayRuleField(e) {
    const field = e.currentTarget.dataset.field;
    if (!['weekday', 'weekend', 'holiday', 'startHours', 'intervalHours', 'baseAmount', 'stepIncrement', 'maxHours'].includes(field) || !this.data.payRuleDraft) return;
    this.setData({ payRuleDraft: { ...this.data.payRuleDraft, [field]: sanitizeOneDecimalInput(e.detail.value) } });
  },

  onPayRuleDeduct(e) {
    if (!this.data.payRuleDraft) return;
    this.setData({ payRuleDraft: { ...this.data.payRuleDraft, deductLeave: e.detail.value } });
  },

  onFrontField(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const draft = this.data.payRuleDraft;
    if (!draft || !draft.frontBrackets || !draft.frontBrackets[index]) return;
    this.setData({ payRuleDraft: { ...draft, frontBrackets: draft.frontBrackets.map((f, i) => (i === index ? { ...f, [field]: e.detail.value } : f)) } });
  },

  addFrontBracket() {
    const draft = this.data.payRuleDraft;
    if (!draft || (draft.frontBrackets || []).length >= 3) return;
    this.setData({ payRuleDraft: { ...draft, frontBrackets: [...(draft.frontBrackets || []), { hours: '', amount: '' }] } });
  },

  removeFrontBracket(e) {
    const index = Number(e.currentTarget.dataset.index);
    const draft = this.data.payRuleDraft;
    if (!draft || !draft.frontBrackets) return;
    this.setData({ payRuleDraft: { ...draft, frontBrackets: draft.frontBrackets.filter((_, i) => i !== index) } });
  },

  confirmPayRule() {
    const draft = this.data.payRuleDraft;
    if (!draft) return;
    const num = (v, dft) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : dft;
    };
    if (draft.mode === 'tier') {
      this.applyPayRule({
        mode: 'tier',
        startHours: num(draft.startHours, 40),
        frontBrackets: (draft.frontBrackets || [])
          .map((f) => ({ hours: num(f.hours, 0), amount: num(f.amount, 0) }))
          .filter((f) => f.hours > 0)
          .slice(0, 3),
        intervalHours: num(draft.intervalHours, 5) || 5,
        baseAmount: num(draft.baseAmount, 600),
        stepIncrement: num(draft.stepIncrement, 100),
        maxHours: num(draft.maxHours, 60),
        deductLeave: draft.deductLeave !== false
      });
      return;
    }
    this.applyPayRule({
      mode: 'custom',
      weekday: num(draft.weekday, 1.5),
      weekend: num(draft.weekend, 2),
      holiday: num(draft.holiday, 3),
      deductLeave: draft.deductLeave !== false
    });
  },

  applyPayRule(rule) {
    const settings = { ...this.data.settings, payRule: rule };
    saveSettings(settings);
    const calcResult = buildCalcResult(this.data.records, this.data.calcStart, this.data.calcEnd, this.data.hourlyRate, rule);
    const totalHours = calcResult.settlementHours || 0;
    this.setData({
      settings,
      payRule: rule,
      payRuleName: payRuleDisplayName(rule),
      showPayRuleSheet: false,
      payRuleDraft: null,
      calcResult,
      settlementDays: Math.floor(totalHours / 8),
      settlementRemainHours: Number((totalHours % 8).toFixed(1))
    });
  },

  /* ========== trend chart interaction ========== */

  onTrendTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isFinite(index)) return;
    const bars = this.data.trendBars || [];
    const bar = bars[index];
    if (!bar) return;

    // 点击同一柱子取消选中
    const newCursor = (index === this.data.trendCursor) ? -1 : index;
    const hint = newCursor !== -1
      ? `${bar.shortLabel}月：加班 ${bar.otHours}h / 请假 ${bar.leaveHours}h`
      : '';

    this.setData({
      trendCursor: newCursor,
      chartHint: hint
    });
  },

  /* ========== donut chart ========== */

  async drawDonutChart() {
  const ctx = await this.ensureDonutCanvas();
  if (!ctx) {
    console.warn('Canvas context not available, skip drawing');
    return;
  }
  
  // 确保宽高已初始化
  if (!this.donutWidth || !this.donutHeight) {
    console.warn('Canvas dimensions not initialized');
    return;
  }
  
  const { donut, donutSelectedIndex } = this.data;
  const total = Number(donut.total) || 0;
  const width = this.donutWidth;
  const height = this.donutHeight;
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.min(width, height) * 0.45;
  const innerRadius = outerRadius * 0.72;
  const gapPx = 3; // 扇区间隙：固定像素宽，内外缘等宽

  ctx.clearRect(0, 0, width, height);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, 2 * Math.PI);
    ctx.arc(cx, cy, innerRadius, 0, 2 * Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    this.donutSegments = [];
    return;
  }

  const theme = this.data.theme || DEFAULT_COLORS;
  const segments = [
    { key: 'weekday', label: '平日', value: Number(donut.weekday) || 0, color: theme.weekday },
    { key: 'weekend', label: '周末', value: Number(donut.weekend) || 0, color: theme.weekend },
    { key: 'holiday', label: '节假日', value: Number(donut.holiday) || 0, color: theme.holiday },
  ];

  let startAngle = -Math.PI / 2; // 从 12 点钟方向开始
  const segData = [];
  for (const seg of segments) {
    const ratio = seg.value / total;
    const drawAngle = seg.value > 0 ? ratio * 2 * Math.PI : 0;
    const endAngle = startAngle + drawAngle;
    segData.push({ ...seg, startAngle, endAngle, drawAngle });
    startAngle = endAngle;
  }

  this.donutSegments = segData;

  // 先画非选中扇区，再画选中扇区（让选中的在最上层）
  const drawOrder = segData.map((_, i) => i).sort((a, b) =>
    (a === donutSelectedIndex ? 1 : 0) - (b === donutSelectedIndex ? 1 : 0)
  );

  for (const i of drawOrder) {
    const seg = segData[i];
    if (seg.drawAngle <= 0) continue;
    const isSelected = (donutSelectedIndex === i);
    const rOuter = isSelected ? outerRadius + 5 : outerRadius;

    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, seg.startAngle, seg.endAngle);
    ctx.arc(cx, cy, innerRadius, seg.endAngle, seg.startAngle, true);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
  }

  // 扇区间隙：固定像素宽的径向线，内外缘宽度一致；
  // 交界处若涉及选中扇区，间隙线延伸到其外扩半径，避免外扩部分边界裸露
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = gapPx;
  ctx.lineCap = 'butt';
  for (let i = 0; i < segData.length; i += 1) {
    const seg = segData[i];
    if (seg.drawAngle <= 0) continue;
    let next = (i + 1) % segData.length;
    while (segData[next].drawAngle <= 0 && next !== i) {
      next = (next + 1) % segData.length;
    }
    if (next === i) break; // 只有一个有值扇区，无需间隙
    const boundary = seg.endAngle;
    const rOuter = (donutSelectedIndex === i || donutSelectedIndex === next) ? outerRadius + 5 : outerRadius;
    ctx.beginPath();
    ctx.moveTo(cx + innerRadius * Math.cos(boundary), cy + innerRadius * Math.sin(boundary));
    ctx.lineTo(cx + rOuter * Math.cos(boundary), cy + rOuter * Math.sin(boundary));
    ctx.stroke();
  }
},

  selectDonutSegment(e) {
    if (!this.donutWidth || !this.donutHeight || !this.donutSegments || !this.donutSegments.length) {
      return;
    }

    // bindtouchstart → e.touches[0]; bindtouchend → e.changedTouches[0]
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    const x = touch.clientX || touch.x || 0;
    const y = touch.clientY || touch.y || 0;
    if (!x || !y) return;

    this.createSelectorQuery()
      .select('.donut-canvas')
      .boundingClientRect((rect) => {
        if (!rect) return;

        const tapX = x - rect.left;
        const tapY = y - rect.top;

        const cx = this.donutWidth / 2;
        const cy = this.donutHeight / 2;
        const outerRadius = Math.min(this.donutWidth, this.donutHeight) * 0.48;
        const innerRadius = outerRadius * 0.72;

        const dx = tapX - cx;
        const dy = tapY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 点击在圆环外或内圈 → 取消选中
        if (dist < innerRadius || dist > outerRadius + 8) {
          if (this.data.donutSelectedIndex !== -1) {
            this.setData({ donutSelectedIndex: -1 }, () => this.drawDonutChart());
          }
          return;
        }

        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += 2 * Math.PI;

        const segs = this.donutSegments;
        let found = -1;
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          // 处理跨越 0/2π 边界的情况
          const aStart = seg.startAngle < 0 ? seg.startAngle + 2 * Math.PI : seg.startAngle;
          const aEnd = seg.endAngle < 0 ? seg.endAngle + 2 * Math.PI : seg.endAngle;
          let hit;
          if (aStart <= aEnd) {
            hit = angle >= aStart && angle < aEnd;
          } else {
            hit = angle >= aStart || angle < aEnd; // 跨越边界
          }
          if (hit) {
            found = i;
            break;
          }
        }

        // 点击同一扇区 → 取消选中；否则切换
        const newIndex = (found === this.data.donutSelectedIndex) ? -1 : found;
        this.applyDonutSelection(newIndex, found !== -1 ? segs[found] : null);
      })
      .exec();
  },

  /* 点击图例切换选中 */
  onLegendTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isFinite(index)) return;
    const segs = this.donutSegments || [];
    const seg = segs[index];
    if (!seg || seg.drawAngle <= 0) return; // 无数据项不响应
    const newIndex = (index === this.data.donutSelectedIndex) ? -1 : index;
    this.applyDonutSelection(newIndex, seg);
  },

  /* 统一更新选中状态 + 重绘 */
  applyDonutSelection(newIndex, seg) {
    const updateData = { donutSelectedIndex: newIndex };
    if (newIndex !== -1 && seg) {
      const total = Number(this.data.donut.total) || 0;
      const percent = total > 0 ? Math.round((seg.value / total) * 100) : 0;
      updateData.donutSelectedLabel = seg.label;
      updateData.donutSelectedColor = seg.color;
      updateData.donutSelectedHours = seg.value;
      updateData.donutSelectedPercent = percent;
    } else {
      updateData.donutSelectedLabel = '';
      updateData.donutSelectedColor = '';
      updateData.donutSelectedHours = 0;
      updateData.donutSelectedPercent = 0;
    }
    this.setData(updateData, () => this.drawDonutChart());
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

  goSettingsPage() {
    this.closeTopMenu();
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  /* ========== shared: import / export ========== */

  backupJSON() {
    this.closeTopMenu();
    writeTempFile(`overtime_backup_${Date.now()}.json`, JSON.stringify(this.data.records || [], null, 2))
      .then((path) => {
        handleGeneratedFile(path, '备份已生成');
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
          content: `检测到 ${parsed.length} 条记录，导入将覆盖当前数据。`,
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
        handleGeneratedFile(path, '表格已导出');
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
    this.openEditorForDate(dateStr, null);
  },

  /* ========== share ========== */

  onShareAppMessage() {
    const ach = this.data.showAchievementDetailCard ? this.data.achievementDetail : null;
    if (ach) {
      return {
        title: `${ach.emoji} 我在加班记录助手解锁了成就「${ach.name}」`,
        path: '/pages/calendar/index'
      };
    }
    const month = this.data.currentMonthCursor || monthCursorFromDate(new Date());
    return {
      title: `加班记录助手 · ${month}`,
      path: `/pages/calendar/index?month=${month}`
    };
  },

  onShareTimeline() {
    const ach = this.data.showAchievementDetailCard ? this.data.achievementDetail : null;
    if (ach) {
      return { title: `${ach.emoji} 我在加班记录助手解锁了成就「${ach.name}」` };
    }
    const month = this.data.currentMonthCursor || monthCursorFromDate(new Date());
    return {
      title: `加班记录助手 · ${month}`,
      query: `month=${month}`
    };
  },

  noop() {}
});
