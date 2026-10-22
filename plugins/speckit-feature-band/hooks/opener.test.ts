import { describe, expect, test } from 'claude-code/testing'

import { hostOs, openerArgv } from './opener'

describe('hostOs', () => {
  test('reads Windows from the OS variable Windows sets', () => {
    expect(hostOs('Windows_NT', '')).toBe('windows')
  })

  test('reads macOS from uname', () => {
    expect(hostOs(undefined, 'Darwin\n')).toBe('macos')
  })

  test('reads any other uname as Linux', () => {
    expect(hostOs(undefined, 'Linux\n')).toBe('linux')
    expect(hostOs(undefined, 'FreeBSD\n')).toBe('linux')
  })
})

describe('openerArgv', () => {
  const path = '/Users/me/My Repo/specs/010-x/spec.md'

  test('opens with open on macOS', () => {
    expect(openerArgv('macos', path)).toEqual(['open', path])
  })

  test('opens with xdg-open on Linux', () => {
    expect(openerArgv('linux', path)).toEqual(['xdg-open', path])
  })

  test('opens with start through cmd on Windows, an empty window title first', () => {
    expect(openerArgv('windows', path)).toEqual(['cmd', '/c', 'start', '', path])
  })
})
