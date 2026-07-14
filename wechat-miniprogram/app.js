App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'new-3gy22v953654f94e',
        traceUser: true
      });
    } else {
      console.warn('[cloud] wx.cloud unavailable');
    }

    const updateManager = wx.getUpdateManager();
    updateManager.onCheckForUpdate(({ hasUpdate }) => {
      if (hasUpdate) {
        wx.showToast({ title: '发现新版本，下载中...', icon: 'none', duration: 2000 });
      }
    });
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已就绪，是否立即重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });
    updateManager.onUpdateFailed(() => {
      wx.showToast({ title: '新版本下载失败', icon: 'none' });
    });

    this.showChangelogIfNew();
  },

  showChangelogIfNew() {
    const CURRENT_VERSION = '1.1.1';
    const storedVersion = wx.getStorageSync('ot_app_version') || '';
    if (storedVersion === CURRENT_VERSION) return;

    wx.setStorageSync('ot_app_version', CURRENT_VERSION);
    wx.showModal({
      title: '',
      content: '点击以使用最新功能',
      showCancel: false,
      confirmText: '知道了'
    });
  },
  onError(err) {
    console.error('[App onError]', err);
  },
  onUnhandledRejection(res) {
    console.error('[App onUnhandledRejection]', res && res.reason ? res.reason : res);
  },
  onPageNotFound(res) {
    console.error('[App onPageNotFound]', res);
  }
});