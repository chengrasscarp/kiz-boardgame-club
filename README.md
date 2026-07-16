# 🎲 KIZ桌游协会官网

KIZ 桌游协会的官方网站，用于展示协会的**游戏库**、**活动记录**、**成员墙**与**排行榜**。纯静态站点，无需后端，数据由一次性的 Python 脚本从 BGStats 导出文件生成。

> 骰子一掷，友谊长存。

## ✨ 功能与页面

| 页面 | 文件 | 说明 |
| --- | --- | --- |
| 首页 | `index.html` | 协会简介、核心数据概览、热门游戏、最近活动 |
| 游戏库 | `games.html` | 协会全部桌游清单与检索 |
| 活动记录 | `plays.html` | 历次线下对局记录 |
| 成员墙 | `members.html` | 参与活动的研究生成员 |
| 排行榜 | `leaderboard.html` | 游玩次数 / 胜率等排行 |
| 关于我们 | `about.html` | 协会介绍与加入方式 |

## 📁 目录结构

```
kiz-boardgame-club/
├── index.html             # 首页
├── about.html             # 关于我们
├── games.html             # 游戏库
├── leaderboard.html       # 排行榜
├── members.html           # 成员墙
├── plays.html             # 活动记录
├── generate_data.py       # 数据生成脚本（读取 BGStats 导出）
├── collection.csv         # 游戏收藏原始数据
├── css/
│   └── style.css          # 样式
├── js/
│   ├── data.js            # 自动生成的数据（请勿手改）
│   └── main.js            # 前端渲染逻辑
├── img/                   # 图片资源
└── .gitignore
```

## 🛠 技术栈

- 原生 HTML / CSS / JavaScript（无构建步骤、无框架）
- Python 3（仅用于生成 `js/data.js`）

## 💻 本地预览

任意静态服务器即可，例如：

```bash
# 在项目根目录执行
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

也可直接双击 `index.html` 打开（部分浏览器对本地 `file://` 加载脚本有限制，推荐用上面的本地服务器）。

## 🔄 更新数据

网站数据来自 [`BGStats`](https://bgstats.app/) 的导出文件，**该文件包含私人信息，已被 `.gitignore` 忽略，不会进入仓库**。

数据生成流程：

```
BGStatsExport.json  ──(generate_data.py)──▶  js/data.js  ──▶  js/main.js 渲染
```

1. 从 BGStats 导出 `BGStatsExport.json`，放到项目根目录（与 `generate_data.py` 同级）。
2. 运行脚本重新生成数据：

   ```bash
   python generate_data.py
   ```

   脚本会按以下规则筛选数据：
   - 仅保留「茨坝人才公寓405」与「茨坝104」两个地点的对局；
   - 仅保留带有「研究生」标签的玩家；
   - 仅保留上述对局中实际出现过的游戏。

3. `js/data.js` 会被自动覆盖（文件头标注 `DO NOT EDIT`，请勿手动修改）。
4. 提交并更新 `js/data.js` 即可（私人导出文件本身不会被提交）。

> ⚠️ 注意：`js/data.js` 由脚本生成并纳入版本控制；`BGStatsExport.json` 为私人数据，请勿提交。

## 🚀 部署

纯静态站点，可直接托管到任意静态空间（GitHub Pages、Vercel、Netlify、对象存储等）。
若使用 GitHub Pages：在仓库 **Settings → Pages** 中选择 `main` 分支根目录作为发布源即可。

## 🤝 贡献

欢迎协会成员提交改进！一般流程：

1. Fork 或克隆本仓库；
2. 本地修改网页 / 样式；
3. 如需更新数据，按上方「更新数据」步骤重新生成 `js/data.js`；
4. 提交并推送。

## 📄 许可证

本项目基于 [MIT 许可证](./LICENSE) 开源。
