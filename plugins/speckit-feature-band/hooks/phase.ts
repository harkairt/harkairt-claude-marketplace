import type { FileLink, Phase, PhaseLine, PhasePart } from '../types'

export type PhaseStatus = 'none' | 'running' | 'done'

export type PhaseFiles = { spec?: string; plan?: string; tasks?: string }

export type PhaseLinks = Partial<Record<Phase, FileLink>>

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

const PHASE_FILES: Record<Phase, keyof PhaseFiles> = {
  specify: 'spec',
  plan: 'plan',
  tasks: 'tasks',
  implement: 'tasks',
}

const SPEC_TEMPLATE_MARKERS =['[NEEDS CLARIFICATION', 'ACTION REQUIRED', '[FEATURE NAME]']
const PLAN_TEMPLATE_MARKERS = ['[FEATURE]', 'ACTION REQUIRED', '[REMOVE IF UNUSED]']
const TASK_LINE = /^\s*- \[[ xX]\] T\d+/gm
const OPEN_TASK_LINE = /^\s*- \[ \] T\d+/gm
const SKILL_NAME = /^(?:[^:]+:)?speckit[-.:]?(specify|plan|tasks|implement)$/
const FEATURE_ID = /^(?:\d+-)+/

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

export function fileUrl(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`
}

export function phaseLinks(folder: string, files: PhaseFiles): PhaseLinks {
  const links: PhaseLinks = {}
  for (const phase of PHASES) {
    const file = PHASE_FILES[phase]
    if (files[file] !== undefined) {
      links[phase] = { label: `${file}.md`, path: `${folder}/${file}.md` }
    }
  }

  return links
}

export function phaseOfSkill(skill: string): Phase | undefined {
  const match = SKILL_NAME.exec(skill)

  return match === null ? undefined : (match[1] as Phase)
}

export function splitFeature(feature: string): { id: string; name: string } {
  const id = FEATURE_ID.exec(feature)?.[0] ?? ''

  return { id, name: feature.slice(id.length) }
}

export function isFinished(line: PhaseLine): boolean {
  return line.parts.length === 1 && line.parts[0]?.text === WORDS.implement.done
}

function withLink(part: PhasePart, link: FileLink | undefined): PhasePart {
  return link === undefined ? part : { ...part, link }
}

export function formatPhaseLine(detection: Detection, live: Phase | null, feature: string, links: PhaseLinks = {}): PhaseLine {
  if (detection.implement === 'done') {
    return { feature, parts: [withLink({ text: WORDS.implement.done, running: false }, links.implement)] }
  }
  if (detection.implement === 'running' || live === 'implement') {
    const part: PhasePart =
      detection.total > 0
        ? { text: `${WORDS.implement.done} ${detection.ticked}`, aside: ` out of ${detection.total}`, running: true }
        : { text: WORDS.implement.running, running: true }

    return { feature, parts: [withLink(part, links.implement)] }
  }

  const parts: PhasePart[] = []
  for (const phase of PHASES) {
    const status = detection[phase]
    if (status === 'done') {
      const counter = phase === 'tasks' ? ` (${detection.total})` : ''
      parts.push(withLink({ text: `${WORDS[phase].done}${counter}`, running: false }, links[phase]))
    } else if (status === 'running' || live === phase) {
      parts.push(withLink({ text: WORDS[phase].running, running: true }, links[phase]))
    }
  }

  return { feature, parts }
}
