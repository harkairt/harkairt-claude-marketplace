export type FeatureLine = { key?: string; value: string }

declare module 'claude-code' {
  interface PluginState {
    'speckit-feature-band': { lines: FeatureLine[] }
  }
}
