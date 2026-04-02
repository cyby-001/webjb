const { STORAGE_KEYS, DEFAULT_SETTINGS } = require('./constants');

const CLOUD_COLLECTION = 'ot_profiles';
const LOCAL_META_KEYS = {
  CLOUD_DOC_ID: 'ot_cloud_doc_id',
  UPDATED_AT: 'ot_state_updated_at'
};

function cloneRestPeriods(restPeriods) {
  if (!Array.isArray(restPeriods)) return [];
  return restPeriods.map((item) => ({
    id: item.id,
    start: item.start,
    end: item.end,
    label: item.label
  }));
}

function cloneRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map((item) => ({
    id: item.id,
    date: item.date,
    category: item.category,
    type: item.type,
    startTime: item.startTime,
    endTime: item.endTime,
    duration: Number(item.duration || 0),
    note: item.note || ''
  }));
}

function buildSettings(source) {
  const settings = source && typeof source === 'object' ? source : {};
  return {
    otDefaultStart: settings.otDefaultStart || DEFAULT_SETTINGS.otDefaultStart,
    otDefaultEnd: settings.otDefaultEnd || DEFAULT_SETTINGS.otDefaultEnd,
    leaveDefaultStart: settings.leaveDefaultStart || DEFAULT_SETTINGS.leaveDefaultStart,
    leaveDefaultEnd: settings.leaveDefaultEnd || DEFAULT_SETTINGS.leaveDefaultEnd,
    restPeriods: Array.isArray(settings.restPeriods)
      ? cloneRestPeriods(settings.restPeriods)
      : cloneRestPeriods(DEFAULT_SETTINGS.restPeriods)
  };
}

function normalizeRate(rate) {
  const num = Number(rate);
  return Number.isFinite(num) && num >= 0 ? num : 25;
}

