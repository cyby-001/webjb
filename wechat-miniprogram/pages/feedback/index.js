Page({
  copyIssueTemplate() {
    wx.setClipboardData({
      data: '问题类型：\n问题描述：\n复现步骤：\n期望结果：\n设备型号：\n微信版本：\n截图说明：',
      success: () => {
        wx.showToast({ title: '问题反馈模板已复制', icon: 'success' });
      }
    });
  },

  copyFeatureTemplate() {
    wx.setClipboardData({
      data: '想要的功能：\n使用场景：\n希望怎么操作：\n为什么这个功能有帮助：\n补充说明：',
      success: () => {
        wx.showToast({ title: '功能建议模板已复制', icon: 'success' });
      }
    });
  }
});