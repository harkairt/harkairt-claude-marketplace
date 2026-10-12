import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, FsStat, On, ProcessRunResult, SessionContextBreakdown, SessionUsage } from 'claude-code'

const PLUGIN = 'statusline-band'
const HOME = '/Users/me'
const PLANS = `${HOME}/.claude/plans`
const SURFACES = ['terminal', 'desktop'] as const
const ENGINE_HINT = '? for shortcuts'
const HINT_PROPS = { isDraft: false, isWorking: false, hint: ENGINE_HINT }
const ENGINE_BAND = { type: 'engine' as const, ref: 0 }
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const NOW = new Date(2026, 9, 12, 10, 0).getTime()
const LINE_1 =
  'at 51k/1m in ~/repos/app/src on origin/feature ⎇ 2 ~1?1 using Opus 5.5⁴ planned ~/dotfiles/claude/plans/new.md'
const LINE_2 = 'current(14:05): ●●●●◎○○○○○ 41% | weekly(oct 14): ●●◎○○○○○○○ 24%'

type Plan = { name: string; mtimeMs: number; realPath?: string }
type World = {
  cwd: string
  git: Record<string, string>
  plans: Plan[]
  usage: SessionUsage
  model: string
}

function feature(): World {
  return {
    cwd: `${HOME}/repos/app/src`,
    git: {
      'git branch --show-current': 'feature\n',
      'git rev-parse --abbrev-ref @{u}': 'origin/feature\n',
      'git rev-parse HEAD': 'c0ffee\n',
      'git rev-parse @{u}': 'c0ffee\n',
      'git status --porcelain=v1 --branch': '## feature...origin/feature\n M a.ts\n?? b.ts\n',
      'git rev-list --count HEAD --exclude=feature --not --branches --exclude=*/feature --remotes': '2\n',
    },
    plans: [
      { name: 'old.md', mtimeMs: 1000, realPath: `${HOME}/dotfiles/claude/plans/old.md` },
      { name: 'new.md', mtimeMs: 2000, realPath: `${HOME}/dotfiles/claude/plans/new.md` },
      { name: '.DS_Store', mtimeMs: 3000 },
    ],
    usage: {
      startedAt: 0,
      context: {
        tokens: 41_002,
        window: 1_000_000,
        percent: 4,
        breakdown: {
          apiUsage: {
            input_tokens: 2,
            output_tokens: 9_000,
            cache_read_input_tokens: 40_000,
            cache_creation_input_tokens: 1_000,
          },
        } as SessionContextBreakdown,
      },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 41, resetsAt: new Date(2026, 9, 12, 14, 5).toISOString() },
        { kind: 'seven_day', percentUsed: 23.5, resetsAt: new Date(2026, 9, 14, 7, 0).toISOString() },
      ],
    },
    model: 'claude-opus-5-5',
  }
}

