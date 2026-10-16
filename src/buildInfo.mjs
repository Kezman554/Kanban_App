// Build-time version and commit, injected into the renderer by both Vite
// configs (__APP_VERSION__, __APP_COMMIT__). The version comes from
// package.json. The commit comes from git when it is installed (the laptop),
// otherwise from the .git files directly (the Pi's Docker build has no git;
// .dockerignore lets through only .git/HEAD and the refs).
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function readCommit(root) {
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    // No git binary: resolve HEAD by hand
  }
  try {
    const gitDir = path.join(root, '.git')
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim()
    if (!head.startsWith('ref: ')) return head.slice(0, 7) // detached HEAD
    const ref = head.slice(5)
    const loose = path.join(gitDir, ref)
    if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim().slice(0, 7)
    const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8')
    const line = packed.split('\n').find(l => l.endsWith(` ${ref}`))
    if (line) return line.slice(0, 7)
  } catch {
    // fall through
  }
  return 'unknown'
}

export function buildInfo(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  return { version: pkg.version, commit: readCommit(root) }
}

// For Vite's `define`: replaced as literals in the bundle
export function buildDefines(root) {
  const { version, commit } = buildInfo(root)
  return {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  }
}
