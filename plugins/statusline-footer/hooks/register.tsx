import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { GitLine, Limit, Usage, Workspace } from '../types'

import { commitsMark, gitMarkers, joinMarkers, resetLabel, shortenCwd, tildify, wholePercent } from './format'
import type { Hue } from './format'
import { firstLine, secondLine } from './line'
import type { Segment } from './line'

const REFRESH_MS = 60_000
const TRUNKS = ['main', 'master', 'develop']
// Text takes a color name or hex: the script's 38;5;208 and 38;5;240 as their xterm hex.
const COLORS: Readonly<Record<Hue, string>> = {
  white: 'white',
  red: 'red',
  green: 'green',
  yellow: 'yellow',
  orange: '#ff8700',
  gray: '#585858',
}

const workspace = atom({ plugin: 'statusline-footer', key: 'workspace' } as const, null)
const usage = atom({ plugin: 'statusline-footer', key: 'usage' } as const, null)
const model = atom({ plugin: 'statusline-footer', key: 'model' } as const, null)

function isSame(fresh: unknown, shown: unknown): boolean {
  return JSON.stringify(fresh) === JSON.stringify(shown)
}

async function git($: EngineInterface, cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { exitCode, stdout } = await $.process.run(['git', ...args], { cwd })

    return exitCode === 0 ? stdout.replace(/\n+$/, '') : ''
  } catch {
    return ''
  }
}

function ownCommitsArgs(branch: string): string[] {
  return ['rev-list', '--count', 'HEAD', `--exclude=${branch}`, '--not', '--branches', `--exclude=*/${branch}`, '--remotes']
}

async function readGit($: EngineInterface, cwd: string): Promise<GitLine | undefined> {
  const branch = await git($, cwd, ['branch', '--show-current'])
  if (branch === '') {
    return undefined
  }

  const [upstream, status, commits] = await Promise.all([
    git($, cwd, ['rev-parse', '--abbrev-ref', '@{u}']),
    git($, cwd, ['status', '--porcelain=v1', '--branch']),
    TRUNKS.includes(branch) ? '' : git($, cwd, ownCommitsArgs(branch)),
  ])
  const markers = joinMarkers(commitsMark(Number(commits)), gitMarkers(status))
  const isAtUpstream =
    upstream !== '' && (await git($, cwd, ['rev-parse', 'HEAD'])) === (await git($, cwd, ['rev-parse', '@{u}']))

  return isAtUpstream ? { branch, upstream, markers } : { branch, markers }
}

async function readPlan($: EngineInterface, home: string): Promise<string | undefined> {
  const dir = `${home}/.claude/plans`
  try {
    const [newest] = (await $.fs.list(dir))
      .filter(entry => !entry.name.startsWith('.'))
      .sort((a, b) => b.mtimeMs - a.mtimeMs || (a.name < b.name ? -1 : 1))
    if (newest === undefined) {
      return undefined
    }

    const { realPath } = await $.fs.stat(`${dir}/${newest.name}`, { resolve: true })

    return realPath === undefined ? undefined : tildify(realPath, home)
  } catch {
    return undefined
  }
}

async function readWorkspace($: EngineInterface): Promise<Workspace> {
  const home = (await $.env.get('HOME')) ?? ''
  const cwd = await $.session.cwd()
  const [gitLine, plan] = await Promise.all([readGit($, cwd), readPlan($, home)])

  return {
    cwd: shortenCwd(cwd, home),
    ...(gitLine === undefined ? {} : { git: gitLine }),
    ...(plan === undefined ? {} : { plan }),
  }
}

function limitOf(rateLimits: readonly SessionRateLimit[], kind: string, now: number, isDated: boolean): Limit {
  const found = rateLimits.find(limit => limit.kind === kind)

  return { percent: wholePercent(found?.percentUsed ?? 0), reset: resetLabel(found?.resetsAt, now, isDated) }
}

async function readUsage($: EngineInterface): Promise<Usage> {
  const { context, rateLimits } = await $.session.usage({ breakdown: 'summary' })
  const now = await $.clock.now()
  const last = context.breakdown?.apiUsage
  const tokens = last
    ? last.input_tokens + last.output_tokens + last.cache_read_input_tokens + last.cache_creation_input_tokens
    : context.tokens
  const hasReading = rateLimits.some(limit => limit.kind === 'five_hour' || limit.kind === 'seven_day')
  const limits = {
    current: limitOf(rateLimits, 'five_hour', now, false),
    weekly: limitOf(rateLimits, 'seven_day', now, true),
  }

  return {
    ...(tokens === undefined ? {} : { tokens }),
    window: context.window,
    ...(hasReading ? { limits } : {}),
  }
}

async function refreshWorkspace($: EngineInterface) {
  const fresh = await readWorkspace($)
  if (!isSame(fresh, await read($, workspace))) {
    await update($, workspace, () => fresh)
  }
}

async function refreshUsage($: EngineInterface) {
  const fresh = await readUsage($).catch(() => undefined)
  if (fresh !== undefined && !isSame(fresh, await read($, usage))) {
    await update($, usage, () => fresh)
  }
}

async function refreshModel($: EngineInterface, effort: string | undefined) {
  const fresh = { id: await $.session.model(), ...(effort === undefined ? {} : { effort }) }
  if (!isSame(fresh, await read($, model))) {
    await update($, model, () => fresh)
  }
}

async function refreshAll($: EngineInterface) {
  const shown = await read($, model)
  await Promise.all([refreshWorkspace($), refreshUsage($), refreshModel($, shown?.effort)])
}

function isPlain(segment: Segment): boolean {
  return segment.color === undefined && segment.isDim === undefined
}

function style(segment: Segment) {
  return {
    ...(segment.color === undefined ? {} : { color: COLORS[segment.color] }),
    ...(segment.isDim === undefined ? {} : { dimColor: true }),
  }
}

export const register: Register = on => {
  let poll: Timer | undefined

  on('session.start', async ($, e, next) => {
    const effort = await $.env.get('CLAUDE_EFFORT')
    await Promise.all([refreshWorkspace($), refreshUsage($), refreshModel($, effort)])
    poll?.cancel()
    poll = $.clock.every(REFRESH_MS, () => void refreshAll($))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (result.isReadOnly !== true) {
      void refreshWorkspace($)
    }

    return result
  })

  on('turn.complete', ($, e, next) => {
    void refreshWorkspace($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refreshUsage($)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await refreshModel($, typeof e.effort === 'string' ? e.effort : undefined)
    }

    return yield* next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    const [shownUsage, shownWorkspace, shownModel] = await Promise.all([
      read($, usage),
      read($, workspace),
      read($, model),
    ])
    const first = firstLine(shownUsage, shownWorkspace, shownModel)
    const second = secondLine(shownUsage)
    const rows = second === undefined ? [first] : [first, second]
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text>
            {row
              .filter(segment => segment.text !== '')
              .map(segment => (isPlain(segment) ? segment.text : <Text {...style(segment)}>{segment.text}</Text>))}
          </Text>
        ))}
      </Box>
    )
  })
}
