import { describe, it, expect } from 'vitest'
import {
  parseCallstack,
  resolveCallstack,
  splitQualified,
  preprocessLine,
} from '../callstackParser'

// ============================================================
// splitQualified
// ============================================================

describe('splitQualified', () => {
  it('splits simple qualified name', () => {
    expect(splitQualified('A::B::C')).toEqual(['A', 'B', 'C'])
  })

  it('handles templates with :: inside angle brackets', () => {
    expect(splitQualified('A<X::Y>::B')).toEqual(['A<X::Y>', 'B'])
  })

  it('handles nested templates', () => {
    expect(splitQualified('A<B<C::D>>::E')).toEqual(['A<B<C::D>>', 'E'])
  })

  it('handles <lambda> token', () => {
    expect(splitQualified('A::B::<lambda>')).toEqual(['A', 'B', '<lambda>'])
  })

  it('handles single identifier (no ::)', () => {
    expect(splitQualified('FooBar')).toEqual(['FooBar'])
  })

  it('handles template without ::', () => {
    expect(splitQualified('ConvertExceptionsToPFResult<...>')).toEqual([
      'ConvertExceptionsToPFResult<...>',
    ])
  })
})

// ============================================================
// preprocessLine
// ============================================================

describe('preprocessLine', () => {
  it('strips VS debugger tab-separated format', () => {
    expect(preprocessLine('\tTMJobGraph::CreateInstance\tC++')).toBe(
      'TMJobGraph::CreateInstance'
    )
  })

  it('strips VS current-frame marker >', () => {
    expect(preprocessLine('>\tPCASTDDLTabularBase::Dispatch\tC++')).toBe(
      'PCASTDDLTabularBase::Dispatch'
    )
  })

  it('returns null for [External Code]', () => {
    expect(preprocessLine('\t[External Code]')).toBeNull()
  })

  it('extracts symbol after module ! separator', () => {
    expect(preprocessLine('MyApp.exe!TMSavePoint::Create')).toBe(
      'TMSavePoint::Create'
    )
  })

  it('strips WinDbg +0x offset', () => {
    expect(preprocessLine('module!TMSavePoint::Create+0x42')).toBe(
      'TMSavePoint::Create'
    )
  })

  it('strips parenthesized parameter lists', () => {
    expect(preprocessLine('TMSavePoint::Create()')).toBe('TMSavePoint::Create')
    expect(preprocessLine('TMSavePoint::Create(int x)')).toBe(
      'TMSavePoint::Create'
    )
  })

  it('strips VS Line number suffix', () => {
    expect(preprocessLine('MyApp.exe!TMSavePoint::Create() Line 120')).toBe(
      'TMSavePoint::Create'
    )
  })

  it('strips GDB format: frame number, args, file location', () => {
    expect(
      preprocessLine('#0  MyClass::DoWork (this=0x7fff) at file.cpp:123')
    ).toBe('MyClass::DoWork')
  })

  it('strips leading frame numbers', () => {
    expect(preprocessLine('00 module!TMSavePoint::Create+0x42')).toBe(
      'TMSavePoint::Create'
    )
  })

  it('returns null for empty/whitespace lines', () => {
    expect(preprocessLine('')).toBeNull()
    expect(preprocessLine('   ')).toBeNull()
    expect(preprocessLine('\t\t')).toBeNull()
  })

  it('preserves lambda and template tokens', () => {
    expect(
      preprocessLine('\tPCASTBatch::Dispatch::__l229::<lambda>\tC++')
    ).toBe('PCASTBatch::Dispatch::__l229::<lambda>')
  })

  it('preserves standalone template function', () => {
    expect(
      preprocessLine('\tConvertExceptionsToPFResult<...>\tC++')
    ).toBe('ConvertExceptionsToPFResult<...>')
  })
})

// ============================================================
// parseCallstack
// ============================================================