function ran(exitCode: number, stdout: string): ProcessRunResult {
  return { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
}

function entry(plan: Plan): FsEntry {
  return { name: plan.name, kind: 'file', size: 1, mtimeMs: plan.mtimeMs, isLink: false }
}

function stat(plan: Plan, isResolved: boolean): FsStat {
  const stated: FsStat = { kind: 'file', size: 1, mtimeMs: plan.mtimeMs, isLink: false }

  return isResolved && plan.realPath !== undefined ? { ...stated, realPath: plan.realPath } : stated
}

function seat(on: On, world: World) {
  mock.env(on, { HOME, CLAUDE_EFFORT: 'xhigh' })
  on('session.cwd', () => ({ value: world.cwd }))
  on('session.model', () => ({ value: world.model }))
  on('session.usage', () => ({ value: world.usage }))
  on('process.run', ($, e) => {
    const stdout = world.git[e.argv.join(' ')]

    return { value: stdout === undefined ? ran(128, '') : ran(0, stdout) }
  })
  on('fs.list', ($, e) =>
    e.path === PLANS ? { value: world.plans.map(entry) } : { deny: `ENOENT: no such directory, ${e.path}` },
  )
  on('fs.stat', ($, e) => {
    const plan = world.plans.find(candidate => `${PLANS}/${candidate.name}` === e.path)

    return plan === undefined ? { deny: `ENOENT: no such file, ${e.path}` } : { value: stat(plan, e.resolve) }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'PromptHint' }, () => ({ type: 'Text', children: [ENGINE_HINT] }))
  on('ui.render', { component: 'AbovePrompt' }, () => ENGINE_BAND)

  return mock.clock(on, { now: NOW })
}

function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`)
}

function mountBand($: Engine, surface: 'terminal' | 'desktop' = 'terminal', props = BAND_PROPS) {
  return $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props })
}

type Drawing = Awaited<ReturnType<typeof mountBand>>

async function painted(ui: Drawing, text: string): Promise<[unknown, boolean]> {
  const found = await ui.find({ type: 'Text', text: exactly(text) })
  expect(found, `a Text drawing exactly "${text}"`).toBeDefined()

  return [found?.props.color, found?.props.dimColor === true]
}

async function rowCount(ui: Drawing): Promise<number> {
  const drawn = await ui.drawn()

  return 'children' in drawn ? (drawn.children?.length ?? 0) : 0
}

test('draws the status line in the band above the prompt on the terminal', async ($, on) => {
  const world = feature()
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect((await ui.drawn()).type).toBe('Box')
  expect(await rowCount(ui)).toBe(2)
  expect(await ui.find({ type: 'Text', text: exactly(LINE_1) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exactly(LINE_2) })).toBeDefined()
  await ui.unmount()
})

test('leaves the hint line under the prompt to the engine on every surface', async ($, on) => {
  const world = feature()
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'PromptHint', props: HINT_PROPS })

    expect(await ui.find({ type: 'Text', text: exactly(ENGINE_HINT) })).toBeDefined()
    expect(await ui.find({ text: /using/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('leaves the band to a survey while one holds it', async ($, on) => {
  const world = feature()
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($, 'terminal', { ...BAND_PROPS, hasSurvey: true })

  expect(await ui.drawn()).toEqual(ENGINE_BAND)
  await ui.unmount()
})

test(
  'keeps the band another plugin draws beneath, its own rows last',
  {
    plugins: [
      {
        name: 'other-band',
        tier: 'append',
        register(on) {
          on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['other band'] }))
        },
      },
    ],
  },
  async ($, on) => {
    const world = feature()
    seat(on, world)
    await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

    const ui = await mountBand($)

    const drawn = await ui.drawn()
    expect(await rowCount(ui)).toBe(3)
    expect('children' in drawn && drawn.children?.[0]).toEqual({ type: 'Text', props: {}, children: ['other band'] })
    expect(await ui.find({ type: 'Text', text: exactly(LINE_1) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exactly(LINE_2) })).toBeDefined()
    await ui.unmount()
  },
)

test('paints line 1 with the colors and dim parts of the script', async ($, on) => {
  const world = feature()
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect(await painted(ui, 'at')).toEqual([undefined, true])
  expect(await painted(ui, '51k')).toEqual(['yellow', false])
  expect(await painted(ui, '/1m')).toEqual(['#585858', false])
  expect(await painted(ui, ' in ')).toEqual([undefined, true])
  expect(await painted(ui, '~/repos/app/')).toEqual(['yellow', true])
  expect(await painted(ui, 'src')).toEqual(['yellow', false])
  expect(await painted(ui, ' on ')).toEqual([undefined, true])
  expect(await painted(ui, 'origin/')).toEqual(['yellow', true])
  expect(await painted(ui, 'feature')).toEqual(['yellow', false])
  expect(await painted(ui, ' ⎇ 2 ~1?1')).toEqual(['yellow', true])
  expect(await painted(ui, ' using ')).toEqual([undefined, true])
  expect(await painted(ui, 'Opus 5.5⁴')).toEqual(['yellow', false])
  expect(await painted(ui, ' planned')).toEqual([undefined, true])
  expect(await painted(ui, ' ~/dotfiles/claude/plans/new.md')).toEqual(['white', true])
  await ui.unmount()
})

test('paints line 2 with the colors and dim parts of the script', async ($, on) => {
  const world = feature()
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect(await painted(ui, 'current(')).toEqual([undefined, true])
  expect(await painted(ui, '14:05')).toEqual(['white', false])
  expect(await painted(ui, '):')).toEqual([undefined, true])
  expect(await painted(ui, '●●●●◎')).toEqual(['green', false])
  expect(await painted(ui, '○○○○○')).toEqual(['green', true])
  expect(await painted(ui, '41%')).toEqual(['white', false])
  expect(await painted(ui, '|')).toEqual([undefined, true])
  expect(await painted(ui, 'weekly(')).toEqual([undefined, true])
  expect(await painted(ui, 'oct 14')).toEqual(['white', false])
  expect(await painted(ui, '24%')).toEqual(['white', false])
  await ui.unmount()
})

test('paints the 256-color orange of the script as its hex', async ($, on) => {
  const world = feature()
  world.usage = {
    ...world.usage,
    context: {
      window: 200_000,
      breakdown: {
        apiUsage: { input_tokens: 110_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      } as SessionContextBreakdown,
    },
    rateLimits: [{ kind: 'five_hour', percentUsed: 75 }],
  }
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect(await painted(ui, '110k')).toEqual(['#ff8700', false])
  expect(await painted(ui, '/200k')).toEqual(['#585858', false])
  expect(await painted(ui, '●●●●●●●◉')).toEqual(['#ff8700', false])
  expect(await ui.find({ type: 'Text', text: exactly('current(): ●●●●●●●◉○○ 75% | weekly(): ○○○○○○○○○○ 0%') }))
    .toBeDefined()
  await ui.unmount()
})

test('leaves the band to the engine on the desktop', async ($, on) => {
  const world = feature()
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($, 'desktop')

  expect(await ui.drawn()).toEqual(ENGINE_BAND)
  await ui.unmount()
})

test('draws line 1 alone while no rate-limit window has a reading', async ($, on) => {
  const world = feature()
  world.usage = { ...world.usage, rateLimits: [] }
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect(await rowCount(ui)).toBe(1)
  expect(await ui.find({ type: 'Text', text: exactly(LINE_1) })).toBeDefined()
  expect(await ui.find({ text: /current\(|weekly\(/ })).toBeUndefined()
  await ui.unmount()
})

test('draws no quote line, even with a quotes file in place', async ($, on) => {
  const world = feature()
  seat(on, world)
  on('fs.read', () => ({ value: 'The obstacle is the way. – Marcus Aurelius\n' }))
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect(await rowCount(ui)).toBe(2)
  expect(await ui.find({ text: /Marcus Aurelius|–/ })).toBeUndefined()
  await ui.unmount()
})

test('follows a git or plan change on the minute timer', async ($, on) => {
  const world = feature()
  const clock = seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)
  world.git['git status --porcelain=v1 --branch'] = '## feature...origin/feature [ahead 1]\nM  a.ts\n'
  world.git['git rev-parse HEAD'] = 'beef\n'
  world.plans.push({ name: 'newer.md', mtimeMs: 5000, realPath: `${HOME}/.claude/plans/newer.md` })

  await clock.advance(59_999)

  expect(await ui.find({ type: 'Text', text: exactly(LINE_1) })).toBeDefined()

  await clock.advance(1)

  const changed = 'at 51k/1m in ~/repos/app/src on feature ⎇ 2⇡1 +1 using Opus 5.5⁴ planned ~/.claude/plans/newer.md'
  expect(await ui.find({ type: 'Text', text: exactly(changed) })).toBeDefined()
  await ui.unmount()
})

test('keeps the line as drawn while nothing it shows changes', async ($, on) => {
  let writes = 0
  on('state.set', ($, e, next) => {
    writes += 1

    return next(e)
  })
  const clock = seat(on, feature())
  await $.session.start({ cwd: `${HOME}/repos/app/src`, surface: 'terminal', isInteractive: true })
  const writesAtStart = writes

  await clock.advance(10 * 60_000)

  expect(writesAtStart).toBe(3)
  expect(writes).toBe(writesAtStart)
})

test('shows the weekly reset as HH:MM once it is a day away or less', async ($, on) => {
  const world = feature()
  world.usage = {
    ...world.usage,
    rateLimits: [{ kind: 'seven_day', percentUsed: 10, resetsAt: new Date(2026, 9, 13, 10, 30).toISOString() }],
  }
  const clock = seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)

  expect(await ui.find({ type: 'Text', text: /weekly\(oct 13\)/ })).toBeDefined()

  await clock.advance(31 * 60_000)

  expect(await ui.find({ type: 'Text', text: /weekly\(10:30\)/ })).toBeDefined()
  await ui.unmount()
})

test('follows a change a tool made as soon as the call returns', async ($, on) => {
  const world = feature()
  const clock = seat(on, world)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)
  world.git['git status --porcelain=v1 --branch'] = '## feature...origin/feature\nA  c.ts\n'

  await $.tool.call({ tool: 'Bash', command: 'git add c.ts' })
  await clock.settle()

  expect(await painted(ui, ' ⎇ 2 +1')).toEqual(['yellow', true])
  await ui.unmount()
})

test('reads nothing again after a read-only tool call', async ($, on) => {
  const world = feature()
  const clock = seat(on, world)
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: 'a.ts', stderr: '', interrupted: false },
    isReadOnly: true as const,
  }))
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)
  world.git['git status --porcelain=v1 --branch'] = '## feature...origin/feature\nA  c.ts\n'

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.settle()

  expect(await ui.find({ type: 'Text', text: exactly(LINE_1) })).toBeDefined()
  await ui.unmount()
})

test('follows a change once a turn completes', async ($, on) => {
  const world = feature()
  const clock = seat(on, world)
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)
  world.git['git branch --show-current'] = 'main\n'
  world.git['git rev-parse --abbrev-ref @{u}'] = 'origin/main\n'
  world.git['git status --porcelain=v1 --branch'] = '## main...origin/main\n'

  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(await ui.find({ type: 'Text', text: /^at 51k\/1m in ~\/repos\/app\/src on origin\/main using / })).toBeDefined()
  await ui.unmount()
})

test('follows the context fill and the limits once the session is measured', async ($, on) => {
  const world = feature()
  seat(on, world)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)
  const rateLimits = [
    { kind: 'five_hour', percentUsed: 92, resetsAt: new Date(2026, 9, 12, 14, 5).toISOString() },
    { kind: 'seven_day', percentUsed: 23.5, resetsAt: new Date(2026, 9, 14, 7, 0).toISOString() },
  ]
  world.usage = {
    ...world.usage,
    context: {
      tokens: 130_000,
      window: 1_000_000,
      breakdown: {
        apiUsage: { input_tokens: 0, output_tokens: 500, cache_read_input_tokens: 129_000, cache_creation_input_tokens: 1_000 },
      } as SessionContextBreakdown,
    },
    rateLimits,
  }

  await $.session.measure({ context: { tokens: 130_000, window: 1_000_000 }, rateLimits, changed: ['context', 'rateLimits'] })

  expect(await painted(ui, '131k')).toEqual(['red', false])
  expect(await ui.find({ type: 'Text', text: exactly('current(14:05): ●●●●●●●●●◎ 92% | weekly(oct 14): ●●◎○○○○○○○ 24%') }))
    .toBeDefined()
  await ui.unmount()
})

async function drain(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) {
    void chunk
  }
}

test('marks the effort the last main-loop request asked for', async ($, on) => {
  const world = feature()
  seat(on, world)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)

  await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 }))

  expect(await painted(ui, 'Opus 5.5²')).toEqual(['yellow', false])

  await drain(
    $.turn.step({ turnId: 't1', index: 1, model: 'claude-haiku-5-5', effort: 'low', messageCount: 1, agentId: 'a1' }),
  )

  expect(await painted(ui, 'Opus 5.5²')).toEqual(['yellow', false])
  await ui.unmount()
})

test('drops the effort mark for a request that names no effort', async ($, on) => {
  const world = feature()
  seat(on, world)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)

  await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }))

  expect(await painted(ui, 'Opus 5.5')).toEqual(['yellow', false])
  await ui.unmount()
})

test('leaves out the git part outside a repository and the plan path without plans', async ($, on) => {
  const world = feature()
  world.git = {}
  world.plans = []
  world.cwd = `${HOME}/notes`
  seat(on, world)
  await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($)

  expect(await ui.find({ type: 'Text', text: exactly('at 51k/1m in ~/notes using Opus 5.5⁴ planned') })).toBeDefined()
  expect(await painted(ui, '~/')).toEqual(['yellow', true])
  expect(await painted(ui, 'notes')).toEqual(['yellow', false])
  await ui.unmount()
})

for (const trunk of ['main', 'master', 'develop']) {
  test(`counts no own commits on ${trunk}`, async ($, on) => {
    const world = feature()
    world.git = {
      'git branch --show-current': `${trunk}\n`,
      'git status --porcelain=v1 --branch': `## ${trunk}\n?? a.ts\n`,
      [`git rev-list --count HEAD --exclude=${trunk} --not --branches --exclude=*/${trunk} --remotes`]: '5\n',
    }
    seat(on, world)
    await $.session.start({ cwd: world.cwd, surface: 'terminal', isInteractive: true })

    const ui = await mountBand($)

    expect(await ui.find({ type: 'Text', text: new RegExp(`on ${trunk} \\?1 using`) })).toBeDefined()
    await ui.unmount()
  })
}

test('draws the token part of line 1 before anything is read', async ($, on) => {
  seat(on, feature())

  const ui = await mountBand($)

  expect(await ui.find({ type: 'Text', text: exactly('at 0k/200k') })).toBeDefined()
  expect(await rowCount(ui)).toBe(1)
  await ui.unmount()
})
