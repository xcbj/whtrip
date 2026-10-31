# 武汉四天三晚攻略站

手机版行程站：按天切换、路线动图（可全屏 + 双指放大）、吃住速查、离线可用（Service Worker 预缓存）。
线上：https://xcbj.github.io/whtrip/

## 怎么更新内容

在本地 `backup/` 目录：

```bash
./tools/deploy.sh          # 解析 md → 生成 data.js → 自动重算 sw.js 版本 → 提交 → 推送
```

改了行程行数导致报「行数不符」时用 `./tools/deploy.sh --accept`。

## 目录说明

- `data.js` —— 全站内容，由 `武汉最终版攻略-2026年11月12-15日.md` 自动生成，不要手改
- `app.js` / `styles.css` / `index.html` —— 交互、样式、页面壳
- `sw.js` —— 离线缓存；`VERSION` 由脚本自动维护，手工改也行（改了才会让手机换新缓存）
- `assets/` —— 路线动图 mp4 与封面（原始 GIF 在 `assets/gif`，供「保存原动图」按钮用）