describe('parseCallstack', () => {
  it('parses simple Class::Method lines', () => {
    const text = `
      TMSavePoint::InitSavePoint
      TMainForm::DoSave
    `
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(2)
    expect(entries[0].segments).toEqual(['TMSavePoint', 'InitSavePoint'])
    expect(entries[0].label).toBe('TMSavePoint::InitSavePoint')
    expect(entries[1].segments).toEqual(['TMainForm', 'DoSave'])
  })

  it('parses WinDbg format (module!Class::Method+offset)', () => {
    const text = `
      00 module!TMSavePoint::InitSavePoint+0x42
      01 module!TMainForm::DoSave+0x18
      02 module!TApplication::HandleEvent+0x55
    `
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(3)
    expect(entries[0].segments).toEqual(['TMSavePoint', 'InitSavePoint'])
    expect(entries[1].segments).toEqual(['TMainForm', 'DoSave'])
    expect(entries[2].segments).toEqual(['TApplication', 'HandleEvent'])
  })

  it('parses Visual Studio format with Line numbers', () => {
    const text = `
      > MyApp.exe!TMSavePoint::Create() Line 120
        MyApp.exe!TMainForm::OnSaveClick() Line 350
    `
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(2)
    expect(entries[0].segments).toEqual(['TMSavePoint', 'Create'])
    expect(entries[1].segments).toEqual(['TMainForm', 'OnSaveClick'])
  })

  it('parses VS debugger tab-separated format with C++ suffix', () => {
    const text =
      '\tTMJobGraph::CreateInstance\tC++\n' +
      '>\tPCASTDDLTabularBase::Dispatch\tC++\n' +
      '\tPCASTBatch::Dispatch::__l229::<lambda>\tC++\n' +
      '\tConvertExceptionsToPFResult<...>\tC++\n' +
      '\tPCASTBatch::Dispatch\tC++\n' +
      '\t[External Code]\n'
    const entries = parseCallstack(text)
    // [External Code] is skipped; 5 entries total
    expect(entries).toHaveLength(5)
    expect(entries[0]).toMatchObject({
      segments: ['TMJobGraph', 'CreateInstance'],
      label: 'TMJobGraph::CreateInstance',
    })
    expect(entries[1]).toMatchObject({
      segments: ['PCASTDDLTabularBase', 'Dispatch'],
      label: 'PCASTDDLTabularBase::Dispatch',
    })
    expect(entries[2]).toMatchObject({
      segments: ['PCASTBatch', 'Dispatch', '__l229', '<lambda>'],
      label: 'PCASTBatch::Dispatch::__l229::<lambda>',
    })
    // Standalone template function — no :: → segments=null
    expect(entries[3]).toMatchObject({
      segments: null,
      label: 'ConvertExceptionsToPFResult<...>',
    })
    expect(entries[4]).toMatchObject({
      segments: ['PCASTBatch', 'Dispatch'],
      label: 'PCASTBatch::Dispatch',
    })
  })

  it('extracts longest :: chain from a line with namespaces', () => {
    const text = 'module!Namespace::SubNs::MyClass::DoWork+0x10'
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].segments).toEqual([
      'Namespace',
      'SubNs',
      'MyClass',
      'DoWork',
    ])
  })

  it('skips lines without :: separators that have spaces', () => {
    const text = `
      some random text
      TMSavePoint::Create
      another line without scope
    `
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].segments).toEqual(['TMSavePoint', 'Create'])
  })

  it('includes standalone symbol without :: (no spaces)', () => {
    const text = 'SomeGlobalFunction'
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].segments).toBeNull()
    expect(entries[0].label).toBe('SomeGlobalFunction')
  })

  it('skips empty lines', () => {
    const text = '\n\n  \n'
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(0)
  })

  it('handles GDB format', () => {
    const text = `
      #0  MyClass::DoWork (this=0x7fff) at file.cpp:123
      #1  OtherClass::Init (arg=42) at file2.cpp:456
    `
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(2)
    expect(entries[0].segments).toEqual(['MyClass', 'DoWork'])
    expect(entries[1].segments).toEqual(['OtherClass', 'Init'])
  })

  it('handles CRLF line endings', () => {
    const text = 'A::B\r\nC::D\r\n'
    const entries = parseCallstack(text)
    expect(entries).toHaveLength(2)
  })
})

// ============================================================
// resolveCallstack
// ============================================================

