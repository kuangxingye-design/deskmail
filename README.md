# deskmail

[![CI](https://github.com/kuangxingye-design/deskmail/actions/workflows/ci.yml/badge.svg)](https://github.com/kuangxingye-design/deskmail/actions/workflows/ci.yml)

Windows 桌面磨砂玻璃邮件速览卡片（个人自用）。始终置顶的小卡片，聚合 QQ / 126 / 163 / 162 邮箱的新邮件：统一收件箱、按账号筛选、未读数、正文与内嵌图片复制，不弹系统通知。

- 产品定稿：#1（[Proposal] v0.1 多邮箱桌面速览卡片）
- 架构定稿：[docs/architecture/p1.md](docs/architecture/p1.md)
- 任务拆解：波次 0 #2（工程初始化）、#3（空骨架）；波次 1 #7（UI）、#8（IMAP）、#9（SQLite）、#10（内容解析与净化）

## 状态

P1 波次 0 空骨架已合并；波次 1 进行中：**IMAP 适配器（#8）已在本分支落地**，QQ / 126 为已验证组合（getmeal 实测），真实账号连接测试需在本地输入授权码执行；UI / SQLite / 内容净化待做。数据链路仍走 mock，无真实凭据落盘。

## 开发

```bash
npm install
npm run typecheck   # 类型检查（main/preload + renderer/核心域）
npm run lint        # ESLint
npm test            # node:test：错误分类 / UID 过滤 / ProviderConfig
npm run build       # 编译 main/preload（tsc）+ 打包 renderer（esbuild）
npm start           # 构建并启动窗口
npm run smoke       # 构建 + 启动 + renderer 上报校验后自动退出（exit 0 = mock 链路通过）
```

CI（[.github/workflows/ci.yml](.github/workflows/ci.yml)，windows-latest）：push 到 main 与所有 PR 自动跑 typecheck + lint + test + build + smoke。

## IMAP 本地连接测试

真实账号连接测试需要你在本地输入授权码（不是登录密码）。授权码不会写入仓库或日志；脚本优先读 `DESKMAIL_IMAP_AUTH_CODE`，否则终端隐藏输入。

```bash
npm run imap:test -- --provider qq  --email you@qq.com
npm run imap:test -- --provider 126 --email you@126.com
npm run imap:test -- --provider 163 --email you@163.com
npm run imap:test -- --provider 162 --email you@162.com
```

- provider 可用 `qq` / `126` / `163` / `162`，也接受 `netease126` 等全名
- 输出只包含服务器、UIDVALIDITY、最近邮件头与原始 MIME 字节数；不会打印授权码
- QQ / 126 已在 getmeal 中实测；163 / 162 待本机实测，162 的服务器地址可能共用 `imap.163.com`

## 目录

| 路径 | 内容 |
| --- | --- |
| src/model | 数据模型（Account/Message/InlineImage/SyncState/CardState） |
| src/imap · content · store · sync · accounts | 核心域模块：接口真实定义 + 桩实现 |
| src/inbox | 收件箱用例：真实薄编排 |
| src/platform | 平台能力接口 PlatformServices（浏览器降级桩） |
| src/app | 组合根与 mock 数据（取自 P0 原型） |
| src/main · renderer | Electron 主进程 / preload / 最小验证壳 UI |
| prototype/deskmail-v0.1.html | P0 交互原型（预览截图不入库） |
| docs/architecture/p1.md | P1 架构定稿（决策、模块、数据模型、风险、任务波次） |

## 决策速览（定稿，详见架构文档）

- 技术栈：Electron + TypeScript（D1）
- 全局快捷键：`Alt + \``（反引号）（D2）
- 远程图片一律不加载；内嵌 cid 图片仍显示/可复制（D3）
- 边界：核心域不 import 壳层 API，平台能力经 PlatformServices 注入
