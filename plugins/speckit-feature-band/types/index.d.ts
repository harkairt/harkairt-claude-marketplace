export type Phase = 'specify' | 'plan' | 'tasks' | 'implement'

export type FileLink = { label: string; path: string }

export type PhasePart = { text: string; aside?: string; running: boolean; link?: FileLink }

export type PhaseLine = { feature: string; parts: PhasePart[] }

declare module 'claude-code' {
  interface PluginState {
    'speckit-feature-band': { phase: PhaseLine | null; live: Phase | null }
  }
}
