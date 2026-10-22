import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import type { FileLink, Phase, PhaseLine, PhasePart } from '../types'
import { openOnHost } from './opener'
import { detectPhases, fileUrl, formatPhaseLine, isFinished, phaseLinks, phaseOfSkill, splitFeature } from './phase'

const WRITING_TOOLS = /^(Write|Edit|MultiEdit|NotebookEdit|Bash)$/
const POLL_MS = 60_000
const NBSP = String.fromCharCode(0xa0)
const BETWEEN_STAGES = `-${NBSP}${NBSP}`
const phase = atom({ plugin: 'speckit-feature-band', key: 'phase' } as const, null)
const live = atom({ plugin: 'speckit-feature-band', key: 'live' } as const, null)

async function readFile($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

function featureDirectory(text: string | undefined): string | undefined {
  if (text === undefined || text.trim() === '') {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined
    }
    const directory = (parsed as Record<string, unknown>).feature_directory

    return typeof directory === 'string' && directory.trim() !== '' ? directory.trim() : undefined
  } catch {
    return undefined
  }
}

async function readPhaseLine($: EngineInterface, livePhase: Phase | null): Promise<PhaseLine | null> {
  // Not cwd(): a Bash `cd` into a subfolder moves cwd away from .specify/.
  const root = await $.session.root()
  const directory = featureDirectory(await readFile($, `${root}/.specify/feature.json`))
  if (directory === undefined) {
    return null
  }

  const folder = `${root}/${directory}`
  const [spec, plan, tasks] = await Promise.all([
    readFile($, `${folder}/spec.md`),
    readFile($, `${folder}/plan.md`),
    readFile($, `${folder}/tasks.md`),
  ])
  const feature = directory.split('/').filter(segment => segment !== '').at(-1) ?? directory
  const files = { spec, plan, tasks }

  return formatPhaseLine(detectPhases(files), livePhase, feature, phaseLinks(folder, files))
}

function isEngineBand(tree: RenderElement): boolean {
  return tree.type === 'engine'
}

async function openFile($: EngineInterface, link: FileLink) {
  if (!(await openOnHost($, link.path))) {
    $.ui.toast(`Could not open ${link.label}`)
  }
}

async function refresh($: EngineInterface) {
  try {
    await sync($)
  } catch {
    return
  }
}

async function sync($: EngineInterface) {
  const livePhase = await read($, live)
  const fresh = await readPhaseLine($, livePhase)
  const shown = await read($, phase)
  if (JSON.stringify(fresh) !== JSON.stringify(shown)) {
    await update($, phase, () => fresh)
  }
  const liveDone = fresh !== null && fresh.parts.every(part => !part.running)
  if (livePhase !== null && liveDone) {
    await update($, live, () => null)
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

  on('skill.prompt', async ($, e, next) => {
    const started = phaseOfSkill(e.skill)
    if (started !== undefined) {
      if ((await read($, live)) !== started) {
        await update($, live, () => started)
      }
      await refresh($)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await refresh($)

    return next(e)
  })

  on('tool.call', { tool: WRITING_TOOLS }, async ($, e, next) => {
    const result = await next(e)
    await refresh($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const shown = await read($, phase)
    if (shown === null) {
      return next(e)
    }

    const beneath = await next(e)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const bright = isFinished(shown)
    const last = shown.parts.length - 1
    const feature = splitFeature(shown.feature)
    const isDim = (part: PhasePart) => !part.running && !bright
    const separator = (index: number) => (index < last ? BETWEEN_STAGES : [<Text dimColor>of</Text>, NBSP])
    const featureName = [
      feature.id !== '' && <Text dimColor color="inactive">{feature.id}</Text>,
      <Text>{feature.name}</Text>,
    ]
    const stage = (part: PhasePart) => {
      const text = part.aside === undefined ? part.text : `${part.text} ${part.aside}`

      return part.link === undefined ? text : `${text} [${part.link.label}](${fileUrl(part.link.path)})`
    }
    const markdown =
      shown.parts.length === 0 ? shown.feature : `${shown.parts.map(stage).join(BETWEEN_STAGES)} of${NBSP}${shown.feature}`
    const button = (file: FileLink, dim: boolean) => (
      <Button key={`open:${file.label}`} label={file.label} plain dimColor={dim} onPress={() => openFile($, file)} />
    )

    // Desktop draws a file: link as plain text, so it gets Buttons; the terminal opens Markdown links as it opens a reply's.
    const line =
      e.surface === 'terminal' ? (
        <Markdown text={markdown} />
      ) : (
        <Box flexDirection="row" flexWrap="wrap">
          {shown.parts.map((part, index) => [
            isDim(part) ? <Text dimColor>{part.text}</Text> : <Text>{part.text}</Text>,
            ...(part.aside === undefined ? [] : [' ', <Text dimColor color="inactive">{part.aside}</Text>]),
            ...(part.link === undefined ? [] : [' ', button(part.link, isDim(part))]),
            separator(index),
          ])}
          {featureName}
        </Box>
      )

    return (
      <Box flexDirection="column">
        {!isEngineBand(beneath) && beneath}
        {line}
      </Box>
    )
  })
}
