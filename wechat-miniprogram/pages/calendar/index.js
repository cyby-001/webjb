const { RecordCategory, OvertimeType, LeaveType } = require('../../utils/constants');
const { syncUserData, loadRecords, saveRecords, loadSettings, saveSettings } = require('../../utils/storage');
const { formatDate, calcDuration, getMonthMeta } = require('../../utils/time');
const { writeTempFile, handleGeneratedFile, exportRecordsToCSV, chooseAndReadJSON } = require('../../utils/files');
const SELECTED_MONTH_CURSOR_KEY = 'ot_selected_month_cursor';


const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
const LUNAR_DAY_NAMES = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

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

function cloneForm(form) {
  return {
    category: form.category,
    type: form.type,
    startTime: form.startTime,
    endTime: form.endTime,
    duration: form.duration,
    note: form.note
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

function buildMonthDays(currentDate, records) {
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

Page({
  data: {
    navTop: 0,
    navHeight: 44,
    heroHeight: 64,
    capsuleSpace: 96,
    menuTop: 72,
    weekShort: WEEK_SHORT,
    currentMonthCursor: monthCursorFromDate(new Date()),
    monthTitle: '',
    monthDays: [],
    lunarInfo: '',
    records: [],
    settings: {},
    showTopMenu: false,
    showEditor: false,
    showSettingsSheet: false,
    selectedDate: '',
    selectedDateText: '',
    editingRecordId: '',
    settingOtDefaultStart: '18:00',
    settingOtDefaultEnd: '20:00',
    settingLeaveDefaultStart: '08:00',
    settingLeaveDefaultEnd: '17:00',
    settingRestPeriods: [],
    form: { category: RecordCategory.OVERTIME, type: OvertimeType.WEEKDAY, startTime: '18:00', endTime: '20:00', duration: 2, note: '' },
    overtimeTypeOptions: [OvertimeType.WEEKDAY, OvertimeType.WEEKEND, OvertimeType.HOLIDAY],
    leaveTypeOptions: [LeaveType.COMPENSATORY, LeaveType.PERSONAL, LeaveType.SICK, LeaveType.ANNUAL, LeaveType.OTHER],
    currentTypeOptions: [OvertimeType.WEEKDAY, OvertimeType.WEEKEND, OvertimeType.HOLIDAY]
  },

  onLoad(options) {
    this.pendingQuickAdd = options && options.action === 'add';
    if (options && /^\d{4}-\d{2}$/.test(options.month || '')) {
      this.setData({ currentMonthCursor: options.month });
      wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, options.month);
    }
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
    this.initChrome();
  },

  onShow() {
    this.reloadAll();
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

    applyState(loadRecords(), loadSettings());
    syncUserData().then((state) => {
      if (!state) return;
      applyState(state.records, state.settings);
    });
  },

  refreshCalendar(currentDate) {
    const currentMonthCursor = monthCursorFromDate(currentDate);
    const monthTitle = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    const monthDays = buildMonthDays(currentDate, this.data.records);
    const targetDay = monthDays.find((item) => !item.empty && item.isToday) || monthDays.find((item) => !item.empty);
    const lunarInfo = targetDay ? `农历 ${targetDay.lunarText}` : '';
    wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, currentMonthCursor);
    this.setData({ currentMonthCursor, monthTitle, monthDays, lunarInfo });
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
    if (target) this.setData({ lunarInfo: `农历 ${target.lunarText}` });
    this.openEditorForDate(dateStr, false);
  },

  openEditorForDate(dateStr, forceNew) {
    const existing = forceNew ? null : this.data.records.find((item) => item.date === dateStr);
    const targetDate = new Date(`${dateStr}T00:00:00`);
    const settings = this.data.settings;
    let form;
    let editingRecordId = '';

    if (existing) {
      form = {
        category: existing.category || RecordCategory.OVERTIME,
        type: existing.type || OvertimeType.WEEKDAY,
        startTime: existing.startTime,
        endTime: existing.endTime,
        duration: Number(existing.duration || 0),
        note: existing.note || ''
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
        note: ''
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
    this.setData({ showEditor: false, editingRecordId: '' });
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
    const duration = Number(e.detail.value);
    const form = updateFormField(this.data.form, 'duration', Number.isFinite(duration) ? duration : 0);
    this.setData({ form });
  },

  onNoteInput(e) {
    const form = updateFormField(this.data.form, 'note', e.detail.value);
    this.setData({ form });
  },

  saveRecord() {
    if (!this.data.selectedDate) return;

    const recordId = this.data.editingRecordId || Date.now().toString();
    const nextRecord = {
      id: recordId,
      date: this.data.selectedDate,
      category: this.data.form.category,
      type: this.data.form.type,
      startTime: this.data.form.startTime,
      endTime: this.data.form.endTime,
      duration: Number(this.data.form.duration || 0),
      note: this.data.form.note || ''
    };

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
        saveRecords(records);
        this.setData({ records, showEditor: false, editingRecordId: '' }, () => {
          this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
          wx.showToast({ title: '已删除', icon: 'success' });
        });
      }
    });
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
            this.reloadAll();
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
        this.setData({ records: [], showEditor: false, editingRecordId: '' }, () => {
          this.refreshCalendar(dateFromMonthCursor(this.data.currentMonthCursor));
          wx.showToast({ title: '已清除', icon: 'success' });
        });
      }
    });
  },

  goStats() {
    const month = this.data.currentMonthCursor || monthCursorFromDate(new Date());
    wx.setStorageSync(SELECTED_MONTH_CURSOR_KEY, month);
    wx.redirectTo({ url: `/pages/stats/index?month=${month}` });
  },

  quickAdd() {
    this.openEditorForDate(formatDate(new Date()), true);
  },

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
