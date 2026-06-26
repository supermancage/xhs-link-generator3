# 小红书投放工具箱

小红书广告投放工具集，支持投放链接生成与广告计划命名。自动输出 **DP 链接（Deeplink）**、**Universal Link**、**兜底链接**、**监测链接** 以及 **广告计划命名**。

## 在线地址

🔗 [https://supermancage.github.io/xhs-link-generator3/](https://supermancage.github.io/xhs-link-generator3/)

---

## 功能说明

### 单个生成
1. 填写 **投放链接**、**Refid**（必填）和 **笔记 ID**（选填）
2. 填写广告计划命名字段（素材类型、业务线、内容类型、酒店城市/目的地、投放活动、定向等）
3. 点击「生成链接」
4. 一键生成 **广告计划命名** 和四种投放链接（DP链接、Universal Link、兜底链接、监测链接）
5. 可逐条复制，酒店名称仅「非标种草」时必填

### 批量生成
1. 下载 CSV 模板，按格式填写 `笔记ID,投放链接,refid,素材类型,业务线,内容类型,酒店城市,酒店名称,投放活动,定向`
2. 兼容旧格式（仅 3 列：`笔记ID,投放链接,refid`），旧格式命名字段留空
3. 上传文件（支持 `.csv` / `.txt`，也可空格分隔 `笔记ID 投放链接 refid`）
4. 点击「批量生成」，支持逐行容错（错误行跳过并提示，正常行照常生成）
5. 批量输出含广告计划命名和四种链接的完整 CSV
6. 可复制全部结果或下载为 CSV 文件

---

## 文件结构

```
xhs-link-generator3/
├── index.html          # 页面骨架
├── css/
│   └── style.css       # 全部样式
├── js/
│   ├── config.js       # 链接配置与占位符
│   ├── generator.js    # 链接生成核心逻辑
│   ├── naming.js       # 广告计划命名模块
│   └── ui.js           # 界面交互、Toast、loading
└── README.md
```

---

## 技术栈

- **纯 HTML / CSS / JavaScript**，无任何第三方依赖
- 部署于 GitHub Pages，开箱即用
