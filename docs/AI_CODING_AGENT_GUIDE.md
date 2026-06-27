# GOTIM DRAWER：AI Coding Agent 使用手册

本文档面向 Claude Code、Codex、Cursor Agent、OpenCode，以及自定义后端 Agent。

AI Coding Agent 不需要操作浏览器 DOM，也不应该直接修改 tldraw store。它只需要向 GOTIM DRAWER 控制服务发送 JSON 命令，浏览器会把命令转换成可继续编辑的画布对象。

## 0. 推荐入口

GOTIM DRAWER 是一个自描述工具。外部 Agent 不必预先拥有本仓库文档，只需访问运行中的网页服务：

```text
GET /help.html         人类和网页读取型 Agent 使用的交互帮助页
GET /agent.md          命令行 Agent 使用的简短操作说明
GET /api/capabilities  机器可读、应视为权威来源的实时能力定义
```

开发模式完整地址：

```text
http://localhost:5173/help.html
http://localhost:5173/agent.md
http://localhost:8787/api/capabilities
```

生产模式端口默认为 `8787`。

## 0.1 用户如何给 AI Coding Agent 下命令

先启动 GOTIM DRAWER：

```powershell
cd path/to/gotim-drawer
npm run dev
```

打开画布：

```text
http://localhost:5173
```

然后直接在 Claude Code、Codex 或其他 coding agent 的聊天框中输入：

```text
请使用 GOTIM DRAWER 帮我画一个“用户登录流程图”。

开始前先访问：
http://localhost:5173/agent.md

按照页面说明检查画布连接、读取 capabilities，并通过批量命令完成绘制。
不要清空现有画布。
绘制完成后执行 zoomToFit，并告诉我你画了什么。
```

如果允许 AI 清空画布重做：

```text
请使用 GOTIM DRAWER 制作一页介绍“大语言模型工作原理”的演示页。

先阅读 http://localhost:5173/agent.md。
允许清空当前画布。
请先规划布局，再通过 /api/commands/batch 一次性绘制。
```

如果 Agent 无法直接访问网页，可以给它本地文件：

```text
请先阅读：
path/to/gotim-drawer/docs/AI_CODING_AGENT_GUIDE.md

然后使用 GOTIM DRAWER 画一个三层系统架构图。
```

对于 Claude Code 或 Codex，推荐在项目目录启动 Agent，这样它可以直接读取项目文档并执行 PowerShell：

```powershell
cd path/to/gotim-drawer
claude
```

或者：

```powershell
cd path/to/gotim-drawer
codex
```

用户只需要描述想画的内容。AI Coding Agent 负责读取帮助、规划坐标、调用 API 和检查结果。

## 1. 工作原理

```text
AI Coding Agent
    |
    | POST JSON
    v
http://localhost:8787/api/commands
    |
    | SSE 实时推送
    v
已打开的 GOTIM DRAWER 浏览器
    |
    v
tldraw 可编辑图形
```

重要限制：

- 命令只会推送给当前已连接的浏览器，不会排队。
- 必须先打开画布，再发送命令。
- API 响应中的 `deliveredTo` 应大于等于 `1`。
- 当前协议支持创建、清空、撤销、重做、按 ID 更新/删除，以及读取画布 shape 摘要。
- 单条命令可发送到 `/api/commands`。
- 完整画面推荐一次发送到 `/api/commands/batch`。

## 2. 启动项目

在项目目录运行：

```powershell
cd path/to/gotim-drawer
npm install
npm run dev
```

然后打开：

```text
http://localhost:5173
```

开发模式下：

- 前端地址：`http://localhost:5173`
- 控制服务：`http://localhost:8787`
- Vite 会把前端的 `/api` 请求代理到控制服务。

生产模式：

```powershell
npm run build
npm start
```

生产模式下访问：

```text
http://localhost:8787
```

## 3. Agent 开始工作前的检查

### 检查服务健康状态

```powershell
Invoke-RestMethod http://localhost:8787/api/health
```

预期结果：

```json
{
  "ok": true,
  "service": "gotim-drawer-control",
  "clients": 1
}
```

