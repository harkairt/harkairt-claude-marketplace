export type Phase = 'specify' | 'plan' | 'tasks' | 'implement'

export type PhasePart = { text: string; running: boolean }

export type PhaseLine = { feature: string; parts: PhasePart[] }

declare module 'claude-code' {
  interface PluginState {
    'speckit-feature-band': { phase: PhaseLine | null; live: Phase | null }
  }
}
