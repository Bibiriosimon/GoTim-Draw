# GOTIM DRAWER — Agent-Controlled Canvas Project

> 一个由 Coding Agent 实时控制的通用视觉工作台  
> 基于 tldraw + Template Engine，支持讲题、绘画、流程图、下棋、演示等场景

---

## 📋 项目概述

### 项目描述

GOTIM DRAWER 是一个**由后端 AI Coding Agent 通过 HTTP API 控制的前端画布系统**。它将 tldraw（一个强大的无限画布库）与自定义的 Template Engine 结合，使 Agent 能够：

- 通过结构化命令（JSON）在画布上创建图形、文本、箭头、便签
- 使用预设模板快速生成高质量的讲题卡片、函数图像、流程图等
- 实时推送命令到浏览器，用户可继续手动编辑

### 项目目的

1. **降低 Agent 绘图门槛**  
   传统方式需要 Agent 自由创建大量低级 shapes（矩形、文本、箭头），容易出现：
   - 坐标计算错误导致重叠
   - 比例失调
   - 视觉质量不稳定
   
   **Template Engine** 通过预设模板（如 `math_explainer_card`、`coordinate_plot`）封装复杂布局逻辑，Agent 只需填写 `slots`，即可生成专业级图形。

2. **支持多场景应用**  
   - 📐 **讲题**：数学、物理、化学公式讲解
   - 🎨 **绘画/脑图**：创意整理、概念图
   - ♟️ **下棋**：棋局复盘、策略分析
   - 📊 **演示**：PPT 式页面展示
   - 🧪 **Artifact**：代码、图表、交互组件展示

3. **人机协作**  
   Agent 生成基础结构 → 用户在 tldraw 中手动微调、添加细节 → 形成最终作品

---

## 🏗️ 项目架构