判断规则：

- `ok: true`：控制服务已启动。
- `clients >= 1`：至少一个画布浏览器已连接，可以开始绘制。
- `clients: 0`：先让用户打开画布，不要发送正式绘图命令。

### 获取实时能力列表

```powershell
Invoke-RestMethod http://localhost:8787/api/capabilities
```

Agent 应优先读取此接口，而不是假设服务支持某条命令。

## 4. 发送命令

### PowerShell 推荐写法

```powershell
$body = @{
  type = "createNote"
  x = 120
  y = 120
  text = "由 AI Coding Agent 创建"
  color = "yellow"
} | ConvertTo-Json

Invoke-RestMethod http://localhost:8787/api/commands `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

### Bash / macOS / Linux 写法

```bash
curl -X POST http://localhost:8787/api/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"createNote","x":120,"y":120,"text":"由 AI Coding Agent 创建","color":"yellow"}'
```

成功响应：

```json
{
  "ok": true,
  "command": {
    "id": 1,
    "type": "createNote",
    "x": 120,
    "y": 120,
    "text": "由 AI Coding Agent 创建",
    "color": "yellow"
  },
  "deliveredTo": 1
}
```

收到 `ok: true` 后仍需检查 `deliveredTo`。如果值为 `0`，该命令没有到达任何画布。

### 批量命令推荐写法

制作 PPT 页面、流程图或完整讲解图时，优先一次提交完整布局：

```json
{
  "commands": [
    {"type":"createText","x":80,"y":40,"text":"标题","color":"violet","size":"xl"},
    {"type":"createGeo","x":80,"y":180,"w":260,"h":140,"label":"内容","color":"blue","geo":"rectangle"},
    {"type":"zoomToFit"}
  ]
}
```

发送到：

```text
POST /api/commands/batch
```

## 5. 完整命令参考

### `clear`

清空当前页面中的所有图形。

```json
{
  "type": "clear"
}
```

危险性：高。除非用户明确要求清空、重做或切换完整场景，否则不要调用。

### `zoomToFit`

让视口显示当前页面中的全部图形。

```json
{
  "type": "zoomToFit"
}
```

建议在完成一批绘制命令后调用一次。

### `createText`

创建无边框文本。

