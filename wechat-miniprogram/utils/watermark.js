function fitLongEdge(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function formatStamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * 给图片右下角合成时间水印，返回新图片临时路径。
 * 失败时返回原图（降级：水印失败不阻断记录保存）。大图缩放至最长边 max 以内，避免离屏画布内存溢出。
 */
function applyTimeWatermark(src, max = 1280) {
  if (!wx.createOffscreenCanvas || !wx.canvasToTempFilePath) return Promise.resolve(src);
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success: (info) => {
        const fit = fitLongEdge(info.width, info.height, max);
        const canvas = wx.createOffscreenCanvas({ type: '2d', width: fit.width, height: fit.height });
        const ctx = canvas.getContext('2d');
        const img = canvas.createImage();
        img.onload = () => {
          try {
            ctx.drawImage(img, 0, 0, fit.width, fit.height);
            const fontSize = Math.max(16, Math.round(fit.width / 40));
            const text = formatStamp(new Date());
            const pad = Math.round(fontSize * 0.5);
            ctx.font = `bold ${fontSize}px sans-serif`;
            const textWidth = ctx.measureText(text).width;
            const bx = fit.width - textWidth - pad * 2;
            const by = fit.height - fontSize - pad * 2;
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(bx, by, textWidth + pad * 2, fontSize + pad * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.textBaseline = 'bottom';
            ctx.fillText(text, bx + pad, by + fontSize + pad);
            wx.canvasToTempFilePath({
              canvas,
              success: (res) => resolve(res.tempFilePath || src),
              fail: () => resolve(src)
            });
          } catch (err) {
            console.warn('[watermark failed]', err);
            resolve(src);
          }
        };
        img.onerror = () => resolve(src);
        img.src = info.path;
      },
      fail: () => resolve(src)
    });
  });
}

module.exports = { applyTimeWatermark, fitLongEdge, formatStamp };
