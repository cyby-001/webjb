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
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '新版本已就绪',
        content: '点击确认重启以使用最新功能',
        showCancel: false,
        confirmText: '立即重启',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });
    updateManager.onUpdateFailed(() => {
      // 静默失败，不影响使用
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