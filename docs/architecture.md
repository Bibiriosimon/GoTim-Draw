# GOTIM DRAWER 架构决策

## 产品定位

GOTIM DRAWER 不是单一的“AI 画图”应用，而是一个视觉输出运行时：

- 人可以在无限画布上直接编辑。
- 内置 AI 根据自然语言和画布上下文生成操作。
- 外部 coding agent 可以通过稳定、简单的 HTTP 命令协议控制同一画布。
- 讲题、绘画、下棋、演示只是工作模式，不是相互隔离的产品。

## 为什么使用 tldraw

旧 `exp_slide` 已经验证了 `coding agent -> HTTP -> SSE -> Canvas` 的控制路径，但自研 Canvas 元素协议会迅速遇到选择、拖拽、缩放、撤销、文字排版、连接线和持久化等问题。

tldraw 提供成熟的可编辑对象模型和画布交互。GOTIM 只维护 agent command 到 tldraw shape 的适配层，避免重新实现编辑器。

## 分层

```text
Agent layer
  Claude Code / Codex / model agent loop
            |
            v
Control layer
  GET  /help.html
  GET  /agent.md
  POST /api/commands
  POST /api/commands/batch
  GET  /api/capabilities
  GET  /api/events (SSE)
            |
            v
Command adapter
  createText / createNote / createGeo / createArrow / scene
            |
            v
Canvas runtime
  tldraw editor + store + persistence
```

## 下一阶段

1. 在浏览器向控制服务回传当前选区、页面 shape JSON 和截图。
2. 在控制服务增加任务队列、取消、重试和逐步 action 状态。
3. 把自然语言 prompt 接入真实模型，并要求模型输出受约束的 command schema。
4. 将复杂能力做成可组合工具，例如数学公式、棋盘、图表、代码块、网页嵌入。
5. 为外部 coding agent 提供 MCP server，使其不用手写 HTTP 请求。

## 关键约束

- 模型不直接写画布存储，必须经过 command adapter。
- command 必须可验证、可撤销、可记录。
- 业务模式只修改提示词、工具集和默认布局，不分叉画布内核。
- 不让模型生成任意前端代码并直接执行；交互组件通过白名单 shape/tool 注册。
- 运行中的网页必须自描述：Agent 访问 `/help.html`、`/agent.md` 或 `/api/capabilities` 即可发现使用方式。