describe('resolveCallstack', () => {
  const knownClasses = new Map<string, string>([
    ['TMSavePoint', '100'],
    ['TMainForm', '200'],
    ['TApplication', '300'],
    ['Namespace::SubNs::MyClass', '400'],
    ['MyClass', '400'],
    ['PCASTBatch', '500'],
  ])

  it('resolves simple entries and includes unresolved frames', () => {
    const entries = parseCallstack(`
      TMSavePoint::Create
      TMainForm::DoSave
      Unknown::Method
    `)
    const frames = resolveCallstack(entries, knownClasses)
    expect(frames).toHaveLength(3)
    expect(frames[0]).toMatchObject({
      className: 'TMSavePoint',
      classId: '100',
      methodName: 'Create',
    })
    expect(frames[1]).toMatchObject({
      className: 'TMainForm',
      classId: '200',
      methodName: 'DoSave',
    })
    // Unknown::Method is unresolved
    expect(frames[2]).toMatchObject({
      className: null,
      classId: null,
      methodName: null,
      label: 'Unknown::Method',
    })
  })

  it('resolves namespaced entries trying full name first', () => {
    const entries = parseCallstack('module!Namespace::SubNs::MyClass::DoWork+0x10')
    const frames = resolveCallstack(entries, knownClasses)
    expect(frames).toHaveLength(1)
    // Should match "Namespace::SubNs::MyClass" (full qualified) before "MyClass" (short)
    expect(frames[0]).toMatchObject({
      className: 'Namespace::SubNs::MyClass',
      classId: '400',
      methodName: 'DoWork',
    })
  })

  it('falls back to shorter class name if full qualified not found', () => {
    const classes = new Map<string, string>([['MyClass', '400']])
    const entries = parseCallstack('Unknown::MyClass::DoWork')
    const frames = resolveCallstack(entries, classes)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      className: 'MyClass',
      classId: '400',
      methodName: 'DoWork',
    })
  })

  it('tries all split points to find matching class', () => {
    // PCASTBatch::Dispatch::__l229::<lambda>
    // Class is PCASTBatch (split at index 1), method is Dispatch
    const entries = parseCallstack(
      '\tPCASTBatch::Dispatch::__l229::<lambda>\tC++'
    )
    const frames = resolveCallstack(entries, knownClasses)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      className: 'PCASTBatch',
      classId: '500',
      methodName: 'Dispatch',
    })
  })

  it('returns unresolved frame when no class matches', () => {
    const entries = parseCallstack('Unknown::Method')
    const frames = resolveCallstack(entries, knownClasses)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      className: null,
      classId: null,
      methodName: null,
    })
  })

  it('returns unresolved frame for standalone function', () => {
    const entries = parseCallstack(
      '\tConvertExceptionsToPFResult<...>\tC++'
    )
    const frames = resolveCallstack(entries, knownClasses)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      className: null,
      classId: null,
      methodName: null,
      label: 'ConvertExceptionsToPFResult<...>',
    })
  })

  it('returns empty array for empty input', () => {
    const frames = resolveCallstack([], knownClasses)
    expect(frames).toHaveLength(0)
  })

  it('handles full VS debugger callstack with mixed resolved/unresolved', () => {
    const classes = new Map<string, string>([
      ['TMJobGraph', '10'],
      ['PCASTDDLTabularBase', '20'],
      ['PCASTBatch', '30'],
    ])
    const text =
      '\tTMJobGraph::CreateInstance\tC++\n' +
      '>\tPCASTDDLTabularBase::Dispatch\tC++\n' +
      '\tPCASTBatch::Dispatch::__l229::<lambda>\tC++\n' +
      '\tConvertExceptionsToPFResult<...>\tC++\n' +
      '\tPCASTBatch::Dispatch\tC++\n' +
      '\t[External Code]\n'
    const entries = parseCallstack(text)
    const frames = resolveCallstack(entries, classes)

    expect(frames).toHaveLength(5)
    expect(frames[0]).toMatchObject({ classId: '10', methodName: 'CreateInstance' })
    expect(frames[1]).toMatchObject({ classId: '20', methodName: 'Dispatch' })
    expect(frames[2]).toMatchObject({ classId: '30', methodName: 'Dispatch' })
    expect(frames[3]).toMatchObject({ classId: null, label: 'ConvertExceptionsToPFResult<...>' })
    expect(frames[4]).toMatchObject({ classId: '30', methodName: 'Dispatch' })
  })
})
