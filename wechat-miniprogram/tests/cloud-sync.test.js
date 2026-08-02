const assert = require('assert');
const storage = require('../utils/storage');

const store = {};
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  cloud: null
};

(async () => {
  // 默认开启：云不可用（cloud:null）时同步返回 cloud-unavailable，记录仍落本地
  const res1 = await storage.saveRecords([{ id: '1', date: '2026-08-02' }]);
  assert.strictEqual(res1.cloudSynced, false);
  assert.strictEqual(res1.reason, 'cloud-unavailable');
  assert.strictEqual(store['ot_records'].length, 1);

  // 关闭开关：不碰云端，本地照常保存
  store['ot_cloud_sync_enabled'] = false;
  const res2 = await storage.saveRecords([{ id: '2', date: '2026-08-03' }]);
  assert.strictEqual(res2.cloudSynced, false);
  assert.strictEqual(res2.reason, 'cloud-disabled');
  assert.strictEqual(store['ot_records'][0].id, '2');

  // 关闭后 syncUserData 直接返回本地状态，不触发云端读取
  const state = await storage.syncUserData();
  assert.strictEqual(state.records.length, 1);

  console.log('cloud sync toggle tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
