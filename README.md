# 表格筛选器

导入 Excel / CSV，按列设置筛选条件，导出结果。已针对 TikTok 素材投放报表做数值换算与「最低支持条件」预设。

## 启动

双击 `open.bat`，或：

```bash
npm install
npm run dev
```

本地地址：http://127.0.0.1:5021/

## 素材报表能力

导入含以下字段的表后，会自动识别并换算：

| 字段 | 处理 |
|---|---|
| ROI / 成本 / 总收入 | 字符串数字 → number |
| Product ad click rate 等 | 小数比率 0.03 → 按 **3%** 比较与展示 |
| Time posted | 派生 **素材天数**（相对今天） |
| `-` / `N/A` | 视为空值 |

一键预设「最低支持条件」（组内且、组间或）：

1. ROI &lt; 2 且订单数 = 1  
2. 成本 &gt; 8 且订单数 = 0  
3. 素材天数 &gt; 5 且成本 &gt; 5 且订单数 = 0  
4. 素材天数 &gt; 2 且成本 &gt; 3 且订单数 = 0 且曝光 &lt; 300 且点击率 &lt; 3%

## 在线地址（GitHub Pages）

推送到 `main` 后自动构建发布：

https://xiongbubuyu12-cyber.github.io/table-filter/

本地改代码 → `git push` → 约 1～2 分钟生效。

## 发布给同事（推荐）

本工具已配置 **GitHub Actions → Pages** 自动发布，一般不用再手动上传 `dist`。

备选：Cloudflare Pages / Vercel / 公司内网静态服务器（拷贝 `dist`）。

注意：筛选模板存在每人浏览器 localStorage，不会通过链接自动同步；内置「最低支持条件」人人可用。
