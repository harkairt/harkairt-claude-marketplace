import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FeatureLine } from '../types'

const POLL_MS = 2000
const lines = atom({ plugin: 'speckit-feature-band', key: 'lines' } as const, [])

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text)

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function toLines(text: string): FeatureLine[] {
  const trimmed = text.trim()
  if (trimmed === '') {
    return []
  }

  const object = parseObject(trimmed)
  if (object === undefined) {
    return [{ value: trimmed }]
  }

  return Object.entries(object).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }))
}

async function readFeature($: EngineInterface): Promise<string> {
  try {
    // Not cwd(): a Bash `cd` into a subfolder moves cwd away from .specify/.
    const root = await $.session.root()

    return await $.fs.read(`${root}/.specify/feature.json`)
  } catch {
    return ''
  }
}

async function refresh($: EngineInterface) {
  const fresh = toLines(await readFeature($))
  const shown = await read($, lines)
  if (JSON.stringify(fresh) !== JSON.stringify(shown)) {
    await update($, lines, () => fresh)
  }
}

export const register: Register = on => {
  let poll: Timer | undefined

  on('session.start', async ($, e, next) => {
    await refresh($)
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => void refresh($))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const shown = await read($, lines)
    if (shown.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {shown.map(line => (
          <Text>
            {line.key !== undefined && <Text dimColor>{line.key}: </Text>}
            {line.value}
          </Text>
        ))}
      </Box>
    )
  })
}
