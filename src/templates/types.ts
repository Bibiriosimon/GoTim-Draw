/** GOTIM DRAWER — Template Engine types */

export type TemplateCategory =
  | 'math'
  | 'diagram'
  | 'slide'
  | 'chess'
  | 'artifact'
  | 'research'
  | 'ui'

export type TemplateSlotType =
  | 'text'
  | 'latex'
  | 'number'
  | 'color'
  | 'icon'
  | 'list'
  | 'object'
  | 'mermaid'
  | 'html'

export type TemplateSlot = {
  name: string
  type: TemplateSlotType
  required: boolean
  defaultValue?: unknown
}

export type TemplateRenderMode =
  | 'tldraw-shapes'
  | 'custom-shape'
  | 'svg'
  | 'iframe'

export type TemplateDefinition = {
  id: string
  name: string
  category: TemplateCategory
  description: string
  defaultSize: { w: number; h: number }
  slots: TemplateSlot[]
  stylePresets: string[]
  renderMode: TemplateRenderMode
}

export type InsertTemplateAction = {
  type: 'insert_template'
  templateId: string
  x: number
  y: number
  w?: number
  h?: number
  stylePreset?: string
  slots: Record<string, unknown>
  /** filled in after execution */
  _createdIds?: string[]
}

export interface TemplateRenderer {
  (editor: unknown, action: InsertTemplateAction): string[]
}
