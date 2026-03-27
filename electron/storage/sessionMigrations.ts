// ============================================================
// Session Migration — version-aware upgrade chain
// Each migration transforms data from version N to N+1.
// Unknown/future versions and migration failures → backup + error.
// ============================================================

import type { SessionData } from './types'

/** Current schema version. Bump this when adding a new migration. */
export const CURRENT_SESSION_VERSION = 2

/** Custom error thrown when migration fails or version is unsupported */
export class SessionMigrationError extends Error {
  constructor(
    message: string,
    public readonly fromVersion: number,
    public readonly toVersion: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SessionMigrationError'
  }
}

// ---- Migration registry ----
// Key = source version, value = function that returns target version data.
// Each function receives a shallow-parsed JSON object (any) and returns
// the upgraded object. Migrations MUST set `version` to the next number.

type MigrationFn = (data: any) => any

const migrations: Record<number, MigrationFn> = {
  // v1 → v2: backfill fields added after initial release
  1: (data: any) => {
    const tabs = (data.tabs ?? []).map((tab: any) => ({
      id: tab.id ?? `tab-${Date.now()}`,
      label: tab.label ?? 'New Tab',
      selectedClassId: tab.selectedClassId ?? null,
      selectedMemberId: tab.selectedMemberId ?? null,
      selectedMemberIds: tab.selectedMemberIds ?? [],
      pinnedClassIds: tab.pinnedClassIds ?? [],
      pinnedMemberEntries: tab.pinnedMemberEntries ?? [],
      navBackStack: tab.navBackStack ?? [],
      navForwardStack: tab.navForwardStack ?? [],
      leftPanelOpen: tab.leftPanelOpen ?? true,
      savedViewId: tab.savedViewId ?? null,
    }))

    return {
      ...data,
      version: 2,
      tabs,
      savedViews: data.savedViews ?? { classView: [], callstack: [] },
    }
  },
}

/**
 * Migrate a raw parsed session object to CURRENT_SESSION_VERSION.
 *
 * @returns The migrated SessionData at the current version.
 * @throws SessionMigrationError if the version is unsupported or migration fails.
 */
export function migrateSession(raw: any): SessionData {
  let version = typeof raw?.version === 'number' ? raw.version : 1
  let data = { ...raw, version }

  if (version === CURRENT_SESSION_VERSION) {
    return data as SessionData
  }

  if (version > CURRENT_SESSION_VERSION) {
    throw new SessionMigrationError(
      `Session version ${version} is newer than supported version ${CURRENT_SESSION_VERSION}. ` +
      `Please update Telepathy to open this session.`,
      version,
      CURRENT_SESSION_VERSION,
    )
  }

  // Walk the migration chain
  while (version < CURRENT_SESSION_VERSION) {
    const migrateFn = migrations[version]
    if (!migrateFn) {
      throw new SessionMigrationError(
        `No migration path from version ${version} to ${version + 1}. ` +
        `Session data may be corrupted.`,
        version,
        version + 1,
      )
    }

    try {
      data = migrateFn(data)
    } catch (err) {
      throw new SessionMigrationError(
        `Migration from version ${version} to ${version + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
        version,
        version + 1,
        err,
      )
    }

    version = data.version
  }

  return data as SessionData
}
