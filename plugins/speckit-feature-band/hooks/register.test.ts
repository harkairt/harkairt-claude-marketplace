import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

const PLUGIN = 'speckit-feature-band'
const ROOT = '/repo'
const FEATURE_JSON = `${ROOT}/.specify/feature.json`
const FEATURE_DIR = `${ROOT}/specs/010-collapsible-sidebar`
const FEATURE = '{"feature_directory":"specs/010-collapsible-sidebar"}'
const SPEC = '# Feature Specification: Sidebar\n\n## User Scenarios\n'
const PLAN = '# Implementation Plan: Sidebar\n\n## Summary\n'
const TASKS = '- [x] T001 Set up\n- [X] T002 Add model\n- [ ] T003 Wire the view\n'
const SURFACES = ['terminal', 'desktop'] as const
const DONE_SPANS = {
  terminal: ['specified spec.md', 'planned plan.md', '010-'],
  desktop: ['specified', 'planned', '010-'],
}
const ENGINE_BAND = { type: 'engine' as const, ref: 0 }
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const WRITE_RESULT = {
  result: { type: 'update' as const, filePath: `${FEATURE_DIR}/tasks.md`, content: '', structuredPatch: [] },
}

function project(on: On, files: Record<string, string>, root = () => ROOT) {
  on('session.root', () => ({ value: root() }))
  on('fs.read', ($, e) => {
    const text = files[e.path]

    return text === undefined
      ? { deny: `ENOENT: no such file, ${e.path}` }
      : { value: text }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, () => ENGINE_BAND)
  on('tool.call', { tool: 'Write' }, () => WRITE_RESULT)
  on('skill.prompt', ($, e) => ({ text: e.text }))

  return mock.clock(on)
}

function inProgress(): Record<string, string> {
  return {
    [FEATURE_JSON]: FEATURE,
    [`${FEATURE_DIR}/spec.md`]: SPEC,
    [`${FEATURE_DIR}/plan.md`]: PLAN,
    [`${FEATURE_DIR}/tasks.md`]: TASKS,
  }
}

const OTHER_BAND = { type: 'Text', props: {}, children: ['other band'] }
const WITH_OTHER_BAND = {
  plugins: [
    {
      name: 'other-band',
      tier: 'append' as const,
      register(on: On) {
        on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', props: {}, children: ['other band'] }))
      },
    },
  ],
}

async function rowCount(ui: { drawn: () => Promise<RenderElement> }): Promise<number> {
  const drawn = await ui.drawn()

  return 'children' in drawn ? (drawn.children?.length ?? 0) : 0
}

type Texts = { findAll: (query: { type: string }) => Promise<{ text: string; props: Record<string, unknown> }[]> }

async function dimSpans(ui: Texts) {
  const texts = await ui.findAll({ type: 'Text' })

  return texts.filter(text => text.props.dimColor === true).map(text => text.text)
}

async function doneSpans(ui: Texts) {
  const texts = await ui.findAll({ type: 'Text' })

  return texts.filter(text => text.props.dimColor === true).map(text => text.text)
}

async function dimOf(ui: Texts, text: string) {
  const texts = await ui.findAll({ type: 'Text' })
  const span = texts.find(candidate => candidate.text === text)
  expect(span).toBeDefined()

  return span?.props.dimColor
}

async function fileLinks(ui: Texts) {
  const links = await ui.findAll({ type: 'Link' })

  return links.map(link => link.props)
}

async function fileButtons(ui: Texts) {
  const buttons = await ui.findAll({ type: 'Button' })

  return buttons.map(button => button.props)
}

async function mountBand($: Engine, surface: (typeof SURFACES)[number]) {
  return $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: BAND_PROPS })
}

async function write($: Engine, path: string) {
  await $.tool.call({ tool: 'Write', file_path: path, content: '' })
}

test('shows only implementing with its counter, all bright, with the feature', async ($, on) => {
  project(on, inProgress())
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    const row = await ui.find({ text: 'implementing (2/3) tasks.md 010-collapsible-sidebar' })
    expect(row).toBeDefined()
    expect(row?.props.dimColor).toBeUndefined()
    expect(await dimSpans(ui)).toEqual(['010-'])
    expect(await rowCount(ui)).toBe(1)
    await ui.unmount()
  }
})

