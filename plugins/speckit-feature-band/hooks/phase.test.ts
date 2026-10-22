import { describe, expect, test } from 'claude-code/testing'

import { detectPhases, fileUrl, formatPhaseLine, phaseLinks, phaseOfSkill, splitFeature } from './phase'
import type { Detection } from './phase'

const FOLDER = '/repo/specs/010-x'
const SPEC_LINK = { label: 'spec.md', path: '/repo/specs/010-x/spec.md' }
const PLAN_LINK = { label: 'plan.md', path: '/repo/specs/010-x/plan.md' }
const TASKS_LINK = { label: 'tasks.md', path: '/repo/specs/010-x/tasks.md' }

const SPEC = '# Feature Specification: Sidebar\n\n## User Scenarios\n'
const PLAN = '# Implementation Plan: Sidebar\n\n## Summary\n'
const TASKS = '## Phase 1\n\n- [x] T001 Set up\n- [X] T002 Add model\n  - [ ] T003 Wire the view\n'
const TASKS_ALL_DONE = '- [x] T001 Set up\n- [X] T002 Add model\n'
const TASKS_NONE_DONE = '- [ ] T001 Set up\n- [ ] T002 Add model\n'

const NONE: Detection = { specify: 'none', plan: 'none', tasks: 'none', implement: 'none', ticked: 0, total: 0 }

describe('detectPhases', () => {
  test('reads nothing started from no files', () => {
    expect(detectPhases({})).toEqual(NONE)
  })

  test('reads specified from a filled spec.md', () => {
    expect(detectPhases({ spec: SPEC }).specify).toBe('done')
  })

  test('reads specifying while spec.md still holds a template marker', () => {
    expect(detectPhases({ spec: `${SPEC}\n[NEEDS CLARIFICATION: scope]` }).specify).toBe('running')
    expect(detectPhases({ spec: `${SPEC}\nACTION REQUIRED: fill in` }).specify).toBe('running')
    expect(detectPhases({ spec: '# Feature Specification: [FEATURE NAME]' }).specify).toBe('running')
  })

  test('reads planned from a filled plan.md', () => {
    expect(detectPhases({ plan: PLAN }).plan).toBe('done')
  })

  test('reads planning while plan.md is still the bare template', () => {
    expect(detectPhases({ plan: '# Implementation Plan: [FEATURE]' }).plan).toBe('running')
    expect(detectPhases({ plan: `${PLAN}\nACTION REQUIRED: run` }).plan).toBe('running')
    expect(detectPhases({ plan: `${PLAN}\n[REMOVE IF UNUSED]` }).plan).toBe('running')
  })

  test('reads tasked and the counter from the task lines of tasks.md', () => {
    expect(detectPhases({ tasks: TASKS })).toEqual({ ...NONE, tasks: 'done', implement: 'running', ticked: 2, total: 3 })
  })

  test('reads no tasks from a tasks.md without task lines', () => {
    expect(detectPhases({ tasks: '# Tasks\n\n- [ ] not a task\n' })).toEqual(NONE)
  })

  test('reads implemented once no task is open', () => {
    expect(detectPhases({ tasks: TASKS_ALL_DONE })).toEqual({ ...NONE, tasks: 'done', implement: 'done', ticked: 2, total: 2 })
  })

  test('reads implementation not started while no task is ticked', () => {
    expect(detectPhases({ tasks: TASKS_NONE_DONE })).toEqual({ ...NONE, tasks: 'done', implement: 'none', ticked: 0, total: 2 })
  })
})

describe('fileUrl', () => {
  test('writes an absolute path as a file URL', () => {
    expect(fileUrl('/repo/specs/010-x/spec.md')).toBe('file:///repo/specs/010-x/spec.md')
  })

  test('percent-encodes what a URL path cannot hold, keeping the slashes', () => {
    expect(fileUrl('/Users/me/My Repo/specs/010 #x%/spec.md')).toBe(
      'file:///Users/me/My%20Repo/specs/010%20%23x%25/spec.md',
    )
  })
})

describe('phaseLinks', () => {
  test('links each phase to its file in the feature folder, implement to tasks.md', () => {
    expect(phaseLinks(FOLDER, { spec: SPEC, plan: PLAN, tasks: TASKS })).toEqual({
      specify: SPEC_LINK,
      plan: PLAN_LINK,
      tasks: TASKS_LINK,
      implement: TASKS_LINK,
    })
  })

  test('links no phase whose file does not exist', () => {
    expect(phaseLinks(FOLDER, { spec: SPEC })).toEqual({ specify: SPEC_LINK })
    expect(phaseLinks(FOLDER, {})).toEqual({})
  })
})

