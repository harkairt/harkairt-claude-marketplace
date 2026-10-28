import type { Register } from 'claude-code'

import { registerDesktop } from './desktop/register'
import { registerTerminal } from './terminal/register'

export const register: Register = (on, options) => {
  registerDesktop(on, options)
  registerTerminal(on, options)
}
