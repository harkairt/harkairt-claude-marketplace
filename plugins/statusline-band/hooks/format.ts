export type Hue = 'white' | 'red' | 'green' | 'yellow' | 'orange' | 'gray'

export type Painted = { text: string; color: Hue }

export function tokenCount(total: number | undefined): Painted {
  if (total === undefined) {
    return { text: '0k', color: 'white' }
  }

  const thousands = Math.ceil(total / 1000)
  const color = thousands <= 50 ? 'green' : thousands <= 100 ? 'yellow' : thousands <= 125 ? 'orange' : 'red'

  return { text: `${thousands}k`, color }
}

export function windowLabel(window: number): string {
  return window >= 1_000_000 ? '/1m' : '/200k'
}

export type OrbBar = { filled: string; empty: string; color: Hue }

export function orbBar(percent: number, width: number): OrbBar {
  const pct = Math.min(Math.max(percent, 0), 100)
  const whole = Math.floor((pct * width) / 100)
  const remainder = (pct * width) % 100
  const partial = remainder > 0 && pct < 100 ? (remainder < 50 ? '◎' : '◉') : ''
  const color = pct >= 90 ? 'red' : pct >= 70 ? 'orange' : pct >= 50 ? 'yellow' : 'green'

  return {
    filled: '●'.repeat(whole) + partial,
    empty: '○'.repeat(width - whole - partial.length),
    color,
  }
}

export function wholePercent(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction !== 0.5) {
    return Math.round(value)
  }

  return floor % 2 === 0 ? floor : floor + 1
}

export function tildify(path: string, home: string): string {
  return home !== '' && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

export function shortenCwd(cwd: string, home: string): string {
  const short = tildify(cwd, home)

  return /^~\/repos\/[^/]+$/.test(short) ? short.slice('~/repos/'.length) : short
}

function joinPresent(parts: readonly string[]): string {
  return parts.filter(part => part !== '').join(' ')
}

function counted(mark: string, count: number | string | undefined): string {
  return count ? `${mark}${count}` : ''
}

export function gitMarkers(status: string): string {
  const [header = '', ...files] = status.split('\n').filter(line => line !== '')
  let staged = 0
  let modified = 0
  let deleted = 0
  let untracked = 0

  for (const line of files) {
    const [x, y] = [line[0], line[1]]
    if (x === '?') {
      untracked += 1
      continue
    }
    if (x !== ' ') staged += 1
    if (y === 'M' || y === 'T') modified += 1
    if (x === 'D' || y === 'D') deleted += 1
  }

  return joinPresent([
    counted('⇡', /ahead (\d+)/.exec(header)?.[1]) + counted('⇣', /behind (\d+)/.exec(header)?.[1]),
    counted('+', staged),
    counted('~', modified) + counted('-', deleted) + counted('?', untracked),
  ])
}

export function commitsMark(count: number): string {
  return count > 0 ? `⎇ ${count}` : ''
}

export function joinMarkers(commits: string, markers: string): string {
  return /^[⇡⇣]/.test(markers) ? commits + markers : joinPresent([commits, markers])
}

const EFFORT_MARKS: Readonly<Record<string, string>> = {
  low: '¹',
  medium: '²',
  high: '³',
  xhigh: '⁴',
  max: '⁵',
}

export function effortMark(level: string | undefined): string {
  return (level !== undefined && EFFORT_MARKS[level]) || ''
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function effortLevelOf(value: unknown): string | undefined {
  const level = recordOf(value).effortLevel

  return typeof level === 'string' ? level : undefined
}

export function settingsEffort(settings: Readonly<Record<string, unknown>>, model: string): string | undefined {
  const perModel = recordOf(settings.modelSettings)

  return (
    effortLevelOf(perModel[model]) ??
    effortLevelOf(perModel[model.replace(/\[[^\]]*\]$/, '')]) ??
    effortLevelOf(settings)
  )
}

export function modelName(id: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[\w+\])?$/.exec(id)
  if (match === null) {
    return id
  }

  const [, family = '', major, minor] = match

  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}${minor === undefined ? '' : `.${minor}`}`
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_SECONDS = 86_400

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function epochSeconds(ms: number): number {
  return Math.floor(ms / 1000)
}

export function resetLabel(resetsAt: string | undefined, now: number, isDated = false): string {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) {
    return ''
  }

  const date = new Date(at)
  const isWithinDay = epochSeconds(at) - epochSeconds(now) <= DAY_SECONDS

  return isDated && !isWithinDay
    ? `${MONTHS[date.getMonth()]} ${date.getDate()}`
    : `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

const MINUTE_MS = 60_000

export function cacheTtlMs(percentsUsed: readonly number[]): number {
  return percentsUsed.some(percent => percent >= 100) ? 5 * MINUTE_MS : 60 * MINUTE_MS
}

export function minutesLeft(expiresAt: number, now: number): number | undefined {
  return expiresAt > now ? Math.ceil((expiresAt - now) / MINUTE_MS) : undefined
}

export function splitDir(path: string): { parent: string; name: string } {
  const cut = path.lastIndexOf('/') + 1

  return { parent: path.slice(0, cut), name: path.slice(cut) }
}
