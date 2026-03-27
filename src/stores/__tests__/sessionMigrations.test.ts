// ============================================================
// Session Migration tests
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  migrateSession,
  SessionMigrationError,
  CURRENT_SESSION_VERSION,
} from '../../../electron/storage/sessionMigrations'

describe('migrateSession', () => {
  // ---- Current version passthrough ----

  it('returns data unchanged when already at current version', () => {
    const data = {
      version: CURRENT_SESSION_VERSION,
      pluginName: 'vs-browse-db',
      dataPath: '/test.db',
      savedAt: '2026-01-01T00:00:00Z',
      activeTabId: 'tab-1',
      tabs: [],
      savedViews: { classView: [], callstack: [] },
    }
    const result = migrateSession(data)
    expect(result.version).toBe(CURRENT_SESSION_VERSION)
    expect(result).toEqual(data)
  })

  // ---- v1 → v2 migration ----

  it('migrates v1 data to v2 with missing fields filled', () => {
    const v1Data = {
      version: 1,
      pluginName: 'vs-browse-db',
      dataPath: '/test.db',
      savedAt: '2026-01-01T00:00:00Z',
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          label: 'MyClass',
          selectedClassId: 'c1',
          selectedMemberId: null,
          // Missing: selectedMemberIds, pinnedClassIds, pinnedMemberEntries,
          //          navBackStack, navForwardStack, leftPanelOpen, savedViewId
        },
      ],
    }
    const result = migrateSession(v1Data)
    expect(result.version).toBe(2)

    const tab = result.tabs[0]
    expect(tab.selectedMemberIds).toEqual([])
    expect(tab.pinnedClassIds).toEqual([])
    expect(tab.pinnedMemberEntries).toEqual([])
    expect(tab.navBackStack).toEqual([])
    expect(tab.navForwardStack).toEqual([])
    expect(tab.leftPanelOpen).toBe(true)
    expect(tab.savedViewId).toBeNull()
    // Preserved fields
    expect(tab.id).toBe('tab-1')
    expect(tab.label).toBe('MyClass')
    expect(tab.selectedClassId).toBe('c1')
  })

  it('migrates v1 data that has no version field (defaults to v1)', () => {
    const noVersion = {
      pluginName: 'vs-browse-db',
      dataPath: '/test.db',
      savedAt: '2026-01-01T00:00:00Z',
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', label: 'Test' }],
    }
    const result = migrateSession(noVersion)
    expect(result.version).toBe(CURRENT_SESSION_VERSION)
    expect(result.tabs[0].savedViewId).toBeNull()
  })

  it('backfills savedViews when missing from v1 data', () => {
    const v1Data = {
      version: 1,
      pluginName: 'vs-browse-db',
      dataPath: '/test.db',
      savedAt: '2026-01-01T00:00:00Z',
      activeTabId: 'tab-1',
      tabs: [],
      // no savedViews
    }
    const result = migrateSession(v1Data)
    expect(result.savedViews).toEqual({ classView: [], callstack: [] })
  })

  it('preserves existing v1 savedViews through migration', () => {
    const views = {
      classView: [{ id: 'sv-1', name: 'View1', type: 'view', viewType: 'class-view', classId: 'c1' }],
      callstack: [],
    }
    const v1Data = {
      version: 1,
      pluginName: 'vs-browse-db',
      dataPath: '/test.db',
      savedAt: '2026-01-01T00:00:00Z',
      activeTabId: 'tab-1',
      tabs: [],
      savedViews: views,
    }
    const result = migrateSession(v1Data)
    expect(result.savedViews).toEqual(views)
  })

  // ---- Future version error ----

  it('throws SessionMigrationError for future versions', () => {
    const futureData = {
      version: 999,
      pluginName: 'vs-browse-db',
      dataPath: '/test.db',
      savedAt: '2026-01-01T00:00:00Z',
      activeTabId: 'tab-1',
      tabs: [],
    }
    expect(() => migrateSession(futureData)).toThrow(SessionMigrationError)
    try {
      migrateSession(futureData)
    } catch (err) {
      const e = err as SessionMigrationError
      expect(e.fromVersion).toBe(999)
      expect(e.toVersion).toBe(CURRENT_SESSION_VERSION)
      expect(e.message).toContain('newer than supported')
    }
  })

  // ---- SessionMigrationError shape ----

  it('SessionMigrationError carries version info and cause', () => {
    const err = new SessionMigrationError('test', 1, 2, new Error('inner'))
    expect(err.name).toBe('SessionMigrationError')
    expect(err.fromVersion).toBe(1)
    expect(err.toVersion).toBe(2)
    expect(err.cause).toBeInstanceOf(Error)
  })
})
