# 旅行攻略（多行程 PWA）

手机版攻略站：首页列出所有行程（进行中 / 即将出发 / 历史行程），点进去按天切换、路线动图（全屏 + 双指放大）、吃住速查，全程离线可用（Service Worker 预缓存）。行程多了首页自带搜索 + 标签筛选；准备页可以一键把整趟排成「打印 / 存 PDF」版。
行程期内打开会自动落在当前那一趟；以后去别的地方，同一套壳子装新内容。
线上：https://xcbj.github.io/whtrip/

## 怎么更新内容

在本地 `backup/` 目录：

```bash
./tools/deploy.sh   # 解析各行程 md → trips/<id>/data.js + trips/index.json → 重算 sw.js 版本 → 提交 → 推送
```

改了行程行数导致报「行数不符」时用 `./tools/deploy.sh --accept`。

加一趟新行程：

```bash
node tools/new_trip.mjs xiamen-2027-03 --city 厦门 --title "厦门 · 四天三晚" --start 2027-03-06 --end 2027-03-09
# 填 trips/xiamen-2027-03/攻略.md → node tools/parse_guide.mjs xiamen-2027-03 → ./tools/deploy.sh
```

## 目录说明

- `index.html` —— 页面壳：顶栏 + 行程列表 + 行程区占位（不含任何一地的内容）
- `shell.js` —— 读 `trips/index.json`，按 URL 决定「首页 / 进某一趟」；进某一趟时才动态载入 `app.js` + `trips/<id>/data.js`
- `app.js` / `styles.css` —— 行程页的交互与样式（各趟共用）
- `trips/` —— 每趟一个目录：`data.js` 由 md 自动生成，别手改；`index.json` 是构建产物（含摘要 / 标签 / 封面 / 媒体清单），首页读它
- `sw.js` —— 离线缓存（核心文件 + 各趟 data.js + 近期媒体）；`VERSION` 由脚本自动维护
- `assets/` —— 路线动图 mp4 与封面（原始 GIF 在 `assets/gif`，供「保存原动图」按钮用；新行程建议放 `assets/<行程id>/`）
