# CardPilot 本地信用卡管理

一款无需注册、数据只保存在本机的信用卡额度、年费与还款日管理工具。

[![在线体验](https://img.shields.io/badge/在线体验-打开应用-3f6df6)](https://awaitthewind.github.io/Credit-Card-Management/)
[![GitHub Release](https://img.shields.io/github/v/release/AwaitTheWind/Credit-Card-Management?display_name=tag)](https://github.com/AwaitTheWind/Credit-Card-Management/releases)
[![Local First](https://img.shields.io/badge/data-local--first-20a47a)](#隐私说明)

![CardPilot 仪表盘](outputs/cardpilot-dashboard.png)

**[立即在线体验](https://awaitthewind.github.io/Credit-Card-Management/)** · **[下载源码](https://github.com/AwaitTheWind/Credit-Card-Management/archive/refs/heads/main.zip)** · **[提交建议](https://github.com/AwaitTheWind/Credit-Card-Management/issues)**

## 功能

- 信用卡资料新增、编辑、停用和删除，支持主副卡、多卡组织与拖拽排序
- 独立额度与共享额度组，主副卡或同银行多卡均可共享且只计算一次
- 刚性、可减免、期免与终免年费管理，支持减免条件、完成状态和期免有效期
- 总授信额度、年费成本、银行额度、卡组织与权益统计
- 账单日和还款日月历、未来 7 天提醒
- 年费减免进度追踪
- 搜索、筛选和排序
- JSON 完整备份、JSON 恢复和 CSV 导出
- 明暗主题与移动端适配
- 数据默认只保存在当前浏览器的 `localStorage`

完整版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## 本地运行

Windows 用户双击根目录中的 `start.bat`；也可以直接打开 `source/index.html`。

首次打开时卡片列表为空。添加自己的卡片后，数据自动保存在当前浏览器。建议定期在“卡片管理”中导出 JSON 备份。

## 隐私说明

请勿在应用里记录完整卡号、有效期、CVV、安全码、密码或短信验证码。代码仓库不包含任何卡片数据；本地备份应放入 `data/private/` 或 `outputs/private/`，这些目录已被 Git 忽略。

清除浏览器站点数据可能会删除本地卡片，因此真实使用前请先测试“导出备份”和“导入备份”。

## 发布到 GitHub Pages

应用源文件位于 `source/`，每次推送到 `main` 分支时会由 GitHub Actions 自动发布到：

https://awaitthewind.github.io/Credit-Card-Management/

注意：GitHub Pages 只托管程序文件；卡片数据仍保存在每位访问者自己的浏览器中，不会随代码上传。

## 项目结构

```text
source/
  index.html       应用界面
  styles.css       响应式样式
  app.js           数据、统计、日历与导入导出逻辑
docs/              项目文档
data/private/      本地私密数据（不会提交）
outputs/private/   本地导出文件（不会提交）
start.bat          Windows 快速启动入口
```