```
┌─────────────────────────────────────────────────────────────┐
│  AI Coding Agent (Claude Code / Codex / Cursor / 自定义)     │
│  读取文档 → 规划布局 → 调用 HTTP API                         │
└────────────────────┬────────────────────────────────────────┘
                     │ POST /api/commands (JSON)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Control Server (Node.js / Express)                         │
│  • 接收命令                                                  │
│  • 通过 SSE 实时推送到浏览器                                 │
│  • 提供 /api/capabilities（机器可读能力声明）               │
└────────────────────┬────────────────────────────────────────┘
                     │ SSE (Server-Sent Events)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + tldraw + Vite)                           │
│  • 接收 SSE 推送的命令                                       │
│  • executeCommand() 调用 tldraw editor API                  │
│  • Template Engine 渲染预设模板                             │
│  • 用户可手动编辑画布内容                                    │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 画布引擎 | tldraw 4.5.12 |
| 构建工具 | Vite 6.3.5 |
| 后端服务 | Node.js + Express 5.1.0 |
| 实时通信 | Server-Sent Events (SSE) |
| 样式 | CSS (自定义) |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- 现代浏览器（Chrome / Edge / Firefox）

### 安装依赖

```bash
cd C:/Users/23108/Desktop/GoTim/draw/gotim-drawer
npm install
```

### 启动开发服务

```bash
npm run dev
```

这会同时启动：
- **前端 (Vite)**：http://localhost:5173 或 5174（如果端口被占用）
- **控制 API**：http://localhost:8787

### 构建生产版本

```bash
npm run build
npm start
```

生产模式下访问：http://localhost:8787

---

## 📁 项目结构

```
gotim-drawer/
├── package.json                # 依赖配置
├── vite.config.ts              # Vite 配置（代理 /api → 8787）
├── tsconfig.json               # TypeScript 配置
├── tsconfig.app.json           # 应用级 TS 配置
│
├── server/
│   └── index.mjs               # Control API 服务器
│                               # 端点：/api/health, /api/capabilities, /api/commands, /api/events
│
├── src/
│   ├── main.tsx                # React 入口
│   ├── App.tsx                 # 主应用组件（UI + SSE 接收）
│   ├── styles.css              # 全局样式
│   ├── commands.ts             # 命令执行器 executeCommand()
│   │                           # 包含 DrawerCommand 类型定义
│   │
│   └── templates/              # Template Engine ✨ 新增
│       ├── types.ts            # TemplateDefinition, TemplateSlot, InsertTemplateAction
│       ├── styles.ts           # 风格预设（academic / summary / presentation / minimal）
│       ├── TemplateRegistry.ts # 模板注册中心
│       └── renderers/
│           ├── math_explainer_card.ts   # 数学讲题卡片渲染器
│           └── coordinate_plot.ts        # 函数图像坐标图渲染器
│
├── public/
│   ├── agent.md                # Agent 入口文档（简洁版，推荐 Agent 首次读取）
│   └── help.html               # 人类用户帮助页（交互式）
│
├── docs/
│   ├── AI_CODING_AGENT_GUIDE.md  # Agent 完整使用手册
│   └── architecture.md           # 架构决策（如果存在）
│
└── tmp_steps/                  # 临时测试命令文件（可忽略）
```

---

## 🎯 核心功能

### 1. 基础命令（DrawerCommand）

| 命令类型 | 用途 | 示例 |
|---------|------|------|
| `clear` | 清空画布 | `{"type":"clear"}` |
| `zoomToFit` | 自动缩放到适配所有内容 | `{"type":"zoomToFit"}` |
| `createText` | 创建无边框文本 | `{"type":"createText","x":80,"y":40,"text":"标题","color":"violet","size":"xl"}` |
| `createNote` | 创建便签（带背景色） | `{"type":"createNote","x":120,"y":160,"text":"重要提示","color":"yellow"}` |
| `createGeo` | 创建几何图形（矩形/圆/菱形/三角等） | `{"type":"createGeo","x":80,"y":180,"w":240,"h":120,"label":"流程1","color":"blue","geo":"rectangle"}` |
| `createArrow` | 创建箭头连接 | `{"type":"createArrow","x":320,"y":240,"endX":440,"endY":240,"color":"violet"}` |
| `scene` | 清空并加载预设场景 | `{"type":"scene","name":"lesson"}` |

### 2. Template Engine（推荐用于复杂内容）✨

#### 命令格式

```json
{
  "type": "insert_template",
  "templateId": "math_explainer_card",
  "x": 80,
  "y": 60,
  "w": 480,
  "h": 540,
  "stylePreset": "academic",
  "slots": {
    "title": "标题",
    "formula": "公式",
    "keyIdea": "核心思想",
    "steps": ["步骤1", "步骤2", "步骤3"],
    "conclusion": "结论"
  }
}
```

#### 可用模板

| 模板 ID | 用途 | 主要 Slots |
|---------|------|-----------|
| `math_explainer_card` | 数学/物理讲题卡片 | `title`, `formula`, `keyIdea`, `steps[]`, `conclusion` |
| `coordinate_plot` | 函数图像坐标图 | `title`, `formula`, `vertex`, `roots[]`, `axis`, `opening` |

---

## 🔌 API 接口

### 健康检查

```bash
GET http://localhost:8787/api/health
```

**响应**：
```json
{
  "ok": true,
  "service": "gotim-drawer-control",
  "clients": 1
}
```

`clients >= 1` 表示有浏览器已连接，可以开始发送命令。

### 能力查询

```bash
GET http://localhost:8787/api/capabilities
```

返回机器可读的命令 schema、可用模板列表、工作流说明。

### 发送单条命令

```bash
POST http://localhost:8787/api/commands
Content-Type: application/json

{"type":"createNote","x":120,"y":160,"text":"Hello from Agent","color":"yellow"}
```

### 批量发送命令

```bash
POST http://localhost:8787/api/commands/batch
Content-Type: application/json

