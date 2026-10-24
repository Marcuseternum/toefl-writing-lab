# 开发者与进阶使用

首次使用请先看 [首页入门说明](../README.md)。普通练习无需配置 MCP 或运行测试。

## 从 Git 获取代码

已安装 Git 和 Node.js 22.13 以上时：

```sh
git clone https://github.com/Marcuseternum/toefl-writing-lab.git
cd toefl-writing-lab
node server.mjs
```

无第三方运行依赖，不需要 `npm install`。浏览器访问 http://127.0.0.1:8765/ 。也可使用 `npm start`。

## 更换端口

例如改为 8767，在程序文件夹内运行：

Windows PowerShell：

```powershell
$env:TOEFL_PORT = '8767'
node server.mjs
```

Windows 命令提示符（cmd）：

```bat
set TOEFL_PORT=8767
node server.mjs
```

macOS / Linux：

```sh
TOEFL_PORT=8767 node server.mjs
```

保持窗口运行，打开 http://127.0.0.1:8767/ 。端口可设为 1024–65535。应用只在 `127.0.0.1` 监听，并检查接口请求来源。

## Codex / MCP（可选）

1. 将 `skill/toefl-writing-coach` 复制到自己的 Codex 技能目录。
2. 将该技能 `references/application.md` 中的程序位置改成自己的实际路径。
3. 在自己的 Codex 配置中添加以下 STDIO MCP 连接，替换示例绝对路径。Windows 可使用正斜杠，例如 `C:/Tools/toefl-writing-lab/mcp-server.mjs`。

```toml
[mcp_servers.toefl-writing-lab]
command = "node"
args = ["/absolute/path/to/toefl-writing-lab/mcp-server.mjs"]
```

4. 重启客户端以加载连接，启动网页服务，选择“Codex / MCP”评分方式。写完点击“提交给 Codex”，再在聊天中要求“给刚才提交的作文评分”。

提交按钮不会自己唤醒闲置聊天。当前聊天模型读取原稿、按规则评阅并写回反馈，不调用本程序中的第三方评分 API。支持的客户端也可使用页面 WebMCP。

提供 10 个工具：`get_status`、`get_rubric`、`list_practice_topics`、`start_practice`、`submit_writing`、`get_submission`、`save_feedback`、`list_attempts`、`compare_revisions`、`get_progress`。CLI 入口为 `practice-cli.mjs`。

## 数据目录与备份

HTTP 服务、MCP 和 CLI 默认共用 `.local/data/writing.sqlite`。若通过环境变量 `TOEFL_DATA_DIR` 更改目录，各入口须设置为同一个目录，才能共用档案。

完整备份前关闭 HTTP 服务与相关 MCP 进程，再复制整个 `.local/data` 目录。只复制正在写入的 SQLite 文件可能遗漏 WAL 中的数据。页面 JSON 导出不包含未提交草稿，导入不等同于复制整个数据库。

## 测试

```sh
npm test
```

使用合成作文与模拟 API，不需要真实 Key。GitHub Actions 运行同一套检查。覆盖评分解析、逐字引用、反馈条目保留、同源限制、凭据隔离、提交快照、SQLite 持久化、版本冲突、归档恢复、重写来源标记及 STDIO MCP。程序测试不代表评分准确率校准。

## API 和凭据边界

开源版实现 OpenAI Chat Completions 兼容协议，不直接实现 Anthropic Messages 或 Gemini 原生协议。模型 ID、区域地址、JSON mode 和权限以自己的服务商为准。

Key 默认只保存在本机服务内存，不写入浏览器存储、源码、数据库或反馈备份。刷新页面不会清除正在运行服务的 Key，重启服务会清除。各服务配置的 Key 独立；更换已配置 Key 的服务地址时，需重新输入该服务的 Key。

## 提交代码前

仓库仅包含程序、通用文档、原创题目、技能模板和合成测试，不包含作者的运行配置、凭据、作文、历史或录音。`.gitignore` 已排除 `.local/`、环境文件、数据库、日志、备份和音频。请检查 `git diff --cached`，不要加入个人报告或凭据。
