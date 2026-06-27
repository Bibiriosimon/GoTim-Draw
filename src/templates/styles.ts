/**
 * GOTIM DRAWER — Style presets
 * Tldraw-native colour palette. No high-saturation AI colours.
 */

export const STYLE_PRESETS: Record<string, {
  primary: string
  secondary: string
  accent: string
  background: string
  border: string
  fill: 'none' | 'semi' | 'solid'
  dash: 'draw' | 'solid' | 'dashed' | 'dotted'
}> = {
  /** Clean blue-grey – math & diagrams */
  academic: {
    primary: 'blue',
    secondary: 'grey',
    accent: 'violet',
    background: 'grey',
    border: 'grey',
    fill: 'semi',
    dash: 'draw',
  },
  /** Green – summary, conclusion */
  summary: {
    primary: 'green',
    secondary: 'light-green',
    accent: 'green',
    background: 'green',
    border: 'green',
    fill: 'semi',
    dash: 'solid',
  },
  /** Violet – presentation, emphasis */
  presentation: {
    primary: 'violet',
    secondary: 'light-violet',
    accent: 'violet',
    background: 'violet',
    border: 'violet',
    fill: 'semi',
    dash: 'solid',
  },
  /** Black & grey – formal, minimal */
  minimal: {
    primary: 'black',
    secondary: 'grey',
    accent: 'black',
    background: 'grey',
    border: 'grey',
    fill: 'none',
    dash: 'solid',
  },
}
