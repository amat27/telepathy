// ============================================================
// Tests: appStore — setClassFilter debounce + loadClasses request-ID guard
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '../appStore'

// Mock the api module — we don't want real IPC calls
vi.mock('../../api', () => ({
  getClasses: vi.fn().mockResolvedValue([]),
  initPlugin: vi.fn().mockResolvedValue(undefined),
  getClassDetail: vi.fn().mockResolvedValue(null),
  getClassHierarchy: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
  searchSymbols: vi.fn().mockResolvedValue([]),
  getSourceSnippet: vi.fn().mockResolvedValue(''),
  openDbDialog: vi.fn().mockResolvedValue(null),
}))

import * as api from '../../api'

const mockedGetClasses = vi.mocked(api.getClasses)

describe('appStore — setClassFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset store state
    useAppStore.setState({
      classFilter: '',
      classes: [],
      isLoadingClasses: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates classFilter state immediately (synchronous)', () => {
    const { setClassFilter } = useAppStore.getState()
    setClassFilter('foo')
    expect(useAppStore.getState().classFilter).toBe('foo')
  })

  it('does NOT call loadClasses synchronously — only after debounce delay', () => {
    const { setClassFilter } = useAppStore.getState()
    setClassFilter('bar')
    // loadClasses should NOT have been called yet (no IPC)
    expect(mockedGetClasses).not.toHaveBeenCalled()

    // Advance past debounce delay
    vi.advanceTimersByTime(200)
    expect(mockedGetClasses).toHaveBeenCalledTimes(1)
    expect(mockedGetClasses).toHaveBeenCalledWith('bar')
  })

  it('rapid typing (5 calls in 50ms) results in only 1 loadClasses call', () => {
    const { setClassFilter } = useAppStore.getState()
    setClassFilter('a')
    vi.advanceTimersByTime(10)
    setClassFilter('ab')
    vi.advanceTimersByTime(10)
    setClassFilter('abc')
    vi.advanceTimersByTime(10)
    setClassFilter('abcd')
    vi.advanceTimersByTime(10)
    setClassFilter('abcde')

    // No calls yet — still within debounce window
    expect(mockedGetClasses).not.toHaveBeenCalled()

    // Advance past debounce
    vi.advanceTimersByTime(200)
    expect(mockedGetClasses).toHaveBeenCalledTimes(1)
    expect(mockedGetClasses).toHaveBeenCalledWith('abcde')
  })
})

describe('appStore — loadClasses request-ID guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useAppStore.setState({
      classFilter: '',
      classes: [],
      isLoadingClasses: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stale response is discarded — only latest result updates classes', async () => {
    // First call: resolves slowly with stale data
    let resolveFirst: (value: any) => void
    const firstPromise = new Promise<any[]>((res) => { resolveFirst = res })

    // Second call: resolves quickly with fresh data
    let resolveSecond: (value: any) => void
    const secondPromise = new Promise<any[]>((res) => { resolveSecond = res })

    mockedGetClasses
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise)

    const { loadClasses } = useAppStore.getState()

    // Fire two concurrent loadClasses calls (simulating debounce firing twice)
    const p1 = loadClasses('stale')
    const p2 = loadClasses('fresh')

    // Resolve second first (fresh result arrives first)
    resolveSecond!([{ id: 'fresh-1', name: 'Fresh' }] as any)
    await p2

    expect(useAppStore.getState().classes).toEqual([{ id: 'fresh-1', name: 'Fresh' }])

    // Now resolve first (stale result arrives late)
    resolveFirst!([{ id: 'stale-1', name: 'Stale' }] as any)
    await p1

    // State should still show fresh data — stale response was discarded
    expect(useAppStore.getState().classes).toEqual([{ id: 'fresh-1', name: 'Fresh' }])
  })

  it('isLoadingClasses is true while query is in-flight, false after resolve', async () => {
    let resolveClasses: (value: any) => void
    const classesPromise = new Promise<any[]>((res) => { resolveClasses = res })
    mockedGetClasses.mockReturnValueOnce(classesPromise)

    const { loadClasses } = useAppStore.getState()
    const p = loadClasses('test')

    expect(useAppStore.getState().isLoadingClasses).toBe(true)

    resolveClasses!([])
    await p

    expect(useAppStore.getState().isLoadingClasses).toBe(false)
  })
})
