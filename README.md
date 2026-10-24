# TOEFL Writing Lab · 托福写作练习室

一个在本机运行的托福2026写作练习工具，重点练习**邮件写作**与**学术讨论**：限时独立写作 → AI反馈 → 同题重写 → 回顾进步。支持无需单独API Key的Codex评阅，也保留可选的API自动评分。

> 这是学习辅助工具，采用公开评分标准进行单题0–5档位练习估分。不是ETS官方评分系统，未经带分语料校准，不换算正式1–6科目分。

## 核心创意

让评分成为一个可持续复盘的练习流程，而不只是聊天里的一次点评。

- **反馈有依据**：保存提交时的原稿，核对每条原文引用，区分错误修正与可选润色。
- **同题记录收纳**：相同题型、相同完整题目收在一张可展开的卡片中；AI生成内容标题与摘要，方便回看。
- **真正练习重写**：原稿、独立重写、AI示范分别记录，能比较前后变化，避免把AI改写误当成自己的进步。
- **邮件示范适度扩展**：改写目标140–150词、至少140词；这是练习偏好，不作为ETS最低字数或原稿机械扣分规则。
- **反馈不截断条数**：保留模型给出的所有有效建议，仍逐条校验引用和结构。
- **Codex原生工作流**：网页写作、MCP读取提交、当前聊天模型评阅并写回档案；另外保留手动复制请求和导入JSON的方式。

更多设计说明见[IDEA.md](IDEA.md)。

## 快速运行

需要Node.js 22.13以上，推荐Node 24。无第三方运行依赖。

~~~sh
node server.mjs
~~~

然后打开 http://127.0.0.1:8765/ 。Windows也可以双击start.cmd。保持服务进程运行。设置TOEFL_PORT可更换端口。

## 不用API Key怎么练

1. 选邮件或学术讨论题，或粘贴自己的完整题目。内置题目是原创模拟练习。
2. 限时独立完成，点击“提交给Codex”。
3. 在已连接MCP的Codex聊天中要求评阅，模型读取不可覆盖的原文和规则，将反馈写回本机档案。
4. 从记录开始同题独立重写，比较修改前后的表现。

提交按钮不会自动唤醒闲置的Codex对话。尚未配置MCP时，可用页面的复制评分请求和手动JSON导入功能。

## MCP连接

将skill/toefl-writing-coach复制到自己的Codex技能目录，并按实际克隆位置配置STDIO MCP。下面路径为占位符，需替换成你电脑上的绝对路径：

~~~toml
[mcp_servers.toefl-writing-lab]
command = "node"
args = ["/absolute/path/to/toefl-writing-lab/mcp-server.mjs"]
~~~

HTTP服务、MCP和CLI默认共享仓库下的.local/data/writing.sqlite。若设置TOEFL_DATA_DIR，各入口必须使用同一目录。应用技能的路径说明也需要按自己的安装位置填写。

提供10个工具：get_status、get_rubric、list_practice_topics、start_practice、submit_writing、get_submission、save_feedback、list_attempts、compare_revisions、get_progress。支持的客户端也可使用页面的WebMCP；CLI入口为practice-cli.mjs。

## 可选API评分

在AI设置中填写**自己的**Chat Completions兼容端点、模型ID和Key。默认GPT端点为OpenAI公共地址；Claude配置使用明确的示例端点，需要改成你有权使用且支持对应模型的兼容服务。当前适配器不直接实现Anthropic原生Messages协议。模型名和权限以自己的服务为准。

Key只保存在本机服务内存，重启后重新填写。刷新页面不会清除正在运行服务的Key。调用API会把题目和作文发送到你配置的服务；Codex模式则由当前聊天模型评阅。失败不会自动重复调用或切换模型。

## 本地数据与仓库边界

这个仓库只包含程序、原创题目、通用文档、技能模板和使用合成样例的自动测试。**不包含作者的API Key、运行配置、作文、评分历史、数据库、日志或录音。** API接入代码保留，凭据由使用者自行配置。

.local/、数据库、环境文件、日志、备份和音频已加入.gitignore。导出个人报告时请保存在被忽略的本地目录。提交前仍应自行检查git diff --cached。完整档案备份应在关闭HTTP和MCP进程后复制.local/data目录。

## 验证

~~~sh
npm test
~~~

自动检查使用合成作文和模拟API，不需要真实Key。覆盖评分解析、逐字引用、完整反馈条目、同源限制、凭据隔离、提交快照、SQLite持久化、版本冲突、归档恢复、重写来源标记及STDIO MCP。GitHub Actions运行同一套检查。程序测试不代表评分准确率校准。

## 公开依据

- [ETS写作评分标准](https://www.ets.org/content/dam/ets-org/pdfs/toefl/writing-rubrics.pdf)
- [ETS 2026考试规格](https://www.eu.ets.org/pdfs/toefl/toefl-ibt-test-specifications-2026.pdf)
- [ETS教师练习材料](https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-teachers-resources-practice-test-1.pdf)

官方材料通过链接访问，不随仓库打包。
