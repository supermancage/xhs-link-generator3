# 小红书投放链接生成器

小红书广告投放链接生成工具，支持单个和批量生成投放链接，自动输出 **DP 链接（Deeplink）**、**Universal Link**、**兜底链接** 和 **监测链接**。

## 在线地址

🔗 [https://supermancage.github.io/xhs-link-generator3/](https://supermancage.github.io/xhs-link-generator3/)

---

## 功能说明

### 单个生成
1. 填写 **投放链接**、**Refid**（必填）和 **笔记 ID**（选填）
2. 点击「生成链接」
3. 自动生成四种链接，可逐条复制

### 批量生成
1. 下载 CSV 模板，按格式填写 `笔记ID,投放链接,refid`
2. 上传文件（支持 `.csv` / `.txt`）
3. 点击「批量生成」，支持逐行容错（错误行跳过并提示，正常行照常生成）
4. 可复制全部结果或下载为 CSV 文件

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
│   └── ui.js           # 界面交互、Toast、loading
└── README.md
```

---

## 技术栈

- **纯 HTML / CSS / JavaScript**，无任何第三方依赖
- 部署于 GitHub Pages，开箱即用
