import { expect, test } from 'claude-code/testing'

import {
  commitsMark,
  effortMark,
  gitMarkers,
  joinMarkers,
  modelName,
  orbBar,
  resetLabel,
  shortenCwd,
  splitDir,
  tildify,
  tokenCount,
  wholePercent,
  windowLabel,
} from './format'

test('rounds the token count up to whole thousands, colored by size', () => {
  expect(tokenCount(1)).toEqual({ text: '1k', color: 'green' })
  expect(tokenCount(50_000)).toEqual({ text: '50k', color: 'green' })
  expect(tokenCount(50_001)).toEqual({ text: '51k', color: 'yellow' })
  expect(tokenCount(100_000)).toEqual({ text: '100k', color: 'yellow' })
  expect(tokenCount(100_001)).toEqual({ text: '101k', color: 'orange' })
  expect(tokenCount(125_000)).toEqual({ text: '125k', color: 'orange' })
  expect(tokenCount(125_001)).toEqual({ text: '126k', color: 'red' })
})

test('shows 0k in white before the first response', () => {
  expect(tokenCount(undefined)).toEqual({ text: '0k', color: 'white' })
})

test('labels a window of a million tokens or more /1m, any other /200k', () => {
  expect(windowLabel(1_000_000)).toBe('/1m')
  expect(windowLabel(2_000_000)).toBe('/1m')
  expect(windowLabel(999_999)).toBe('/200k')
  expect(windowLabel(200_000)).toBe('/200k')
})

test('draws an empty bar at 0 percent', () => {
  expect(orbBar(0, 10)).toEqual({ filled: '', empty: '○○○○○○○○○○', color: 'green' })
})

test('draws a half orb for a remainder of half a cell or more, a quarter orb below', () => {
  expect(orbBar(5, 10)).toEqual({ filled: '◉', empty: '○○○○○○○○○', color: 'green' })
  expect(orbBar(4, 10)).toEqual({ filled: '◎', empty: '○○○○○○○○○', color: 'green' })
  expect(orbBar(23, 10)).toEqual({ filled: '●●◎', empty: '○○○○○○○', color: 'green' })
})

test('draws half a bar at 50 percent and a full bar at 100 percent', () => {
  expect(orbBar(50, 10)).toEqual({ filled: '●●●●●', empty: '○○○○○', color: 'yellow' })
  expect(orbBar(100, 10)).toEqual({ filled: '●●●●●●●●●●', empty: '', color: 'red' })
})

test('colors the bar yellow from 50, orange from 70 and red from 90 percent', () => {
  expect(orbBar(49, 10).color).toBe('green')
  expect(orbBar(69, 10)).toEqual({ filled: '●●●●●●◉', empty: '○○○', color: 'yellow' })
  expect(orbBar(70, 10).color).toBe('orange')
  expect(orbBar(89, 10).color).toBe('orange')
  expect(orbBar(90, 10).color).toBe('red')
})

test('holds a percentage outside 0 to 100 at the nearer end', () => {
  expect(orbBar(-5, 10)).toEqual(orbBar(0, 10))
  expect(orbBar(130, 10)).toEqual(orbBar(100, 10))
})

test('rounds a percentage to whole as printf %.0f does, a half to the even neighbour', () => {
  expect(wholePercent(41)).toBe(41)
  expect(wholePercent(23.4)).toBe(23)
  expect(wholePercent(23.6)).toBe(24)
  expect(wholePercent(23.5)).toBe(24)
  expect(wholePercent(22.5)).toBe(22)
  expect(wholePercent(0.5)).toBe(0)
})

test('writes the home folder as ~', () => {
  const home = '/Users/me'

  expect(tildify('/Users/me/.claude/plans/a.md', home)).toBe('~/.claude/plans/a.md')
  expect(tildify('/Users/me', home)).toBe('~')
  expect(tildify('/opt/tool', home)).toBe('/opt/tool')
})

test('shows a repository straight under ~/repos by its name alone', () => {
  const home = '/Users/me'

  expect(shortenCwd('/Users/me/repos/app', home)).toBe('app')
  expect(shortenCwd('/Users/me/repos/app/src', home)).toBe('~/repos/app/src')
  expect(shortenCwd('/Users/me/repos', home)).toBe('~/repos')
  expect(shortenCwd('/Users/me/notes', home)).toBe('~/notes')
  expect(shortenCwd('/opt/tool', home)).toBe('/opt/tool')
})

