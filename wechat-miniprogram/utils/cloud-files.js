const CLOUD_PATH_PREFIX = 'records';

function _cloudAvailable() {
  return !!(wx.cloud && typeof wx.cloud.uploadFile === 'function');
}

function _cloudPath(prefix, suffix, ext) {
  const ts = Date.now();
  const extension = ext ? `.${ext}` : '';
  return `${CLOUD_PATH_PREFIX}/${prefix}_${ts}_${suffix}${extension}`;
}

/** Upload a file to cloud storage, returns cloud file ID. kind: 'img' | 'voice' */
function uploadFile(localPath, kind) {
  if (!_cloudAvailable() || !localPath) return Promise.resolve('');
  return new Promise((resolve) => {
    wx.cloud.uploadFile({
      cloudPath: _cloudPath(kind || 'img', Math.random().toString(36).slice(2, 8), kind === 'voice' ? 'aac' : ''),
      filePath: localPath,
      success(res) { resolve(res.fileID || ''); },
      fail(err) { console.warn('[uploadFile failed]', err); resolve(''); }
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
  uploadFile,
  downloadCloudFile,
  resolveRecordMedia,
  deleteCloudFiles
};
