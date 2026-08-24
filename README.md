# 小红书投放工具箱

小红书投放相关工具的统一入口壳页面（纯前端静态应用，无构建、无后端）。

## 目录结构

```
xhs-toolbox/
├── index.html            # 整合壳页面（hash 路由 + iframe）
├── css/style.css         # 壳页面样式
├── README.md             # 本说明
├── keyword-classifier/   # 关键词智能分类工具（智词引擎，原样复制）
├── xhs-link-generator3/  # 小红书投放链接生成器（原样复制）
└── rebate-monitor/       # 返货余额监控仪表盘（原样复制）
```

> 三个工具为相互独立的静态应用（各自含同名全局函数，如 `switchTab`/`ui.js`），
> 通过 iframe 隔离加载，互不干扰；内部源码均未做任何修改，仅整目录复制。

## 快速开始

```bash
cd xhs-toolbox
python3 -m http.server 8080
```

浏览器打开 <http://localhost:8080>（默认加载「关键词分类」）。
也可使用 `npx serve .` 等其他任意静态服务器。

## 使用说明

- 顶部导航切换三个工具：关键词分类 / 链接生成 / 返货监控。
- 地址栏 hash 路由：`#classifier` / `#generator` / `#rebate`，默认 `#classifier`；
  刷新页面后保持上次选中的工具；支持浏览器前进/后退。
- 内容区 iframe 填满剩余视口，工具内部自行滚动。

## 三个工具简介

| Tab | 目录 | 说明 |
| --- | --- | --- |
| 🔍 关键词分类 | `keyword-classifier/` | 智词引擎：粘贴/上传关键词，自动分类（L1/L2）、图表与交叉分析、词云、导出 CSV |
| 🔗 链接生成 | `xhs-link-generator3/` | 单个/批量生成小红书投放链接与广告计划命名，支持 Excel 模板与二维码 |
| 📊 返货监控 | `rebate-monitor/` | 返货余额监控仪表盘：内置 202 个账户数据，可支撑天数分布、资金调拨概览、导出 CSV |

## 备注

- 部分功能依赖 CDN（xlsx / chart.js / wordcloud / qrcode-generator 等），需联网加载。
- 返货监控内置数据位于 `rebate-monitor/account_data.json`，也可在页面上传新报表。
