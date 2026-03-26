// ============================================================
// Telepathy - JSON File Session Storage
// Atomic writes (.tmp → rename) in userData/sessions/
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type { SessionStorage, SessionData } from './types'

/** Hash a session key to a safe filename */
function keyToFilename(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16)
  return `${hash}.json`
}

export class JsonFileSessionStorage implements SessionStorage {
  private dir: string

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'sessions')
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async save(key: string, data: SessionData): Promise<void> {
    await this.ensureDir()
    const filePath = join(this.dir, keyToFilename(key))
    const tmpPath = filePath + '.tmp'
    const json = JSON.stringify(data, null, 2)
    await fs.writeFile(tmpPath, json, 'utf-8')
    await fs.rename(tmpPath, filePath)
  }

  async load(key: string): Promise<SessionData | null> {
    try {
      const filePath = join(this.dir, keyToFilename(key))
      const json = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(json) as SessionData
    } catch {
      return null // file not found or corrupted
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = join(this.dir, keyToFilename(key))
      await fs.unlink(filePath)
    } catch {
      // ignore if file doesn't exist
    }
  }

  async list(): Promise<string[]> {
    await this.ensureDir()
    const files = await fs.readdir(this.dir)
    // Return filenames (hashed keys) — caller can't reverse hash,
    // but this is useful for cleanup/enumeration
    return files.filter(f => f.endsWith('.json'))
  }
}