function normalizeTimestamp(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function getDefaultState() {
  return {
    records: [],
    settings: buildSettings(DEFAULT_SETTINGS),
    hourlyRate: 25,
    updatedAt: 0
  };
}

function getLocalState() {
  const state = getDefaultState();
  const records = wx.getStorageSync(STORAGE_KEYS.RECORDS);
  const settings = wx.getStorageSync(STORAGE_KEYS.SETTINGS);
  const rate = wx.getStorageSync(STORAGE_KEYS.RATE);
  const updatedAt = wx.getStorageSync(LOCAL_META_KEYS.UPDATED_AT);

  state.records = cloneRecords(records);
  state.settings = buildSettings(settings);
  state.hourlyRate = normalizeRate(rate);
  state.updatedAt = normalizeTimestamp(updatedAt);
  return state;
}

function writeLocalState(state) {
  const nextState = {
    records: cloneRecords(state.records),
    settings: buildSettings(state.settings),
    hourlyRate: normalizeRate(state.hourlyRate),
    updatedAt: normalizeTimestamp(state.updatedAt)
  };

  wx.setStorageSync(STORAGE_KEYS.RECORDS, nextState.records);
  wx.setStorageSync(STORAGE_KEYS.SETTINGS, nextState.settings);
  wx.setStorageSync(STORAGE_KEYS.RATE, nextState.hourlyRate);
  wx.setStorageSync(LOCAL_META_KEYS.UPDATED_AT, nextState.updatedAt);
  return nextState;
}

function hasMeaningfulState(state) {
  if (state.records.length > 0) return true;
  if (normalizeRate(state.hourlyRate) !== 25) return true;
  return JSON.stringify(buildSettings(state.settings)) !== JSON.stringify(buildSettings(DEFAULT_SETTINGS));
}

function getCloudDatabase() {
  if (!wx.cloud || typeof wx.cloud.database !== 'function') return null;
  return wx.cloud.database();
}

async function readCloudProfile() {
  const db = getCloudDatabase();
  if (!db) return null;

  const collection = db.collection(CLOUD_COLLECTION);
  const cachedDocId = wx.getStorageSync(LOCAL_META_KEYS.CLOUD_DOC_ID);

  if (cachedDocId) {
    try {
      const byId = await collection.doc(cachedDocId).get();
      if (byId && byId.data) {
        wx.setStorageSync(LOCAL_META_KEYS.CLOUD_DOC_ID, byId.data._id);
        return normalizeCloudProfile(byId.data);
      }
    } catch (error) {
      wx.removeStorageSync(LOCAL_META_KEYS.CLOUD_DOC_ID);
    }
  }

  const result = await collection.limit(1).get();
  const doc = result && result.data && result.data[0];
  if (!doc) return null;
  wx.setStorageSync(LOCAL_META_KEYS.CLOUD_DOC_ID, doc._id);
  return normalizeCloudProfile(doc);
}

function normalizeCloudProfile(doc) {
  return {
    docId: doc._id,
    records: cloneRecords(doc.records),
    settings: buildSettings(doc.settings),
    hourlyRate: normalizeRate(doc.hourlyRate),
    updatedAt: normalizeTimestamp(doc.updatedAt)
  };
}

async function createCloudProfile(state) {
  const db = getCloudDatabase();
  if (!db) throw new Error('cloud-unavailable');

  const now = Date.now();
  const payload = {
    records: cloneRecords(state.records),
    settings: buildSettings(state.settings),
    hourlyRate: normalizeRate(state.hourlyRate),
    updatedAt: normalizeTimestamp(state.updatedAt) || now,
    createdAt: now
  };

  const result = await db.collection(CLOUD_COLLECTION).add({ data: payload });
  if (result && result._id) {
    wx.setStorageSync(LOCAL_META_KEYS.CLOUD_DOC_ID, result._id);
  }
  return result;
}

async function updateCloudProfile(docId, state) {
  const db = getCloudDatabase();
  if (!db) throw new Error('cloud-unavailable');

  await db.collection(CLOUD_COLLECTION).doc(docId).update({
    data: {
      records: cloneRecords(state.records),
      settings: buildSettings(state.settings),
      hourlyRate: normalizeRate(state.hourlyRate),
      updatedAt: normalizeTimestamp(state.updatedAt) || Date.now()
    }
  });
}

async function pushStateToCloud(state) {
  const db = getCloudDatabase();
  if (!db) {
    return { cloudSynced: false, reason: 'cloud-unavailable' };
  }

  const nextState = writeLocalState(state);
  try {
    const profile = await readCloudProfile();
    if (profile && profile.docId) {
      await updateCloudProfile(profile.docId, nextState);
    } else {
      await createCloudProfile(nextState);
    }
    return { cloudSynced: true, state: nextState };
  } catch (error) {
    console.error('[cloud sync failed]', error);
    return { cloudSynced: false, state: nextState, error };
  }
}

async function syncUserData() {
  const localState = getLocalState();
  const db = getCloudDatabase();
  if (!db) return localState;

  try {
    const cloudState = await readCloudProfile();
    if (!cloudState) {
      if (hasMeaningfulState(localState)) {
        const uploadState = Object.assign({}, localState, {
          updatedAt: localState.updatedAt || Date.now()
        });
        await createCloudProfile(uploadState);
        return writeLocalState(uploadState);
      }
      return localState;
    }

    if (cloudState.updatedAt > localState.updatedAt) {
      return writeLocalState(cloudState);
    }

    if (localState.updatedAt > cloudState.updatedAt) {
      await updateCloudProfile(cloudState.docId, localState);
      return localState;
    }

    return writeLocalState(cloudState);
  } catch (error) {
    console.error('[cloud syncUserData failed]', error);
    return localState;
  }
}

function buildTouchedState(patch) {
  const state = getLocalState();
  const nextState = {
    records: Object.prototype.hasOwnProperty.call(patch, 'records') ? cloneRecords(patch.records) : state.records,
    settings: Object.prototype.hasOwnProperty.call(patch, 'settings') ? buildSettings(patch.settings) : state.settings,
    hourlyRate: Object.prototype.hasOwnProperty.call(patch, 'hourlyRate') ? normalizeRate(patch.hourlyRate) : state.hourlyRate,
    updatedAt: Date.now()
  };
  writeLocalState(nextState);
  return nextState;
}

function loadRecords() {
  return getLocalState().records;
}

function saveRecords(records) {
  const nextState = buildTouchedState({ records: records || [] });
  return pushStateToCloud(nextState);
}

function loadHourlyRate() {
  return getLocalState().hourlyRate;
}

function saveHourlyRate(rate) {
  const nextState = buildTouchedState({ hourlyRate: rate });
  return pushStateToCloud(nextState);
}

function loadSettings() {
  return getLocalState().settings;
}

function saveSettings(settings) {
  const nextState = buildTouchedState({ settings: settings || DEFAULT_SETTINGS });
  return pushStateToCloud(nextState);
}

module.exports = {
  syncUserData,
  loadRecords,
  saveRecords,
  loadHourlyRate,
  saveHourlyRate,
  loadSettings,
  saveSettings
};