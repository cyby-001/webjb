const CLOUD_PATH_PREFIX = 'records';

function _cloudAvailable() {
  return !!(wx.cloud && typeof wx.cloud.uploadFile === 'function');
}

function _cloudPath(prefix, suffix, ext) {
  const ts = Date.now();
  const extension = ext ? `.${ext}` : '';
  return `${CLOUD_PATH_PREFIX}/${prefix}_${ts}_${suffix}${extension}`;
}

/** Upload a single image to cloud storage, returns cloud file ID */
function uploadImage(localPath) {
  if (!_cloudAvailable() || !localPath) return Promise.resolve('');
  return new Promise((resolve) => {
    wx.cloud.uploadFile({
      cloudPath: _cloudPath('img', Math.random().toString(36).slice(2, 8)),
      filePath: localPath,
      success(res) { resolve(res.fileID || ''); },
      fail(err) { console.warn('[uploadImage failed]', err); resolve(''); }
    });
  });
}

/** Upload a voice file to cloud storage, returns cloud file ID */
function uploadVoice(localPath) {
  if (!_cloudAvailable() || !localPath) return Promise.resolve('');
  return new Promise((resolve) => {
    wx.cloud.uploadFile({
      cloudPath: _cloudPath('voice', Math.random().toString(36).slice(2, 8), 'aac'),
      filePath: localPath,
      success(res) { resolve(res.fileID || ''); },
      fail(err) { console.warn('[uploadVoice failed]', err); resolve(''); }
    });
  });
}

/** Convert cloud file IDs to temp display URLs (for images) */
function getTempUrls(fileIDs) {
  if (!_cloudAvailable() || !Array.isArray(fileIDs)) return Promise.resolve([]);
  const valid = fileIDs.filter((id) => typeof id === 'string' && id.startsWith('cloud://'));
  if (!valid.length) return Promise.resolve(fileIDs.map(() => ''));

  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: valid,
      success(res) {
        const map = {};
        (res.fileList || []).forEach((item) => {
          if (item.tempFileURL) map[item.fileID] = item.tempFileURL;
        });
        resolve(fileIDs.map((id) => map[id] || ''));
      },
      fail(err) {
        console.warn('[getTempFileURL failed]', err);
        resolve(fileIDs.map(() => ''));
      }
    });
  });
}

/** Download a cloud voice file to local temp path for playback */
function downloadCloudFile(fileID) {
  if (!_cloudAvailable() || !fileID) return Promise.resolve('');
  return new Promise((resolve) => {
    wx.cloud.downloadFile({
      fileID,
      success(res) { resolve(res.tempFilePath || ''); },
      fail(err) { console.warn('[downloadFile failed]', err); resolve(''); }
    });
  });
}

/** Resolve a record's cloud IDs to displayable URLs */
async function resolveRecordMedia(record) {
  if (!record) return record;

  if (record.images && record.images.length) {
    const needResolve = !record._resolvedUrls
      || !record._resolvedUrls.length
      || record._resolvedUrls.some((u) => !u)
      || (record._resolvedAt && Date.now() - record._resolvedAt > 5400000);

    if (needResolve || !record._resolvedAt) {
      // Download each image to a local path (avoids temp URL 403 issues)
      const localPaths = [];
      for (const cloudId of record.images) {
        const path = cloudId ? await downloadCloudFile(cloudId) : '';
        localPaths.push(path);
      }
      record._resolvedUrls = localPaths;
      record._resolvedAt = Date.now();
    }
  }

  if (record.voiceId && !record._voiceLocalPath) {
    record._voiceLocalPath = await downloadCloudFile(record.voiceId);
  }

  return record;
}

/** Delete cloud files by their IDs */
function deleteCloudFiles(fileIDs) {
  if (!_cloudAvailable() || !Array.isArray(fileIDs)) return Promise.resolve();
  const valid = fileIDs.filter((id) => typeof id === 'string' && id.startsWith('cloud://'));
  if (!valid.length) return Promise.resolve();
  return new Promise((resolve) => {
    wx.cloud.deleteFile({
      fileList: valid,
      success() { resolve(); },
      fail(err) { console.warn('[deleteFile failed]', err); resolve(); }
    });
  });
}

module.exports = {
  uploadImage,
  uploadVoice,
  getTempUrls,
  downloadCloudFile,
  resolveRecordMedia,
  deleteCloudFiles
};
