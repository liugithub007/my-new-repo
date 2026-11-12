# 拾词 · 科学背单词

每天一点，不欠单词债。安卓 App + 网页版，同一个账号进度自动同步。

- **网页版**：https://liugithub007.github.io/my-new-repo/
- **安卓 App**：在 [Releases](https://github.com/liugithub007/my-new-repo/releases/latest) 下载最新的 `Shici-x.y.z.apk`，覆盖安装不丢进度

## 主要功能

- **8 本词书**：中考、高考、四级、六级、考研、雅思、托福、GRE。每本先学本级新增的词（按词频），和低一级重叠的基础词放最后；同一个词在不同词书里只学一次。
- **不欠单词债的计划**：设定每天的分钟数，按你的答题速度算出每天能完成多少张卡、长期可持续学多少新词。复习多的日子自动少给新词，积压时暂停新词并把复习分摊到后几天。
- **FSRS 记忆算法**：在快要忘的时候安排复习；复习日期在允许范围内错开，避免某一天扎堆。
- **熟词直接跳过**：词汇量测试（含编造词防瞎点）、新词先问“认识吗”、熟词快筛。
- **记忆法**：构词拆解（前缀/后缀 + 词根）、谐音、联想，以及自己写的记忆点；顽固词会提示。
- **推文**：故事和长文，全文每个词、词组都能点读，看释义、听发音、看整句翻译，学过的词会高亮。
- **账号同步**：用户名 + 密码登录，手机和电脑合并进度（同一个词以最近一次复习为准）。
- 拼写练习、听音模式、深色模式、每日提醒（App）、学习统计、导出导入备份。

## 目录

| 位置 | 内容 |
| --- | --- |
| `web/` | 网页版全部代码和数据（App 构建时会复制进 APK） |
| `web/js/fsrs.js` | FSRS-5 调度 + 负载均衡 |
| `web/js/planner.js` | 每日计划：时间预算、可持续新词速度、积压处理 |
| `web/data/dict.json` | 由 ECDICT 生成的词典与词书标签（`tools/build_dict.py`） |
| `web/data/content.json` | 手写的记忆法、例句、故事、文章 |
| `app/` | 安卓外壳（WebView + 朗读、备份、提醒） |
| `tools/simulate.mjs` | 180 天学习模拟，用来检验复习量是否可控 |

## 发布新版本

1. 改 `version.properties` 里的 `versionCode`（加 1）和 `versionName`，以及 `web/js/app.js` 的 `APP_VERSION`、`web/sw.js` 的缓存名。
2. 推送到 `main`：GitHub Actions 自动打包签名 APK 发布到 Releases，同时更新网页版。
3. App 会自动检查 Releases 上的新版本并提示更新。

签名密钥保存在仓库 Secrets（`SHICI_KEYSTORE_BASE64`、`SHICI_KEYSTORE_PASSWORD`），每次必须用同一个密钥，否则手机无法覆盖安装。

## 开源许可

词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT），见 `web/data/ECDICT-LICENSE.txt`。
