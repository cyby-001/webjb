Page({
  data: {
    versionText: ''
  },

  onLoad() {
    const { miniProgram } = wx.getAccountInfoSync();
    const label = miniProgram.version || (miniProgram.envVersion === 'trial' ? '体验版' : '开发版');
    this.setData({ versionText: `当前版本 ${label}` });
  }
});