test('counts ahead, behind, staged, modified, deleted and untracked from git status', () => {
  const status = [
    '## main...origin/main [ahead 2, behind 1]',
    'M  staged.ts',
    ' M modified.ts',
    'MM both.ts',
    'D  gone.ts',
    ' D gone-too.ts',
    '?? new.ts',
    '?? new-too.ts',
    ' T retyped.ts',
    '',
  ].join('\n')

  expect(gitMarkers(status)).toBe('⇡2⇣1 +3 ~3-2?2')
})

test('leaves out every marker with nothing to count', () => {
  expect(gitMarkers('## main...origin/main\n')).toBe('')
  expect(gitMarkers('## feature\n?? a.ts\n')).toBe('?1')
  expect(gitMarkers('## x...origin/x [ahead 3]\n')).toBe('⇡3')
  expect(gitMarkers('## x...origin/x [behind 4]\nA  a.ts\n')).toBe('⇣4 +1')
  expect(gitMarkers('## x\nA  a.ts\n?? b.ts\n')).toBe('+1 ?1')
})

test('marks the commits only this branch has', () => {
  expect(commitsMark(3)).toBe('⎇ 3')
  expect(commitsMark(0)).toBe('')
})

test('puts the commits mark before the markers, flush against ahead or behind', () => {
  expect(joinMarkers('', '')).toBe('')
  expect(joinMarkers('⎇ 3', '')).toBe('⎇ 3')
  expect(joinMarkers('', '+1')).toBe('+1')
  expect(joinMarkers('⎇ 3', '+1 ~2')).toBe('⎇ 3 +1 ~2')
  expect(joinMarkers('⎇ 3', '⇡1 +2')).toBe('⎇ 3⇡1 +2')
  expect(joinMarkers('⎇ 3', '⇣2')).toBe('⎇ 3⇣2')
  expect(joinMarkers('', '⇡1')).toBe('⇡1')
})

test('marks the effort level low to max with a superscript 1 to 5', () => {
  expect(effortMark('low')).toBe('¹')
  expect(effortMark('medium')).toBe('²')
  expect(effortMark('high')).toBe('³')
  expect(effortMark('xhigh')).toBe('⁴')
  expect(effortMark('max')).toBe('⁵')
  expect(effortMark(undefined)).toBe('')
  expect(effortMark('turbo')).toBe('')
})

test('names a model by its family and version', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
  expect(modelName('claude-opus-4-1-20250805')).toBe('Opus 4.1')
  expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
  expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
})

test('names a model it cannot read by its id', () => {
  expect(modelName('gpt-oss-120b')).toBe('gpt-oss-120b')
})

test('shows a reset as local HH:MM', () => {
  const now = new Date(2026, 9, 12, 10, 0).getTime()

  expect(resetLabel(new Date(2026, 9, 12, 14, 5).toISOString(), now)).toBe('14:05')
  expect(resetLabel(new Date(2026, 9, 20, 9, 0).toISOString(), now)).toBe('09:00')
})

test('shows a dated reset more than 24 hours away as its lowercase month and day', () => {
  const now = new Date(2026, 9, 12, 10, 0).getTime()

  expect(resetLabel(new Date(2026, 9, 14, 7, 0).toISOString(), now, true)).toBe('oct 14')
  expect(resetLabel(new Date(2027, 0, 5, 7, 0).toISOString(), now, true)).toBe('jan 5')
})

test('shows a dated reset within 24 hours as HH:MM', () => {
  const now = new Date(2026, 9, 12, 10, 0).getTime()

  expect(resetLabel(new Date(2026, 9, 13, 9, 30).toISOString(), now, true)).toBe('09:30')
  expect(resetLabel(new Date(2026, 9, 13, 10, 0).toISOString(), now, true)).toBe('10:00')
  expect(resetLabel(new Date(2026, 9, 13, 10, 1).toISOString(), now, true)).toBe('oct 13')
})

test('shows nothing for a reset time that is missing or does not parse', () => {
  expect(resetLabel(undefined, 0)).toBe('')
  expect(resetLabel('soon', 0, true)).toBe('')
})

test('splits a path into the part up to its last slash and the name after it', () => {
  expect(splitDir('~/repos/app/src')).toEqual({ parent: '~/repos/app/', name: 'src' })
  expect(splitDir('/opt')).toEqual({ parent: '/', name: 'opt' })
  expect(splitDir('app')).toEqual({ parent: '', name: 'app' })
})
