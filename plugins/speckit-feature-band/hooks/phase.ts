import type { Phase, PhaseLine, PhasePart } from '../types'

export type PhaseStatus = 'none' | 'running' | 'done'

export type PhaseFiles = { spec?: string; plan?: string; tasks?: string }

export type Detection = {
  specify: PhaseStatus
  plan: PhaseStatus
  tasks: PhaseStatus
  implement: PhaseStatus
  ticked: number
  total: number
}

export const PHASES: readonly Phase[] = ['specify', 'plan', 'tasks', 'implement']

const WORDS: Record<Phase, { done: string; running: string }> = {
  specify: { done: 'specified', running: 'specifying' },
  plan: { done: 'planned', running: 'planning' },
  tasks: { done: 'tasked', running: 'tasking' },
  implement: { done: 'implemented', running: 'implementing' },
}

const SPEC_TEMPLATE_MARKERS = ['[NEEDS CLARIFICATION', 'ACTION REQUIRED', '[FEATURE NAME]']
const PLAN_TEMPLATE_MARKERS = ['[FEATURE]', 'ACTION REQUIRED', '[REMOVE IF UNUSED]']
const TASK_LINE = /^\s*- \[[ xX]\] T\d+/gm
const OPEN_TASK_LINE = /^\s*- \[ \] T\d+/gm
const SKILL_NAME = /^(?:[^:]+:)?speckit[-.:]?(specify|plan|tasks|implement)$/

function fileStatus(text: string | undefined, templateMarkers: readonly string[]): PhaseStatus {
  if (text === undefined) {
    return 'none'
  }

  return templateMarkers.some(marker => text.includes(marker)) ? 'running' : 'done'
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

export function detectPhases(files: PhaseFiles): Detection {
  const total = files.tasks === undefined ? 0 : count(files.tasks, TASK_LINE)
  const open = files.tasks === undefined ? 0 : count(files.tasks, OPEN_TASK_LINE)
  const ticked = total - open

  let implement: PhaseStatus = 'none'
  if (total > 0 && open === 0) {
    implement = 'done'
  } else if (ticked > 0 && open > 0) {
    implement = 'running'
  }

  return {
    specify: fileStatus(files.spec, SPEC_TEMPLATE_MARKERS),
    plan: fileStatus(files.plan, PLAN_TEMPLATE_MARKERS),
    tasks: total > 0 ? 'done' : 'none',
    implement,
    ticked,
    total,
  }
}

export function phaseOfSkill(skill: string): Phase | undefined {
  const match = SKILL_NAME.exec(skill)

  return match === null ? undefined : (match[1] as Phase)
}

export function formatPhaseLine(detection: Detection, live: Phase | null, feature: string): PhaseLine {
  let part: PhasePart | null = null

  for (const phase of PHASES) {
    const status = detection[phase]
    if (status === 'done') {
      part = { text: WORDS[phase].done, running: false }
    } else if (status === 'running' || live === phase) {
      const counter = phase === 'implement' && detection.total > 0 ? ` ${detection.ticked}/${detection.total}` : ''
      part = { text: `${WORDS[phase].running}${counter}`, running: true }
    }
  }

  return { feature, part }
}