{
  "commands": [
    {"type":"createText","x":80,"y":40,"text":"标题","color":"violet","size":"xl"},
    {"type":"createGeo","x":80,"y":120,"w":240,"h":120,"label":"内容","color":"blue"},
    {"type":"zoomToFit"}
  ]
}
```

**响应**：
```json
{
  "ok": true,
  "count": 3,
  "commands": [...],
  "deliveredTo": 1
}
```

### SSE 事件流（浏览器订阅）

```bash
GET http://localhost:8787/api/events
```

浏览器通过此端点接收实时命令推送。

---

## 📜 脚本位置与说明

### package.json 脚本

```json
{
  "scripts": {
    "dev": "concurrently -k \"npm:dev:api\" \"npm:dev:web\"",
    "dev:web": "vite",
    "dev:api": "node --watch server/index.mjs",
    "build": "tsc -b && vite build",
    "start": "node server/index.mjs"
  }
}
```

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式（前端 + 后端同时运行，热重载） |
| `npm run build` | 构建生产版本（输出到 `dist/`） |
| `npm start` | 启动生产服务器 |

### 测试脚本示例

位置：`tmp_steps/`

- `step0_clear.json` — 清空画布
- `step1_title.json` — 创建标题
- `step2_definition.json` — 创建定义法卡片
- `faraday_demo.json` — 法拉第电磁感应定律完整 demo

**手动测试命令**：

```bash
curl -X POST http://localhost:8787/api/commands/batch \
  -H "Content-Type: application/json" \
  -d @tmp_steps/faraday_demo.json
