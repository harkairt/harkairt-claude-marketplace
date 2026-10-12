export type GitLine = { branch: string; upstream?: string; markers: string }
export type Workspace = { cwd: string; git?: GitLine; plan?: string }
export type Limit = { percent: number; reset: string }
export type Usage = {
  tokens?: number
  window: number
  cacheMinutes?: number
  limits?: { current: Limit; weekly: Limit }
}
export type Model = { id: string; effort?: string }

declare module 'claude-code' {
  interface PluginState {
    'statusline-band': {
      workspace: Workspace | null
      usage: Usage | null
      model: Model | null
      respondedAt: number | null
    }
  }
}
