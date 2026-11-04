# 拾词背单词（安卓 App + 电脑网页版）

一个基于记忆科学的背单词工具：FSRS 间隔复习、主题词串、全文点读、单元奖励文章、短文复习。

## 下载安装

到本仓库的 **Releases** 页面下载最新的 `Shici-版本号.apk`，在安卓手机上打开安装（首次需要允许“安装未知来源应用”）。
已经装过旧版的，直接覆盖安装新版，**学习进度会保留**。

`shici-content-版本号.html` 是同一版本的网页文件，在电脑上用 Chrome 打开即可使用。

## 仓库结构

| 位置 | 内容 |
|---|---|
| `app/src/main/assets/www/index.html` | 全部功能和词库（App 和电脑网页版共用这一个文件） |
| `app/src/main/java/com/shici/app/MainActivity.java` | 安卓外壳：运行网页、系统朗读、自动备份、安装更新包 |
| `version.properties` | 版本号。发新版时把 `versionCode` 加 1、改 `versionName` |
| `.github/workflows/build-apk.yml` | 推送到 main 分支后，GitHub 自动打包 APK 并发布到 Releases |

## 学习进度保存在哪里

- App 内部存储（随 App 保留，覆盖安装新版不会丢）。
- 每次答题后自动备份到手机的 `下载/拾词/拾词进度备份.json`（卸载 App 也不会删除）。
- 换手机或重装：在 App「设置 → 从备份恢复」里选这个文件。
- 电脑网页版的进度也能导出成 `.json`，在手机 App 里“从备份恢复”导入。

## 签名密钥（重要）

App 必须一直用**同一把签名密钥**打包，手机才能覆盖安装新版并保住进度。
密钥保存在 GitHub 仓库的 Secrets（`SHICI_KEYSTORE_BASE64`、`SHICI_KEYSTORE_PASSWORD`）里，
另有一份备份在作者电脑的「英语2/拾词App/signing」文件夹，**请勿删除、勿外传**。
