/**
 * GOTIM DRAWER — TemplateRegistry
 * Maps templateId → TemplateDefinition + renderer.
 * Register new templates here by adding to the `templates` map.
 */

import type { TemplateDefinition, TemplateRenderer } from './types'
import { renderMathExplainerCard } from './renderers/math_explainer_card'
import { renderCoordinatePlot } from './renderers/coordinate_plot'
import { renderFlowchart } from './renderers/flowchart'
import { renderVerticalCalculation } from './renderers/vertical_calculation'

export type RegisteredTemplate = {
  def: TemplateDefinition
  render: TemplateRenderer
}

const templates = new Map<string, RegisteredTemplate>()

export function registerTemplate(
  def: TemplateDefinition,
  render: TemplateRenderer,
): void {
  if (templates.has(def.id)) {
    console.warn(`[TemplateRegistry] Overwriting template "${def.id}"`)
  }
  templates.set(def.id, { def, render })
}

export function getTemplate(id: string): RegisteredTemplate | undefined {
  return templates.get(id)
}

export function listTemplates(): TemplateDefinition[] {
  return Array.from(templates.values()).map((t) => t.def)
}

export function validateSlots(
  def: TemplateDefinition,
  slots: Record<string, unknown>,
): string[] {
  const errors: string[] = []
  for (const slot of def.slots) {
    const val = slots[slot.name]
    if (slot.required) {
      if (val === undefined || val === null || val === '') {
        errors.push(`Missing required slot "${slot.name}" (type: ${slot.type})`)
      }
    }
  }
  return errors
}

// ──────────────────────────────────────────
// Register built-in templates at import time
// ──────────────────────────────────────────

registerTemplate(
  {
    id: 'math_explainer_card',
    name: '数学讲题卡片',
    category: 'math',
    description: '结构化数学讲题卡片，包含标题、公式、步骤和结论',
    defaultSize: { w: 480, h: 540 },
    slots: [
      { name: 'title', type: 'text', required: true, defaultValue: '' },
      { name: 'formula', type: 'latex', required: true, defaultValue: '' },
      { name: 'keyIdea', type: 'text', required: false, defaultValue: '' },
      {
        name: 'steps',
        type: 'list',
        required: false,
        defaultValue: [],
      },
      { name: 'conclusion', type: 'text', required: false, defaultValue: '' },
    ],
    stylePresets: ['academic', 'summary', 'presentation'],
    renderMode: 'tldraw-shapes',
  },
  renderMathExplainerCard,
)

registerTemplate(
  {
    id: 'coordinate_plot',
    name: '函数图像坐标图',
    category: 'math',
    description: '平面直角坐标系 + 函数标注 (顶点/交点/对称轴/开口)',
    defaultSize: { w: 520, h: 480 },
    slots: [
      { name: 'title', type: 'text', required: true, defaultValue: '' },
      { name: 'formula', type: 'text', required: true, defaultValue: '' },
      { name: 'vertex', type: 'text', required: true, defaultValue: '' },
      { name: 'roots', type: 'list', required: false, defaultValue: [] },
      { name: 'axis', type: 'text', required: false, defaultValue: '' },
      { name: 'opening', type: 'text', required: true, defaultValue: '' },
    ],
    stylePresets: ['academic', 'minimal'],
    renderMode: 'tldraw-shapes',
  },
  renderCoordinatePlot,
)

registerTemplate(
  {
    id: 'flowchart',
    name: '流程图',
    category: 'diagram',
    description: '从节点和边生成可编辑流程图，支持水平或垂直方向',
    defaultSize: { w: 860, h: 220 },
    slots: [
      { name: 'title', type: 'text', required: false, defaultValue: '' },
      { name: 'direction', type: 'text', required: false, defaultValue: 'horizontal' },
      { name: 'nodes', type: 'list', required: true, defaultValue: [] },
      { name: 'edges', type: 'list', required: false, defaultValue: [] },
      { name: 'color', type: 'color', required: false, defaultValue: 'blue' },
    ],
    stylePresets: ['academic', 'presentation', 'minimal'],
    renderMode: 'tldraw-shapes',
  },
  renderFlowchart,
)

registerTemplate(
  {
    id: 'vertical_calculation',
    name: '竖式运算',
    category: 'math',
    description: '用于加减乘除的竖式、进位和结果展示',
    defaultSize: { w: 360, h: 320 },
    slots: [
      { name: 'title', type: 'text', required: false, defaultValue: '' },
      { name: 'operator', type: 'text', required: true, defaultValue: '+' },
      { name: 'rows', type: 'list', required: true, defaultValue: [] },
      { name: 'result', type: 'text', required: true, defaultValue: '' },
      { name: 'carries', type: 'list', required: false, defaultValue: [] },
    ],
    stylePresets: ['academic', 'minimal'],
    renderMode: 'tldraw-shapes',
  },
  renderVerticalCalculation,
)
