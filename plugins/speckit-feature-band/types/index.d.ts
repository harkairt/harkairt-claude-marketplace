export type DesktopPhase = 'specify' | 'plan' | 'tasks' | 'implement'

export type DesktopFileLink = { label: string; path: string }

export type DesktopPhasePart = { text: string; aside?: string; running: boolean; link?: DesktopFileLink }

export type DesktopPhaseLine = { feature: string; parts: DesktopPhasePart[] }

export type TerminalPhase = 'specify' | 'plan' | 'tasks' | 'implement'

export type TerminalFileLink = { label: string; path: string }

export type TerminalPhasePart = { text: string; aside?: string; running: boolean; link?: TerminalFileLink }

export type TerminalPhaseLine = { feature: string; parts: TerminalPhasePart[] }

declare module 'claude-code' {
  interface PluginState {
    'speckit-feature-band': {
      desktopPhase: DesktopPhaseLine | null
      desktopLive: DesktopPhase | null
      terminalPhase: TerminalPhaseLine | null
      terminalLive: TerminalPhase | null
    }
  }
}
