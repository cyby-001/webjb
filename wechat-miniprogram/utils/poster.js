// 成就分享海报：离屏 canvas 绘制 → 写入本地文件 → 系统分享面板（转发/保存/朋友圈）
// 每个分类一套主题（渐变底 + 专属装饰），装饰位置由成就 id 做种子，同一成就每次画出相同图案

const W = 600;
const H = 900;

const THEMES = {
  '初次经历': { from: '#e9f8ee', to: '#c9ecd4', accent: '#3ba776', ink: '#5f7a6a', decor: 'sparkles' },
  '单次加班': { from: '#eef1ff', to: '#dde3ff', accent: '#5b6cf0', ink: '#6a6f8f', decor: 'ripple' },
  '深夜经历': { from: '#243567', to: '#101838', accent: '#8fa7ff', ink: '#aab8e8', dark: true, decor: 'night' },
  '周末': { from: '#fff3e0', to: '#ffe2c0', accent: '#f5923e', ink: '#a06b3a', decor: 'rays' },
  '节假日': { from: '#fff1f0', to: '#ffd9d5', accent: '#e5533f', ink: '#a15a50', decor: 'ribbon' },
  '连续加班': { from: '#422222', to: '#201010', accent: '#ff8a5c', ink: '#e8b39e', dark: true, decor: 'heat' },
  '累计加班': { from: '#2d2355', to: '#161133', accent: '#a78bfa', ink: '#b3a6e8', dark: true, decor: 'orbit' },
  '请假经历': { from: '#e6f7f5', to: '#c9edea', accent: '#2fa8a0', ink: '#5b8f8a', decor: 'leaf' },
  '平衡记录': { from: '#eafaf6', to: '#cff1e9', accent: '#31b58f', ink: '#5d8f80', decor: 'dots' }
};

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function hashStr(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// 确定性伪随机：同一成就的海报装饰每次一致
function seededRand(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fourStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.38;
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// 各分类专属装饰（画在渐变底之上、内容卡之下，低透明度）
const DECORS = {
  sparkles(ctx, accent, rand) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 10; i += 1) {
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, 2 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 6; i += 1) fourStar(ctx, rand() * W, rand() * H, 8 + rand() * 12);
    ctx.globalAlpha = 1;
  },
  night(ctx, accent, rand) {
    // 月牙
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(120, 130, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = THEMES['深夜经历'].to;
    ctx.beginPath();
    ctx.arc(142, 112, 42, 0, Math.PI * 2);
    ctx.fill();
    // 星星
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i += 1) {
      ctx.globalAlpha = 0.25 + rand() * 0.6;
      const r = 1.5 + rand() * 3;
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    fourStar(ctx, 480, 170, 12);
    fourStar(ctx, 400, 90, 8);
    ctx.globalAlpha = 1;
  },
  ripple(ctx, accent) {
    ctx.strokeStyle = accent;
    for (let i = 1; i <= 7; i += 1) {
      ctx.globalAlpha = 0.22 - i * 0.025;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, H + 120, 90 * i, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  rays(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    for (let i = 0; i < 12; i += 1) {
      ctx.globalAlpha = i % 2 ? 0.1 : 0.06;
      const a = Math.PI * (0.15 + (i / 11) * 0.7);
      ctx.beginPath();
      ctx.moveTo(W / 2, -80);
      ctx.lineTo(W / 2 + Math.cos(a) * 1200, -80 + Math.sin(a) * 1200);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  ribbon(ctx, accent, rand) {
    const colors = [accent, '#f5b53f', '#ffffff'];
    for (let i = 0; i < 20; i += 1) {
      ctx.save();
      ctx.translate(rand() * W, rand() * H);
      ctx.rotate(rand() * Math.PI);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(-5, -14, 10, 28);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
  heat(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    for (let row = 0; row < 6; row += 1) {
      ctx.globalAlpha = 0.14;
      const baseY = 160 + row * 120;
      ctx.beginPath();
      ctx.moveTo(-20, baseY);
      for (let x = 0; x <= W + 40; x += 60) {
        ctx.quadraticCurveTo(x + 30, baseY + (row % 2 ? -22 : 22), x + 60, baseY);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  orbit(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.ellipse(W / 2, 400, 260 + i * 90, 130 + i * 70, -0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.6;
    [[110, 300], [520, 480], [200, 700], [470, 640]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  },
  leaf(ctx, accent, rand) {
    ctx.fillStyle = accent;
    for (let i = 0; i < 14; i += 1) {
      ctx.save();
      ctx.translate(rand() * W, rand() * H);
      ctx.rotate(rand() * Math.PI);
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
  dots(ctx, accent) {
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.16;
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        ctx.beginPath();
        ctx.arc(40 + col * 58, 100 + row * 118, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
};

function drawPoster(item) {
  // 全程 try/catch：canvas 不可用等同步异常不能炸掉调用方（否则按钮会永久"没反应"）
  return new Promise((resolve, reject) => {
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H });
      const ctx = canvas.getContext('2d');
      ctx.textAlign = 'center';

      // canvas 字体不识别变体选择符/组合序列（会画出方框），只保留基础字形
      const emoji = String(item.emoji).replace(/️/g, '').split('‍')[0];
      const theme = THEMES[item.category] || THEMES['单次加班'];
      const rand = seededRand(hashStr(item.id));

      /* --- 背景：分类渐变 + 专属装饰 --- */
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, theme.from);
      bg.addColorStop(1, theme.to);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      (DECORS[theme.decor] || DECORS.sparkles)(ctx, theme.accent, rand);

      // 顶部品牌行
      ctx.fillStyle = theme.ink;
      ctx.font = '26px sans-serif';
      ctx.fillText('加班记录助手 · 成就解锁', W / 2, 88);

      /* --- 中央内容卡 --- */
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      roundedRect(ctx, 48, 140, W - 96, 540, 36);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      roundedRect(ctx, 48, 140, W - 96, 540, 36);
      ctx.stroke();

      /* --- 徽章：光环圆环 + emoji --- */
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(W / 2, 285, 104, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(W / 2, 285, 92, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.font = '110px sans-serif';
      ctx.fillText(emoji, W / 2, 325);

      /* --- 分类胶囊标签 --- */
      ctx.font = '24px sans-serif';
      const pillW = ctx.measureText(item.category).width + 56;
      ctx.fillStyle = theme.accent;
      roundedRect(ctx, W / 2 - pillW / 2, 408, pillW, 46, 23);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.category, W / 2, 440);

      /* --- 成就名：金色渐变字 --- */
      ctx.font = 'bold 52px sans-serif';
      const nameW = ctx.measureText(item.name).width;
      const gold = ctx.createLinearGradient(W / 2 - nameW / 2, 0, W / 2 + nameW / 2, 0);
      gold.addColorStop(0, '#d9a621');
      gold.addColorStop(0.5, '#b8860b');
      gold.addColorStop(1, '#8a6410');
      ctx.fillStyle = gold;
      ctx.fillText(item.name, W / 2, 528);

      /* --- 记录文案（最多 3 行，超出省略） --- */
      ctx.fillStyle = '#30343d';
      ctx.font = '28px sans-serif';
      const quoteLines = wrapText(ctx, `「${item.quote}」`, 400).slice(0, 3);
      if (wrapText(ctx, `「${item.quote}」`, 400).length > 3) {
        quoteLines[2] = `${quoteLines[2].slice(0, -1)}…」`;
      }
      let quoteY = 586;
      quoteLines.forEach((line) => {
        ctx.fillText(line, W / 2, quoteY);
        quoteY += 44;
      });

      /* --- 卡外：达成条件 / 解锁日期 / 页脚 --- */
      ctx.fillStyle = theme.ink;
      ctx.font = '25px sans-serif';
      ctx.fillText(item.desc, W / 2, 730);
      ctx.font = '24px sans-serif';
      ctx.globalAlpha = 0.85;
      ctx.fillText(`解锁于 ${item.time}`, W / 2, 768);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = theme.ink;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 150, 812);
      ctx.lineTo(W / 2 + 150, 812);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = '24px sans-serif';
      ctx.fillText('—— 记录每一天的坚持 ——', W / 2, 852);

      const dataURL = canvas.toDataURL('image/png');
      const filePath = `${wx.env.USER_DATA_PATH}/achievement_${item.id}.png`;
      wx.getFileSystemManager().writeFile({
        filePath,
        data: dataURL.replace(/^data:image\/\w+;base64,/, ''),
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: reject
      });
    } catch (e) {
      reject(e);
    }
  });
}

// 保存到相册（含权限引导）；权限被明确拒绝时静默结束（引导弹窗已展示），拒绝弹窗后交给页面提示
function saveToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    const doSave = () => wx.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(filePath),
      fail: reject
    });
    wx.getSetting({
      success: (res) => {
        const granted = res.authSetting['scope.writePhotosAlbum'];
        if (granted === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存海报需要「添加到相册」权限，请在设置中开启',
            confirmText: '去设置',
            success: (r) => {
              if (!r.confirm) return reject({ errMsg: 'poster:cancel' });
              wx.openSetting({
                success: (s) => {
                  if (s.authSetting['scope.writePhotosAlbum']) doSave();
                  else reject({ errMsg: 'poster:cancel' });
                },
                fail: () => reject({ errMsg: 'poster:cancel' })
              });
            }
          });
        } else if (granted) {
          doSave();
        } else {
          // 首次：拉起系统授权弹窗；拒绝则交给页面提示
          wx.authorize({
            scope: 'scope.writePhotosAlbum',
            success: doSave,
            fail: () => reject({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' })
          });
        }
      },
      fail: doSave
    });
  });
}

function showPosterMenu(filePath) {
  return new Promise((resolve, reject) => {
    if (wx.showShareImageMenu) {
      // 系统图片分享面板：转发朋友 / 保存图片 / 分享朋友圈（需基础库支持）
      wx.showShareImageMenu({
        path: filePath,
        menus: ['shareAppMessage', 'shareTimeline'],
        success: () => resolve(filePath),
        fail: (err) => {
          if (/cancel/i.test((err && err.errMsg) || '')) return reject(err);
          // 面板不可用（低版本基础库/开发者工具）→ 退回保存相册
          saveToAlbum(filePath).then(resolve).catch(reject);
        }
      });
    } else {
      saveToAlbum(filePath).then(resolve).catch(reject);
    }
  });
}

module.exports = { wrapText, drawPoster, showPosterMenu };