describe('phaseOfSkill', () => {
  test('names the phase of a speckit skill, with or without a plugin prefix', () => {
    expect(phaseOfSkill('speckit-specify')).toBe('specify')
    expect(phaseOfSkill('speckit.plan')).toBe('plan')
    expect(phaseOfSkill('speckit:tasks')).toBe('tasks')
    expect(phaseOfSkill('speckittasks')).toBe('tasks')
    expect(phaseOfSkill('foo:speckit-implement')).toBe('implement')
  })

  test('names no phase for any other skill', () => {
    expect(phaseOfSkill('commit')).toBeUndefined()
    expect(phaseOfSkill('speckit-clarify')).toBeUndefined()
    expect(phaseOfSkill('speckit-plan-extra')).toBeUndefined()
  })
})

const done = (text: string) => ({ text, running: false })
const running = (text: string) => ({ text, running: true })

describe('formatPhaseLine', () => {
  test('shows only implementing with its counter in parentheses, not the done phases before it', () => {
    const line = formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN, tasks: TASKS }), null, '010-collapsible-sidebar')

    expect(line).toEqual({
      feature: '010-collapsible-sidebar',
      parts: [running('implementing (2/3)')],
    })
  })

  test('lists the done phases when nothing runs', () => {
    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN }), null, 'f').parts).toEqual([
      done('specified'),
      done('planned'),
    ])
  })

  test('lists the done phases then the live phase as running while its done marker is not met', () => {
    expect(formatPhaseLine(NONE, 'specify', 'f').parts).toEqual([running('specifying')])
    expect(formatPhaseLine(detectPhases({ spec: SPEC }), 'plan', 'f').parts).toEqual([
      done('specified'),
      running('planning'),
    ])
    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN }), 'tasks', 'f').parts).toEqual([
      done('specified'),
      done('planned'),
      running('tasking'),
    ])
  })

  test('shows the live phase as done once its done marker is met', () => {
    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN }), 'plan', 'f').parts).toEqual([
      done('specified'),
      done('planned'),
    ])
  })

  test('shows tasked with the task count in parentheses while no task is ticked', () => {
    const tasks = `${TASKS_NONE_DONE}- [ ] T003 Wire the view\n`

    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN, tasks }), null, 'f').parts).toEqual([
      done('specified'),
      done('planned'),
      done('tasked (3)'),
    ])
  })

  test('shows implementing with the counter while the implement skill is live and no task is ticked', () => {
    expect(formatPhaseLine(detectPhases({ tasks: TASKS_NONE_DONE }), 'implement', 'f').parts).toEqual([
      running('implementing (0/2)'),
    ])
  })

  test('shows implemented alone once every task is ticked', () => {
    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN, tasks: TASKS_ALL_DONE }), null, 'f').parts).toEqual([
      done('implemented'),
    ])
  })

  test('shows the feature alone with nothing started', () => {
    expect(formatPhaseLine(NONE, null, '010-x')).toEqual({ feature: '010-x', parts: [] })
  })

  test('puts the link of its phase file on each part, none where the file does not exist yet', () => {
    const files = { spec: SPEC, plan: PLAN }

    expect(formatPhaseLine(detectPhases(files), 'tasks', 'f', phaseLinks(FOLDER, files)).parts).toEqual([
      { ...done('specified'), link: SPEC_LINK },
      { ...done('planned'), link: PLAN_LINK },
      running('tasking'),
    ])
  })

  test('puts the tasks.md link on implementing and on implemented', () => {
    const files = { spec: SPEC, plan: PLAN, tasks: TASKS }
    const allDone = { ...files, tasks: TASKS_ALL_DONE }

    expect(formatPhaseLine(detectPhases(files), null, 'f', phaseLinks(FOLDER, files)).parts).toEqual([
      { ...running('implementing (2/3)'), link: TASKS_LINK },
    ])
    expect(formatPhaseLine(detectPhases(allDone), null, 'f', phaseLinks(FOLDER, allDone)).parts).toEqual([
      { ...done('implemented'), link: TASKS_LINK },
    ])
  })
})

describe('splitFeature', () => {
  test('splits a numbered folder name into its id and name', () => {
    expect(splitFeature('004-x')).toEqual({ id: '004-', name: 'x' })
  })

  test('takes every leading digit group with its dash as the id', () => {
    expect(splitFeature('20260917-110232-x-y')).toEqual({ id: '20260917-110232-', name: 'x-y' })
  })

  test('keeps a folder name without a number prefix whole', () => {
    expect(splitFeature('sidebar')).toEqual({ id: '', name: 'sidebar' })
  })

  test('keeps a digits-only folder name as the name', () => {
    expect(splitFeature('004')).toEqual({ id: '', name: '004' })
  })
})