```json
{
  "type": "createText",
  "x": 80,
  "y": 40,
  "text": "二次函数：从图像理解顶点",
  "color": "violet",
  "size": "xl"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `type` | 是 | 固定为 `createText` |
| `text` | 是 | 显示文本，支持换行 |
| `x` | 否 | 左上角 X 坐标，默认 `0` |
| `y` | 否 | 左上角 Y 坐标，默认 `0` |
| `color` | 否 | 文本颜色，默认 `black` |
| `size` | 否 | 推荐使用 `s`、`m`、`l`、`xl` |

适合标题、副标题、公式和简短解释。

### `createNote`

创建便签。

```json
{
  "type": "createNote",
  "x": 500,
  "y": 120,
  "text": "关键结论\n顶点是 (2, -1)",
  "color": "yellow"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `type` | 是 | 固定为 `createNote` |
| `text` | 是 | 便签内容，支持换行 |
| `x` | 否 | 左上角 X 坐标 |
| `y` | 否 | 左上角 Y 坐标 |
| `color` | 否 | 默认 `yellow` |

适合结论、问题、步骤、提示和批注。

### `createGeo`

创建带文本标签的几何图形。

```json
{
  "type": "createGeo",
  "x": 80,
  "y": 180,
  "w": 260,
  "h": 140,
  "label": "输入",
  "color": "blue",
  "geo": "rectangle"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `type` | 是 | 固定为 `createGeo` |
| `label` | 否 | 图形内部文字 |
| `x` | 否 | 左上角 X 坐标 |
| `y` | 否 | 左上角 Y 坐标 |
| `w` | 否 | 宽度，默认 `240` |
| `h` | 否 | 高度，默认 `120` |
| `color` | 否 | 默认 `blue` |
| `geo` | 否 | 几何类型，默认 `rectangle` |

常用 `geo`：

```text
rectangle
ellipse
triangle
diamond
hexagon
cloud
star
```

适合流程图节点、概念框、棋盘格和演示卡片。

### `createArrow`

创建从起点到终点的箭头。

```json
{
  "type": "createArrow",
  "x": 340,
  "y": 250,
  "endX": 520,
  "endY": 250,
  "color": "violet"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `type` | 是 | 固定为 `createArrow` |
| `x` | 否 | 起点 X |
| `y` | 否 | 起点 Y |
| `endX` | 否 | 终点 X |
| `endY` | 否 | 终点 Y |
| `color` | 否 | 默认 `black` |

当前箭头不会自动绑定图形。Agent 应根据图形位置自行计算起点和终点。

### `insert_template`

使用预设模板在画布上创建结构化内容。**优先于自由绘制**。

```json
{
  "type": "insert_template",
  "templateId": "math_explainer_card",
  "x": 80,
  "y": 60,
  "w": 480,
  "h": 540,
  "slots": {
    "title": "标题",
    "formula": "公式",
    "keyIdea": "核心理念",
    "steps": ["第一步", "第二步", "第三步"],
    "conclusion": "结论"
  }
}
```

可用模板通过 `GET /api/capabilities` 查看 `commands.insert_template.templates`。

| 模板 ID | 用途 | 主要 slots |
|---------|------|-----------|
| `math_explainer_card` | 数学讲题卡片 | title, formula, keyIdea, steps, conclusion |
| `coordinate_plot` | 函数图像坐标图 | title, formula, vertex, roots, axis, opening |

## 6. 推荐颜色与坐标

```json
{
  "type": "scene",
  "name": "lesson"
}
```

支持的场景：

| 名称 | 用途 |
| --- | --- |
| `lesson` | 讲题与知识解释 |
| `brainstorm` | 脑图与创意整理 |
| `chess` | 棋盘与策略复盘 |
| `presentation` | 演示页与产品介绍 |

注意：`scene` 会清空当前画布。

## 6. 推荐颜色与坐标

推荐颜色：

```text
black, grey, light-grey, white
blue, light-blue
violet, light-violet
green, light-green
yellow, orange
red, light-red
```

建议画布布局范围：

```text
标题区：x=60..900, y=20..120
主体区：x=60..1000, y=140..700
节点间距：水平至少 80，垂直至少 60
常用节点：w=220..300, h=100..180
```

坐标不是屏幕像素，而是无限画布中的页面坐标。可以使用负数，但常规任务建议从正坐标开始。

## 7. 推荐 Agent 执行流程

对于“画一个流程图”“讲解一道题”等请求，建议严格按以下流程执行：

1. 调用 `GET /api/health`。
2. 确认 `clients >= 1`。
3. 调用 `GET /api/capabilities`。
4. 先在内部规划图形和坐标，不要边想边随机发送。
5. 询问或判断是否允许清空当前画布。
6. 逐条发送标题、主体节点、箭头和注释。
7. 最后发送 `zoomToFit`。
8. 检查每次响应的 `ok` 和 `deliveredTo`。
9. 向用户简要报告创建了什么。

推荐绘制顺序：

```text
背景/主体框 -> 标题 -> 内容节点 -> 箭头 -> 注释 -> zoomToFit
```

## 8. 示例：绘制一个 AI 请求流程

PowerShell：

```powershell
$endpoint = "http://localhost:8787/api/commands"

function Send-DrawerCommand($command) {
  $result = Invoke-RestMethod $endpoint `
    -Method Post `
    -ContentType "application/json" `
    -Body ($command | ConvertTo-Json -Depth 10)

  if (-not $result.ok) {
    throw "GOTIM DRAWER command failed"
  }
  if ($result.deliveredTo -lt 1) {
    throw "No canvas client is connected"
  }
  return $result
}

Send-DrawerCommand @{ type = "clear" }
Send-DrawerCommand @{
  type = "createText"; x = 80; y = 30
  text = "AI 请求处理流程"; color = "violet"; size = "xl"
}
Send-DrawerCommand @{
  type = "createGeo"; x = 80; y = 180; w = 220; h = 120
  label = "用户输入"; color = "blue"; geo = "rectangle"
}
Send-DrawerCommand @{
  type = "createGeo"; x = 390; y = 180; w = 220; h = 120
  label = "Agent 规划"; color = "violet"; geo = "rectangle"
}
Send-DrawerCommand @{
  type = "createGeo"; x = 700; y = 180; w = 220; h = 120
  label = "画布执行"; color = "green"; geo = "rectangle"
}
Send-DrawerCommand @{
  type = "createArrow"; x = 300; y = 240
  endX = 390; endY = 240; color = "violet"
}
Send-DrawerCommand @{
  type = "createArrow"; x = 610; y = 240
  endX = 700; endY = 240; color = "violet"
}
Send-DrawerCommand @{
  type = "createNote"; x = 390; y = 360
  text = "命令必须经过白名单适配层"; color = "yellow"
}
Send-DrawerCommand @{ type = "zoomToFit" }
```

## 9. 可直接提供给 AI Coding Agent 的提示词

```text
你可以通过 GOTIM DRAWER 控制 API 操作用户的可视化画布。

工作目录：
path/to/gotim-drawer

控制服务：
http://localhost:8787

开始绘制前必须：
1. GET /api/health，确认 ok=true 且 clients>=1。
2. GET /api/capabilities，读取当前支持的命令。
3. 在内部规划布局和坐标。

发送命令：
POST /api/commands
Content-Type: application/json

每次发送后检查响应中的 ok=true 和 deliveredTo>=1。
完成一批绘制后发送 {"type":"zoomToFit"}。

不要直接操作浏览器 DOM 或 tldraw store。
不要在未获得允许时调用 clear 或 scene，因为它们会清空当前画布。
可以通过 `GET /api/canvas/shapes` 读取当前画布摘要，并通过 `updateShape`、`deleteShape` 对已知 shape id 做有限更新或删除。

详细协议见 docs/AI_CODING_AGENT_GUIDE.md。
```

## 10. Template Engine — Agent 提示规则

以下规则应注入到 Agent 的 system prompt 或工具描述中（当使用 Claude Code、Codex 或其他 Agent 时）：

1. **当用户请求讲题、流程图、结构图、PPT 页面、图案展示时，优先使用 `insert_template`**。
2. **不要直接创建大量低级 shapes 来画复杂图**。模板能保证视觉质量、比例和一致性。
3. **复杂图形应先选择 templateId，再填写 slots**。不要边画边改。
4. **只有模板无法满足需求时**，才使用 `createGeo`/`createText`/`createNote` 等自由绘制 action。
5. **对数学讲题**，优先使用 `math_explainer_card` 和 `coordinate_plot` 模板组合。

## 11. 故障处理

### API 无法连接

检查控制服务：

```powershell
Invoke-RestMethod http://localhost:8787/api/health
```

若连接失败，运行：

```powershell
npm run dev
```

### `deliveredTo` 为 `0`

原因：没有浏览器连接到 SSE。

处理：

1. 打开 `http://localhost:5173`。
2. 等待顶部显示“Agent API 已连接”。
3. 重新发送命令。

之前发送的命令不会自动补发。

### 命令返回 `Missing command.type`

请求 JSON 缺少 `type`：

```json
{
  "type": "createNote",
  "text": "正确示例"
}
```

### 图形没有显示在视口中

发送：

```json
{
  "type": "zoomToFit"
}
```

### 图形重叠

当前服务不会自动布局。Agent 应重新规划坐标并创建新场景。除非用户允许，否则不要直接清空原画布。

## 11. 扩展新命令

新增命令需要同时修改：

1. `src/commands.ts`：扩展 `DrawerCommand` 并实现执行逻辑。
2. `server/index.mjs`：在 `/api/capabilities` 中公开命令结构。
3. 本文档：说明字段、风险和示例。

命令设计原则：

- 使用结构化 JSON，不传任意 JavaScript。
- 输入可验证。
- 操作语义明确。
- 危险操作必须单独命名。
- 后续应支持命令 ID、撤销、状态回传和审计记录。