```

---

## ⚠️ 当前已知问题

### 1. 缺少自由画图能力

**问题描述**：  
当前模板只支持预定义的结构（卡片、坐标图），无法绘制竖式运算、手写推导步骤、复杂几何图形等自由内容。

**具体场景**：
- ❌ 竖式加法/乘法运算
- ❌ 手写式推导（如求导过程的手写展开）
- ❌ 自由曲线、手绘箭头
- ❌ 复杂化学结构式（需要自定义连接线和角度）

**可能解决方案**：
1. **新增 `freehand_drawing` 模板**  
   接受 SVG path 或笔画点序列，渲染为 tldraw 的 `draw` shape
   
2. **新增 `grid_layout` 模板**  
   用于竖式运算，提供网格坐标系，Agent 按行列填充数字
   
3. **新增 `custom_svg` 命令**  
   允许 Agent 直接传入 SVG 字符串，转换为 tldraw shape

### 2. 版块重叠问题

**问题描述**：  
多个模板或 shapes 坐标计算不当时，容易出现重叠、遮挡，影响视觉效果。

**已观察到的场景**：
- 使用 `math_explainer_card` + `coordinate_plot` 时，如果 x 坐标间距 < 550px，会重叠
- 批量创建 `createGeo` 时，Agent 可能生成相同坐标
- 长文本 `createNote` 超出预期高度，压在下方内容上

**临时规避方法**：
- 在文档中明确标注推荐间距（见 `docs/AI_CODING_AGENT_GUIDE.md` 第 6 节）
- Agent 在规划布局前，先计算总画布尺寸
- 使用 `zoomToFit` 自动调整视口

**根本解决方案**：
1. **自动布局引擎**  
   实现类似 Graphviz 的自动布局算法（dot、neato），Agent 只需声明节点和边，系统自动计算坐标
   
2. **碰撞检测**  
   在 `executeCommand` 中增加碰撞检测，拒绝会导致严重重叠的命令
   
3. **网格对齐系统**  
   提供 `grid: { cols: 3, rows: 2, gap: 20 }` 参数，系统自动分配每个元素到格子

### 3. 中文支持不完善

**问题描述**：  
- 通过 `curl` 直接发送中文 JSON 时，如果编码不是 UTF-8，会出现乱码
- tldraw 的文本渲染对长中文文本的换行支持不够智能

**已采用的解决方案**：
- 使用文件方式（`-d @file.json`）而非命令行内联 JSON
- 明确指定 UTF-8 编码

**待优化**：
- 前端文本自动换行逻辑优化
- 支持 Markdown 格式的 `richText`

### 4. UI 聊天框功能有限

**问题描述**：  
右侧聊天框只能触发预设场景（`lesson`/`brainstorm`/`chess`/`presentation`），不会解析用户输入的自然语言，也不会调用 Template Engine。

**现状**：
- 聊天框输入 → 硬编码调用 `createScene(mode)` → 只显示预设内容
- 用户输入的文本内容被忽略

**设计理念**：  
UI 聊天框是演示界面，真正的 Agent 控制应通过外部 HTTP API（如 Claude Code、Codex）。

**如果需要改进**：
- 集成简单的规则匹配或 NLP（如检测"讲解"、"画图"等关键词）
- 调用后端 Agent API（如 Claude API）处理用户输入，生成命令后返回

### 5. 动画速度控制不够灵活

**问题描述**：  
批量命令通过 `sleep` 控制间隔，但这是硬编码在脚本中，无法动态调整。

**期望功能**：
- 在命令中增加 `delay` 参数，如 `{"type":"createText","delay":500,...}`
- 支持 `animation` 元数据，控制 shape 的出现动画

### 6. 缺少撤销/重做机制

**问题描述**：  
Agent 发送错误命令后，无法撤销，只能 `clear` 全部清空重来。

**期望功能**：
- `{"type":"undo"}` 命令
- `{"type":"deleteShape","shapeId":"shape_123"}` 命令
- `{"type":"updateShape","shapeId":"shape_123","props":{...}}` 命令

### 7. 无法读取画布状态

**问题描述**：  
当前 Agent 是单向推送，无法查询画布上已有什么内容。

**场景需求**：
- Agent 想在现有内容旁边添加注释
- Agent 想根据已有 shapes 的位置，智能规避重叠

**期望功能**：
- `GET /api/canvas/shapes` 返回当前所有 shape 的 ID、类型、坐标、尺寸
- `GET /api/canvas/bounds` 返回画布的边界信息

---

## 🛠️ 如何新增模板

### 步骤 1：创建 Renderer

在 `src/templates/renderers/` 下新建 `your_template.ts`：

```typescript
import { createShapeId, toRichText } from '@tldraw/tlschema'
import type { InsertTemplateAction } from '../types'

type Editor = any

export function renderYourTemplate(
  editor: Editor,
  action: InsertTemplateAction,
): string[] {
  const ids: string[] = []
  const sid = () => {
    const id = createShapeId()
    ids.push(id)
    return id
  }

  const x = action.x
  const y = action.y
  const slots = action.slots as Record<string, any>

  // 使用 editor.createShape() 创建 shapes
  editor.createShape({
    id: sid(),
    type: 'geo',
    x,
    y,
    props: {
      geo: 'rectangle',
      w: 200,
      h: 100,
      color: 'blue',
      fill: 'semi',
      dash: 'draw',
      richText: toRichText(slots.title || ''),
    },
  })

  return ids
}
```

### 步骤 2：注册到 TemplateRegistry

在 `src/templates/TemplateRegistry.ts` 末尾添加：

```typescript
import { renderYourTemplate } from './renderers/your_template'