test('lists the done phases dim, the feature bright, while nothing runs', async ($, on) => {
  project(on, { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC, [`${FEATURE_DIR}/plan.md`]: PLAN })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    expect(await ui.find({ text: 'specified spec.md, planned plan.md 010-collapsible-sidebar' })).toBeDefined()
    expect(await doneSpans(ui)).toEqual(DONE_SPANS[surface])
    expect(await dimSpans(ui)).toEqual(DONE_SPANS[surface])
    expect(await dimOf(ui, 'collapsible-sidebar')).toBeUndefined()
    await ui.unmount()
  }
})

test('shows the feature alone, bright, while no phase has started', async ($, on) => {
  project(on, { [FEATURE_JSON]: FEATURE })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    const row = await ui.find({ text: '010-collapsible-sidebar' })
    expect(row).toBeDefined()
    expect(await dimSpans(ui)).toEqual(['010-'])
    expect((await ui.findAll({ type: 'Text' })).find(span => span.text === '010-')?.props).toEqual({ dimColor: true, color: 'inactive' })
    expect(await dimOf(ui, 'collapsible-sidebar')).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /specif|plann|task|implement/ })).toBeUndefined()
    expect(await rowCount(ui)).toBe(1)
    await ui.unmount()
  }
})

test('shows implemented alone, bright, once every task is ticked', async ($, on) => {
  project(on, { ...inProgress(), [`${FEATURE_DIR}/tasks.md`]: '- [x] T001 Set up\n' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  const ui = await mountBand($, 'terminal')

  expect(await ui.find({ text: 'implemented tasks.md 010-collapsible-sidebar' })).toBeDefined()
  expect(await dimSpans(ui)).toEqual(['010-'])
  await ui.unmount()
})

const SPEC_LINK = { href: `file://${FEATURE_DIR}/spec.md`, label: 'spec.md' }
const PLAN_LINK = { href: `file://${FEATURE_DIR}/plan.md`, label: 'plan.md' }
const TASKS_LINK = { href: `file://${FEATURE_DIR}/tasks.md`, label: 'tasks.md' }

test('names the file of each done stage after its text, dim with it: a link on the terminal, a button on desktop', async ($, on) => {
  project(on, { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC, [`${FEATURE_DIR}/plan.md`]: PLAN })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const links = { terminal: [SPEC_LINK, PLAN_LINK], desktop: [] }
  const buttons = {
    terminal: [],
    desktop: [
      { key: 'open:spec.md', label: 'spec.md', plain: true, dimColor: true },
      { key: 'open:plan.md', label: 'plan.md', plain: true, dimColor: true },
    ],
  }

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    expect(await ui.find({ text: 'specified spec.md, planned plan.md 010-collapsible-sidebar' })).toBeDefined()
    expect(await dimSpans(ui)).toEqual(DONE_SPANS[surface])
    expect(await fileLinks(ui)).toEqual(links[surface])
    expect(await fileButtons(ui)).toEqual(buttons[surface])
    await ui.unmount()
  }
})

test('names tasks.md after implementing, bright with it: a link on the terminal, a button on desktop', async ($, on) => {
  project(on, inProgress())
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const links = { terminal: [TASKS_LINK], desktop: [] }
  const buttons = { terminal: [], desktop: [{ key: 'open:tasks.md', label: 'tasks.md', plain: true, dimColor: false }] }

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    expect(await ui.find({ text: 'implementing (2/3) tasks.md 010-collapsible-sidebar' })).toBeDefined()
    expect(await dimSpans(ui)).toEqual(['010-'])
    expect(await fileLinks(ui)).toEqual(links[surface])
    expect(await fileButtons(ui)).toEqual(buttons[surface])
    await ui.unmount()
  }
})

test('shows a live stage without a file name until its file exists, then links it', async ($, on) => {
  const files: Record<string, string> = { [FEATURE_JSON]: FEATURE }
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($, 'terminal')

  await $.skill.prompt({ skill: 'speckit-specify', text: 'spec it' })
  await clock.settle()
  expect(await ui.find({ text: 'specifying 010-collapsible-sidebar' })).toBeDefined()
  expect(await fileLinks(ui)).toEqual([])

  files[`${FEATURE_DIR}/spec.md`] = '# Feature Specification: [FEATURE NAME]'
  await write($, `${FEATURE_DIR}/spec.md`)
  await clock.settle()
  expect(await ui.find({ text: 'specifying spec.md 010-collapsible-sidebar' })).toBeDefined()
  expect(await fileLinks(ui)).toEqual([SPEC_LINK])
  await ui.unmount()
})

