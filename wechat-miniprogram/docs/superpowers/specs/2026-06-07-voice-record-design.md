# 语音记录功能设计

## 概述
在加班/请假记录中增加语音录入功能，每条记录最多一段语音。语音文件仅存本地，不参与云端同步（与图片 localImages 策略一致）。

## 数据模型

每条记录新增两个字段：
- `voicePath: string` — 录音文件本地路径，空字符串表示无语音
- `voiceDuration: number` — 录音时长（秒），0 表示无语音

## UI 布局

### 编辑面板
语音气泡与图片项共用同一行，位于最右侧：
- 无语音时：显示麦克风图标按钮（与 +图片 并列）
- 有语音时：显示语音气泡（时长 + 播放按钮），可点击播放

### 日历页卡片（selected-detail-card）
- 在备注下方、图片行上方显示语音气泡
- 气泡显示时长，点击可播放

## 交互流程

1. 点击录制按钮 → 开始录音（按钮状态变化提示录音中）
2. 再次点击 → 停止录音，生成语音气泡
3. 点击语音气泡 → 播放/暂停
4. 播放中显示波纹动画（3 条竖线依次缩放）
5. 可删除已有语音，重新录制

## 技术实现

- 录音：`wx.getRecorderManager()` — 格式 aac
- 播放：`wx.createInnerAudioContext()`
- 动画：CSS `@keyframes` 三条竖线依次跳动
- 存储：voicePath + voiceDuration 跟随 record 存储
- 云端同步：`cloneRecords({ includeLocalImages: false })` 时同时过滤 voice 字段

## 文件改动

| 文件 | 改动 |
|---|---|
| `utils/storage.js` | cloneRecords 过滤 voice 字段（云端模式） |
| `pages/calendar/index.js` | 录音管理、播放控制逻辑 |
| `pages/calendar/index.wxml` | 编辑面板 + 卡片语音 UI |
| `pages/calendar/index.wxss` | 气泡样式 + 播放动画 |
