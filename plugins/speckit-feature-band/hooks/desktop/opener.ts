import type { EngineInterface } from 'claude-code'

export type HostOs = 'macos' | 'linux' | 'windows'

export function hostOs(osVariable: string | undefined, uname: string): HostOs {
  if (osVariable === 'Windows_NT') {
    return 'windows'
  }

  return uname.trim() === 'Darwin' ? 'macos' : 'linux'
}

export function openerArgv(os: HostOs, path: string): string[] {
  if (os === 'macos') {
    return ['open', path]
  }
  if (os === 'windows') {
    return ['cmd', '/c', 'start', '', path]
  }

  return ['xdg-open', path]
}

export async function openOnHost($: Pick<EngineInterface, 'env' | 'process'>, path: string): Promise<boolean> {
  try {
    const osVariable = await $.env.get('OS')
    const uname = osVariable === 'Windows_NT' ? '' : (await $.process.run(['uname', '-s'])).stdout
    const { exitCode } = await $.process.run(openerArgv(hostOs(osVariable, uname), path))

    return exitCode === 0
  } catch {
    return false
  }
}
