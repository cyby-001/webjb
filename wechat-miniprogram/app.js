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