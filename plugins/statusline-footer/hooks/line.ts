import type { GitLine, Limit, Model, Usage, Workspace } from '../types'

import { effortMark, modelName, orbBar, splitDir, tokenCount, windowLabel } from './format'
import type { Hue } from './format'

export type Segment = { text: string; color?: Hue; isDim?: true }

const BAR_WIDTH = 10
const SPACE: Segment = { text: ' ' }

function paint(text: string, color: Hue): Segment {
  return { text, color }
}

function dim(text: string, color?: Hue): Segment {
  return color === undefined ? { text, isDim: true } : { text, color, isDim: true }
}

function branchLabel(git: GitLine): Segment[] {
  if (git.upstream === undefined) {
    return [paint(git.branch, 'yellow')]
  }

  const cut = git.upstream.indexOf('/')
  const [remote, branch] =
    cut < 0 ? [git.upstream, git.upstream] : [git.upstream.slice(0, cut), git.upstream.slice(cut + 1)]

  return [dim(`${remote}/`, 'yellow'), paint(branch, 'yellow')]
}

function gitPart(git: GitLine | undefined): Segment[] {
  if (git === undefined) {
    return []
  }

  const markers = git.markers === '' ? [] : [dim(` ${git.markers}`, 'yellow')]

  return [dim(' on '), ...branchLabel(git), ...markers]
}

function workspacePart(workspace: Workspace): Segment[] {
  const { parent, name } = splitDir(workspace.cwd)
  const cwd = parent === '' ? [paint(name, 'yellow')] : [dim(parent, 'yellow'), paint(name, 'yellow')]

  return [dim(' in '), ...cwd, ...gitPart(workspace.git)]
}

function modelPart(model: Model): Segment[] {
  return [dim(' using '), paint(`${modelName(model.id)}${effortMark(model.effort)}`, 'yellow')]
}

function planPart(workspace: Workspace): Segment[] {
  return [dim(' planned'), ...(workspace.plan === undefined ? [] : [dim(` ${workspace.plan}`, 'white')])]
}

export function firstLine(usage: Usage | null, workspace: Workspace | null, model: Model | null): Segment[] {
  const tokens = tokenCount(usage?.tokens)

  return [
    dim('at'),
    SPACE,
    paint(tokens.text, tokens.color),
    paint(windowLabel(usage?.window ?? 0), 'gray'),
    ...(workspace === null ? [] : workspacePart(workspace)),
    ...(model === null ? [] : modelPart(model)),
    ...(workspace === null ? [] : planPart(workspace)),
  ]
}

function limitPart(label: string, limit: Limit): Segment[] {
  const bar = orbBar(limit.percent, BAR_WIDTH)

  return [
    dim(`${label}(`),
    paint(limit.reset, 'white'),
    dim('):'),
    SPACE,
    paint(bar.filled, bar.color),
    dim(bar.empty, bar.color),
    SPACE,
    paint(`${limit.percent}%`, 'white'),
  ]
}

export function secondLine(usage: Usage | null): Segment[] | undefined {
  const limits = usage?.limits
  if (limits === undefined) {
    return undefined
  }

  return [...limitPart('current', limits.current), SPACE, dim('|'), SPACE, ...limitPart('weekly', limits.weekly)]
}
