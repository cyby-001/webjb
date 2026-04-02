function writeTempFile(fileName, content) {
  return new Promise((resolve, reject) => {
    const path = `${wx.env.USER_DATA_PATH}/${fileName}`;
    wx.getFileSystemManager().writeFile({
      filePath: path,
      data: content,
      encoding: 'utf8',
      success: () => resolve(path),
      fail: reject
    });
  });
}

function getFileName(filePath) {
  const parts = String(filePath || '').split('/');
  return parts[parts.length - 1] || 'export.txt';
}

function shareFileToChat(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx.shareFileMessage !== 'function') {
      reject(new Error('share-not-supported'));
      return;
    }

    wx.shareFileMessage({
      filePath,
      fileName: getFileName(filePath),
      success: resolve,
      fail: reject
    });
  });
}

function getPlatform() {
  try {
    const info = wx.getSystemInfoSync();
    return info.platform || '';
  } catch (error) {
    return '';
  }
}

function isMobileWechat() {
  const platform = getPlatform();
  return platform === 'android' || platform === 'ios';
}

function getMenuOptions(kind) {
  const mobile = isMobileWechat();

  if (mobile) {
    return [{ key: 'share', label: '\u8f6c\u53d1\u5230\u804a\u5929' }];
  }

  if (kind === 'csv') {
    return [{ key: 'path', label: '\u67e5\u770b\u6587\u4ef6\u8def\u5f84' }];
  }

  return [{ key: 'path', label: '\u67e5\u770b\u6587\u4ef6\u8def\u5f84' }];
}

function showFileError(error) {
  let title = '\u6587\u4ef6\u5904\u7406\u5931\u8d25';
  if (error && error.message === 'share-not-supported') {
    title = '\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u6587\u4ef6\u8f6c\u53d1';
  } else if (error && error.errMsg) {
    title = error.errMsg.length > 20 ? error.errMsg.slice(0, 20) : error.errMsg;
  }
  wx.showToast({ title, icon: 'none' });
}

function showFilePath(filePath, successText) {
  wx.showModal({
    title: '\u6587\u4ef6\u5df2\u751f\u6210',
    content: `${successText}\n\u5f53\u524d\u6587\u4ef6\u8def\u5f84\uff1a${filePath}`,
    showCancel: false
  });
}

function handleGeneratedFile(filePath, options) {
  const kind = options.kind;
  const successText = options.successText;
  const menuOptions = getMenuOptions(kind);
  const itemList = menuOptions.map((item) => item.label);

  wx.showActionSheet({
    itemList,
    success: (res) => {
      const action = menuOptions[res.tapIndex];
      if (!action) return;

      if (action.key === 'share') {
        shareFileToChat(filePath)
          .then(() => {
            wx.showToast({ title: '\u8bf7\u5728\u804a\u5929\u4e2d\u53d1\u9001\u6587\u4ef6', icon: 'none' });
          })
          .catch(showFileError);
        return;
      }

      showFilePath(filePath, successText);
    }
  });
}

function exportRecordsToCSV(records) {
  const escapeCSV = (value) => {
    const text = String(value == null ? '' : value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = [
    ['\u65e5\u671f', '\u5206\u7c7b', '\u7c7b\u578b', '\u5f00\u59cb\u65f6\u95f4', '\u7ed3\u675f\u65f6\u95f4', '\u65f6\u957f(\u5c0f\u65f6)', '\u5907\u6ce8'].map(escapeCSV).join(',')
  ];

  (records || []).forEach((record) => {
    lines.push([
      record.date,
      record.category,
      record.type,
      record.startTime,
      record.endTime,
      record.duration,
      record.note || ''
    ].map(escapeCSV).join(','));
  });

  return `\ufeff${lines.join('\n')}`;
}

function chooseAndReadJSON() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) {
          reject(new Error('no-file'));
          return;
        }
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: (result) => {
            try {
              const parsed = JSON.parse(result.data);
              if (!Array.isArray(parsed)) throw new Error('invalid-json');
              resolve(parsed);
            } catch (error) {
              reject(error);
            }
          },
          fail: reject
        });
      },
      fail: reject
    });
  });
}

module.exports = {
  writeTempFile,
  handleGeneratedFile,
  exportRecordsToCSV,
  chooseAndReadJSON
};