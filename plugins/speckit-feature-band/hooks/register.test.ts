import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

const PLUGIN = 'speckit-feature-band'
const ROOT = '/repo'
const FEATURE_JSON = `${ROOT}/.specify/feature.json`
const SURFACES = ['terminal', 'desktop'] as const
const ENGINE_BAND = { type: 'engine' as const, ref: 0 }
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
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

  return mock.clock(on)
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

test('shows each field of feature.json as key: value', async ($, on) => {
  project(on, { [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    const row = await ui.find({ type: 'Text', text: 'feature_directory: specs/010-x' })
    const key = await ui.find({ type: 'Text', text: /^feature_directory: $/ })
    expect(row).toBeDefined()
    expect(key?.props.dimColor).toBe(true)
    expect(await rowCount(ui)).toBe(1)
    await ui.unmount()
  }
})

test('shows one row per field, values that are not strings as JSON', async ($, on) => {
  project(on, {
    [FEATURE_JSON]: '{"feature_directory":"specs/010-x","number":10,"tags":["ui","sidebar"]}',
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    const keys = await ui.findAll({ type: 'Text', text: /^\w+: $/ })
    expect(keys.map(key => key.text)).toEqual(['feature_directory: ', 'number: ', 'tags: '])
    expect(await ui.find({ type: 'Text', text: /^number: 10$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^tags: \["ui","sidebar"\]$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('shows the text of a JSON value that is not an object', async ($, on) => {
  project(on, { [FEATURE_JSON]: ' ["specs/010-x"]\n' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    const texts = await ui.findAll({ type: 'Text' })
    expect(texts.map(text => text.text)).toEqual(['["specs/010-x"]'])
    await ui.unmount()
  }
})

test('shows the trimmed text when feature.json is not JSON', async ($, on) => {
  project(on, { [FEATURE_JSON]: '  \n specs/010-x, not json \n\n' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    const texts = await ui.findAll({ type: 'Text' })
    expect(texts.map(text => text.text)).toEqual(['specs/010-x, not json'])
    await ui.unmount()
  }
})

test('leaves the band to the survey while one holds it', async ($, on) => {
  project(on, { [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: { ...BAND_PROPS, hasSurvey: true },
    })

    expect(await ui.drawn()).toEqual(ENGINE_BAND)
    expect(await ui.find({ text: 'specs/010-x' })).toBeUndefined()
    await ui.unmount()
  }
})

test('follows feature.json as it changes', async ($, on) => {
  const files = { [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}' }
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })
    const next = `specs/011-${surface}`
    files[FEATURE_JSON] = JSON.stringify({ feature_directory: next })

    await clock.advance(2000)

    expect(await ui.find({ type: 'Text', text: next })).toBeDefined()
    await ui.unmount()
  }
})

test('keeps the band as drawn while feature.json stays the same', async ($, on) => {
  let writes = 0
  on('state.set', ($, e, next) => {
    writes += 1

    return next(e)
  })
  const clock = project(on, { [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const writesAtStart = writes

  await clock.advance(10_000)

  expect(writes).toBe(writesAtStart)
})

test('shows feature.json once it is created', async ($, on) => {
  const files: Record<string, string> = {}
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })
    const created = `specs/012-${surface}`
    files[FEATURE_JSON] = JSON.stringify({ feature_directory: created })

    await clock.advance(2000)

    expect(await ui.find({ type: 'Text', text: created })).toBeDefined()
    delete files[FEATURE_JSON]
    await clock.advance(2000)
    await ui.unmount()
  }
})

test('gives the band back to the engine once feature.json is removed', async ($, on) => {
  const files: Record<string, string> = {
    [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}',
  }
  const clock = project(on, files)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  delete files[FEATURE_JSON]

  await clock.advance(2000)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.drawn()).toEqual(ENGINE_BAND)
    await ui.unmount()
  }
})

test('follows the project root when it moves', async ($, on) => {
  let root = ROOT
  const other = '/other'
  const files = {
    [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}',
    [`${other}/.specify/feature.json`]: '{"feature_directory":"specs/020-other"}',
  }
  const clock = project(on, files, () => root)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  root = other
  await clock.advance(2000)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.find({ type: 'Text', text: 'specs/020-other' })).toBeDefined()
    await ui.unmount()
  }
})

test('leaves the band to the engine when feature.json is missing', async ($, on) => {
  project(on, {})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.drawn()).toEqual(ENGINE_BAND)
    await ui.unmount()
  }
})

test('leaves the band to the engine when feature.json is blank', async ($, on) => {
  project(on, { [FEATURE_JSON]: ' \n\t \n' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.drawn()).toEqual(ENGINE_BAND)
    await ui.unmount()
  }
})

test('keeps the band another plugin draws beneath, its own lines after it', WITH_OTHER_BAND, async ($, on) => {
  project(on, { [FEATURE_JSON]: '{"feature_directory":"specs/010-x"}' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    const drawn = await ui.drawn()
    expect(await rowCount(ui)).toBe(2)
    expect('children' in drawn && drawn.children?.[0]).toEqual(expect.objectContaining(OTHER_BAND))
    expect(await ui.find({ type: 'Text', text: 'feature_directory: specs/010-x' })).toBeDefined()
    await ui.unmount()
  }
})

test('hands the band beneath on unchanged with nothing of its own to show', WITH_OTHER_BAND, async ($, on) => {
  project(on, {})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface,
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.drawn()).toEqual(expect.objectContaining(OTHER_BAND))
    await ui.unmount()
  }
})
