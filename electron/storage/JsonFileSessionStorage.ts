// ============================================================
// Telepathy - JSON File Session Storage
// Atomic writes (.tmp → rename) in userData/sessions/
// Migration-aware loading with backup on failure.
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type { SessionStorage, SessionData } from './types'
import { migrateSession, SessionMigrationError, CURRENT_SESSION_VERSION } from './sessionMigrations'

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
    const filePath = join(this.dir, keyToFilename(key))

    let json: string
    try {
      json = await fs.readFile(filePath, 'utf-8')
    } catch {
      return null // file not found
    }

    let raw: any
    try {
      raw = JSON.parse(json)
    } catch {
      // JSON parse failure — backup and report
      await this.backupFile(filePath, 'corrupt')
      throw new SessionMigrationError(
        'Session file is corrupted (invalid JSON). The original file has been backed up.',
        0, 0,
      )
    }

    // Backup BEFORE migration so the original is always preserved
    const version = typeof raw?.version === 'number' ? raw.version : 1
    if (version !== CURRENT_SESSION_VERSION) {
      await this.backupFile(filePath, `v${version}`)
    }

    return migrateSession(raw)
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

  /**
   * Back up a session file before discarding it.
   * Creates a copy named `{original}.backup.{tag}.{timestamp}.json`
   */
  private async backupFile(filePath: string, tag: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = filePath.replace(/\.json$/, `.backup.${tag}.${timestamp}.json`)
      await fs.copyFile(filePath, backupPath)
      console.error(`[Telepathy] Session backup created: ${backupPath}`)
    } catch (backupErr) {
      console.error('[Telepathy] Failed to create session backup:', backupErr)
    }
  }
}