registerTemplate(
  {
    id: 'your_template',
    name: '你的模板名称',
    category: 'diagram',
    description: '模板用途说明',
    defaultSize: { w: 400, h: 300 },
    slots: [
      { name: 'title', type: 'text', required: true, defaultValue: '' },
      { name: 'items', type: 'list', required: false, defaultValue: [] },
    ],
    stylePresets: ['academic', 'minimal'],
    renderMode: 'tldraw-shapes',
  },
  renderYourTemplate,
)
```

### 步骤 3：更新文档

在 `public/agent.md` 和 `docs/AI_CODING_AGENT_GUIDE.md` 中添加新模板的说明。

### 步骤 4：测试

```bash
curl -X POST http://localhost:8787/api/commands \
  -H "Content-Type: application/json" \
  -d '{
    "type": "insert_template",
    "templateId": "your_template",
    "x": 100,
    "y": 100,
    "slots": {
      "title": "测试标题",
      "items": ["项目1", "项目2"]
    }
  }'
```

---

## 📚 Agent 接入指南

### 对于 Claude Code / Codex / Cursor Agent

1. **启动服务**  
   ```bash
   cd C:/Users/23108/Desktop/GoTim/draw/gotim-drawer
   npm run dev
   ```

2. **在浏览器打开画布**  
   访问 http://localhost:5173 或 5174

3. **在 Agent 中读取文档**  
   ```
   请先阅读：
   C:/Users/23108/Desktop/GoTim/draw/gotim-drawer/public/agent.md
   
   然后使用 GOTIM DRAWER 画一个二次函数讲解图。
   ```

4. **Agent 工作流**  
   - `GET /api/health` 确认画布已连接
   - `GET /api/capabilities` 读取可用命令和模板
   - 规划布局（坐标、尺寸）
   - `POST /api/commands/batch` 发送命令
   - 最后发送 `{"type":"zoomToFit"}`

### 对于自定义 Agent

参考 `docs/AI_CODING_AGENT_GUIDE.md` 中的完整协议说明。

核心原则：
- ✅ 优先使用 `insert_template` 而非自由绘制
- ✅ 批量发送命令（一次性规划完整布局）
- ✅ 结尾调用 `zoomToFit`
- ❌ 不要边画边改（坐标容易冲突）
- ❌ 不要在未获得允许时调用 `clear` 或 `scene`

---

## 🔧 故障排查

### 问题 1：画布没有内容

**症状**：发送命令后，API 返回 `ok: true`，但画布没有变化。

**排查步骤**：
1. 检查 `deliveredTo` 是否 >= 1
   ```bash
   curl http://localhost:8787/api/health
   ```
   如果 `clients: 0`，说明浏览器未连接 SSE
   
2. 刷新浏览器页面，确保顶部显示 "Agent API 已连接"

3. 检查浏览器控制台是否有 JavaScript 错误

### 问题 2：中文乱码

**症状**：画布上显示 `???` 或乱码字符。

**解决方案**：
- 使用文件方式发送命令，而非命令行内联 JSON
- 确保文件编码为 UTF-8（在 VSCode 中右下角可查看）

### 问题 3：端口被占用

**症状**：启动时提示 `Port 5173 is in use`。

**解决方案**：
- Vite 会自动尝试 5174、5175 等端口
- 查看启动日志中的 `Local: http://localhost:XXXX/`，使用实际端口

### 问题 4：Template 不生效

**症状**：发送 `insert_template` 后无反应。

**排查步骤**：
1. 检查浏览器控制台，查看是否有 `[Template] Unknown template "xxx"` 警告
2. 检查 `templateId` 拼写是否正确
3. 检查必填 slots 是否提供（会在控制台输出验证错误）

---

## 📞 联系与反馈

如有问题或建议，请通过以下方式反馈：

- GitHub Issues: （如果项目开源）
- 内部协作文档：（填写团队协作链接）
- 邮件：（填写联系邮箱）

---

## 📄 许可证

（根据项目实际情况填写，如 MIT / Apache 2.0 / 私有项目等）

---

## 🎉 致谢

- **tldraw** — 强大的无限画布引擎
- **Claude Code / Anthropic** — AI Agent 开发支持
- **React / Vite / TypeScript** — 现代前端工具链

---

**最后更新**：2026-06-15  
**项目版本**：0.1.0  
**文档维护者**：GoTim Team