type Host = { os?: string; uname?: string; exitCode?: number; deny?: string }

function host(on: On, { os, uname = 'Darwin\n', exitCode = 0, deny }: Host = {}) {
  const runs: string[][] = []
  const toasts: string[] = []
  mock.env(on, os === undefined ? {} : { OS: os })
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (deny !== undefined) {
      return { deny }
    }
    const isUname = e.argv[0] === 'uname'

    return {
      value: {
        exitCode: isUname ? 0 : exitCode,
        stdout: isUname ? uname : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  return { runs, toasts }
}

async function pressSpec($: Engine) {
  const ui = await mountBand($, 'desktop')
  await ui.press({ key: 'open:spec.md' })
  await ui.unmount()
}

for (const [name, setup, opener] of [
  ['open on macOS', { uname: 'Darwin\n' }, ['open']],
  ['xdg-open on Linux', { uname: 'Linux\n' }, ['xdg-open']],
] as const) {
  test(`opens the file a desktop button names with ${name}, its absolute path one argument`, async ($, on) => {
    project(on, { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC })
    const { runs, toasts } = host(on, setup)
    await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

    await pressSpec($)

    expect(runs).toEqual([['uname', '-s'], [...opener, `${FEATURE_DIR}/spec.md`]])
    expect(toasts).toEqual([])
  })
}

test('opens the file with start through cmd on Windows, asking no uname', async ($, on) => {
  project(on, { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC })
  const { runs, toasts } = host(on, { os: 'Windows_NT' })
  await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

  await pressSpec($)

  expect(runs).toEqual([['cmd', '/c', 'start', '', `${FEATURE_DIR}/spec.md`]])
  expect(toasts).toEqual([])
})

for (const [name, setup] of [
  ['the opener exits non-zero', { exitCode: 1 }],
  ['the host runs no process', { deny: 'no process on this host' }],
] as const) {
  test(`raises a toast naming the file when ${name}`, async ($, on) => {
    project(on, { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC })
    const { toasts } = host(on, setup)
    await $.session.start({ cwd: ROOT, surface: 'desktop', isInteractive: true })

    await pressSpec($)

    expect(toasts).toEqual(['Could not open spec.md'])
  })
}

test('leaves the band to the survey while one holds it', async ($, on) => {
  project(on, inProgress())
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: { ...BAND_PROPS, hasSurvey: true },
    })

    expect(await ui.drawn()).toEqual(ENGINE_BAND)
    expect(await ui.find({ text: /010-collapsible-sidebar/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('follows the feature files once a Write tool call returns', async ($, on) => {
  const files: Record<string, string> = { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC }
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($, 'terminal')
  expect(await ui.find({ text: 'specified spec.md 010-collapsible-sidebar' })).toBeDefined()
  files[`${FEATURE_DIR}/plan.md`] = PLAN

  await write($, `${FEATURE_DIR}/plan.md`)
  await clock.settle()

  expect(await ui.find({ text: 'specified spec.md, planned plan.md 010-collapsible-sidebar' })).toBeDefined()
  await ui.unmount()
})

test('follows files changed outside the session within a minute', async ($, on) => {
  const files: Record<string, string> = { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC }
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($, 'terminal')
  files[`${FEATURE_DIR}/plan.md`] = PLAN

  await clock.advance(59_000)
  expect(await ui.find({ text: 'specified spec.md 010-collapsible-sidebar' })).toBeDefined()

  await clock.advance(1000)
  expect(await ui.find({ text: 'specified spec.md, planned plan.md 010-collapsible-sidebar' })).toBeDefined()
  await ui.unmount()
})

test('follows the feature files once a prompt is submitted', async ($, on) => {
  const files: Record<string, string> = { [FEATURE_JSON]: FEATURE }
  const clock = project(on, files)
  on('prompt.submit', ($, e) => ({ text: e.text }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($, 'terminal')
  files[`${FEATURE_DIR}/spec.md`] = SPEC

  await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
  await clock.settle()

  expect(await ui.find({ text: 'specified spec.md 010-collapsible-sidebar' })).toBeDefined()
  await ui.unmount()
})

test('shows the phase a speckit skill runs as running until its done marker appears', async ($, on) => {
  const files: Record<string, string> = { [FEATURE_JSON]: FEATURE, [`${FEATURE_DIR}/spec.md`]: SPEC }
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($, 'terminal')

  await $.skill.prompt({ skill: 'foo:speckit-plan', text: 'plan it' })
  await clock.settle()
  expect(await ui.find({ text: 'specified spec.md, planning 010-collapsible-sidebar' })).toBeDefined()
  expect(await doneSpans(ui)).toEqual(['specified spec.md', '010-'])
  expect(await dimSpans(ui)).toEqual(['specified spec.md', '010-'])

  files[`${FEATURE_DIR}/plan.md`] = PLAN
  await write($, `${FEATURE_DIR}/plan.md`)
  await clock.settle()
  expect(await ui.find({ text: 'specified spec.md, planned plan.md 010-collapsible-sidebar' })).toBeDefined()
  await ui.unmount()
})

test('moves the live phase to the speckit skill that fires last', async ($, on) => {
  const clock = project(on, { [FEATURE_JSON]: FEATURE })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ui = await mountBand($, 'terminal')

  await $.skill.prompt({ skill: 'speckit-specify', text: 'spec it' })
  await $.skill.prompt({ skill: 'speckit-tasks', text: 'task it' })
  await clock.settle()

  expect(await ui.find({ text: 'tasking 010-collapsible-sidebar' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /specifying/ })).toBeUndefined()
  await ui.unmount()
})

test('passes every skill prompt through unchanged', async ($, on) => {
  project(on, { [FEATURE_JSON]: FEATURE })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  expect(await $.skill.prompt({ skill: 'speckit-plan', text: 'plan it' })).toEqual({ text: 'plan it' })
  expect(await $.skill.prompt({ skill: 'commit', text: 'commit it' })).toEqual({ text: 'commit it' })
})

test('keeps the band as drawn while the feature files stay the same', async ($, on) => {
  let writes = 0
  on('state.set', ($, e, next) => {
    writes += 1

    return next(e)
  })
  const clock = project(on, inProgress())
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const writesAtStart = writes

  await write($, `${FEATURE_DIR}/tasks.md`)
  await clock.advance(10_000)

  expect(writes).toBe(writesAtStart)
})

test('gives the band back to the engine once feature.json is removed', async ($, on) => {
  const files = inProgress()
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  delete files[FEATURE_JSON]

  await write($, FEATURE_JSON)
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    expect(await ui.drawn()).toEqual(ENGINE_BAND)
    await ui.unmount()
  }
})

test('follows the project root when it moves', async ($, on) => {
  let root = ROOT
  const other = '/other'
  const files = {
    ...inProgress(),
    [`${other}/.specify/feature.json`]: '{"feature_directory":"specs/020-other"}',
    [`${other}/specs/020-other/spec.md`]: SPEC,
  }
  const clock = project(on, files, () => root)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  root = other
  await write($, `${other}/specs/020-other/spec.md`)
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    expect(await ui.find({ text: 'specified spec.md 020-other' })).toBeDefined()
    await ui.unmount()
  }
})

for (const [name, text] of [
  ['missing', undefined],
  ['blank', ' \n\t \n'],
  ['not JSON', 'specs/010-x, not json'],
  ['without a feature_directory string', '{"feature_directory":10}'],
] as const) {
  test(`leaves the band to the engine when feature.json is ${name}`, async ($, on) => {
    project(on, text === undefined ? {} : { [FEATURE_JSON]: text })
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

    for (const surface of SURFACES) {
      const ui = await mountBand($, surface)

      expect(await ui.drawn()).toEqual(ENGINE_BAND)
      await ui.unmount()
    }
  })
}

test('keeps the band another plugin draws beneath, its own line after it', WITH_OTHER_BAND, async ($, on) => {
  project(on, inProgress())
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    const drawn = await ui.drawn()
    expect(await rowCount(ui)).toBe(2)
    expect('children' in drawn && drawn.children?.[0]).toEqual(expect.objectContaining(OTHER_BAND))
    expect(await ui.find({ text: 'implementing (2/3) tasks.md 010-collapsible-sidebar' })).toBeDefined()
    await ui.unmount()
  }
})

test('hands the band beneath on unchanged with nothing of its own to show', WITH_OTHER_BAND, async ($, on) => {
  project(on, {})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)

    expect(await ui.drawn()).toEqual(expect.objectContaining(OTHER_BAND))
    await ui.unmount()
  }
})
