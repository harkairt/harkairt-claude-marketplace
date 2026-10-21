import { describe, expect, test } from 'claude-code/testing'

import { detectPhases, formatPhaseLine, phaseOfSkill } from './phase'
import type { Detection } from './phase'

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

describe('formatPhaseLine', () => {
  test('shows the running phase with its counter, not the done phases before it', () => {
    const line = formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN, tasks: TASKS }), null, '010-collapsible-sidebar')

    expect(line).toEqual({
      feature: '010-collapsible-sidebar',
      part: { text: 'implementing 2/3', running: true },
    })
  })

  test('shows the latest done phase when nothing runs', () => {
    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN }), null, 'f').part).toEqual({
      text: 'planned',
      running: false,
    })
  })

  test('shows the live phase as running while its done marker is not met', () => {
    expect(formatPhaseLine(detectPhases({ spec: SPEC }), 'plan', 'f').part).toEqual({ text: 'planning', running: true })
    expect(formatPhaseLine(NONE, 'specify', 'f').part).toEqual({ text: 'specifying', running: true })
  })

  test('shows the live phase as done once its done marker is met', () => {
    expect(formatPhaseLine(detectPhases({ spec: SPEC, plan: PLAN }), 'plan', 'f').part).toEqual({
      text: 'planned',
      running: false,
    })
  })

  test('shows implementing with the counter while the implement skill is live and no task is ticked', () => {
    expect(formatPhaseLine(detectPhases({ tasks: TASKS_NONE_DONE }), 'implement', 'f').part).toEqual({
      text: 'implementing 0/2',
      running: true,
    })
  })

  test('shows the feature alone with nothing started', () => {
    expect(formatPhaseLine(NONE, null, '010-x')).toEqual({ feature: '010-x', part: null })
  })
})
