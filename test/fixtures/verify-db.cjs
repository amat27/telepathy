// Quick verification script — runs all 10 prepared statements from VsBrowseDbPlugin
// against the test fixture DB to ensure compatibility.

const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'sample.db')
const db = new Database(DB_PATH, { readonly: true })

function test(label, fn) {
  try {
    const result = fn()
    const summary = Array.isArray(result)
      ? `${result.length} rows`
      : JSON.stringify(result)
    console.log(`  OK  ${label} -> ${summary}`)
  } catch (err) {
    console.error(`  FAIL ${label} -> ${err.message}`)
    process.exitCode = 1
  }
}

console.log('=== Verifying sample.db against plugin queries ===\n')

// 1. stmtGetClasses
test('getClasses (no filter)', () =>
  db.prepare(`
    SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
           ci.start_line, ci.start_column, ci.end_line, ci.end_column,
           MAX((SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17))) as member_count
    FROM code_items ci
    WHERE ci.kind IN (1, 2)
      AND (SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17)) > 0
    GROUP BY ci.name, ci.kind
    ORDER BY ci.name COLLATE NOCASE
    LIMIT 5000
  `).all()
)

// 2. stmtGetClassesFiltered
test('getClasses (filter "vec")', () =>
  db.prepare(`
    SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
           ci.start_line, ci.start_column, ci.end_line, ci.end_column,
           MAX((SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17))) as member_count
    FROM code_items ci
    WHERE ci.kind IN (1, 2) AND ci.name LIKE ?
      AND (SELECT COUNT(*) FROM code_items m WHERE m.parent_id = ci.id AND m.kind NOT IN (9, 17)) > 0
    GROUP BY ci.name, ci.kind
    ORDER BY ci.name COLLATE NOCASE
    LIMIT 5000
  `).all('%vec%')
)

// 3. stmtGetClassDetail — find Transform's ID first
const transformRow = db.prepare("SELECT id FROM code_items WHERE name = 'Transform' AND kind = 1").get()
const transformId = transformRow ? transformRow.id : 1

test('getClassDetail (Transform)', () =>
  db.prepare(`
    SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
           ci.start_line, ci.start_column, ci.end_line, ci.end_column
    FROM code_items ci
    WHERE ci.id = ?
  `).get(transformId)
)

// 4. stmtGetMembers
test('getMembers (Transform)', () =>
  db.prepare(`
    SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
           ci.start_line, ci.start_column, ci.end_line, ci.end_column
    FROM code_items ci
    WHERE ci.parent_id = ? AND ci.kind NOT IN (9, 17)
    ORDER BY ci.start_line
  `).all(transformId)
)

// 5. stmtGetBases
test('getBases (Transform)', () =>
  db.prepare(`
    SELECT bcp.base_code_item_id, bcp.parent_code_item_id,
           base_marker.name as base_name,
           (SELECT bc.id FROM code_items bc
            WHERE bc.name = base_marker.name AND bc.kind IN (1, 2)
            ORDER BY (SELECT COUNT(*) FROM code_items m
                      WHERE m.parent_id = bc.id AND m.kind NOT IN (9, 17)) DESC,
                     bc.id
            LIMIT 1) as base_class_id
    FROM base_class_parents bcp
    JOIN code_items base_marker ON base_marker.id = bcp.base_code_item_id
    WHERE bcp.parent_code_item_id = ?
  `).all(transformId)
)

// 6. stmtGetDerived (Component -> should find Transform, MeshRenderer, etc.)
test('getDerived (Component)', () =>
  db.prepare(`
    SELECT derived.id, derived.file_id, derived.parent_id,
           derived.kind, derived.name, derived.type,
           derived.start_line, derived.start_column,
           derived.end_line, derived.end_column
    FROM (
      SELECT DISTINCT d.name as dname,
             (SELECT best.id FROM code_items best
              WHERE best.name = d.name AND best.kind IN (1, 2)
              ORDER BY (SELECT COUNT(*) FROM code_items m
                        WHERE m.parent_id = best.id AND m.kind NOT IN (9, 17)) DESC,
                       best.id
              LIMIT 1) as best_id
      FROM base_class_parents bcp
      JOIN code_items base_marker ON base_marker.id = bcp.base_code_item_id
      JOIN code_items d ON d.id = bcp.parent_code_item_id
      WHERE base_marker.name = ?
    ) sub
    JOIN code_items derived ON derived.id = sub.best_id
  `).all('Component')
)

// 7. stmtSearchSymbols
test('searchSymbols ("Set")', () =>
  db.prepare(`
    SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
           ci.start_line, ci.start_column, ci.end_line, ci.end_column
    FROM code_items ci
    WHERE ci.name LIKE ? AND ci.kind IN (1, 2, 6, 7, 27, 4, 5, 18)
    ORDER BY
      CASE WHEN ci.name LIKE ? THEN 0 ELSE 1 END,
      ci.name COLLATE NOCASE
    LIMIT ?
  `).all('%Set%', 'Set%', 50)
)

// 8. stmtGetFile
const fileRow = db.prepare('SELECT id FROM files LIMIT 1').get()
test('getFile', () =>
  db.prepare('SELECT id, name, leaf_name FROM files WHERE id = ?').get(fileRow.id)
)

// 9. stmtGetItem
test('getItem', () =>
  db.prepare(`
    SELECT ci.id, ci.file_id, ci.parent_id, ci.kind, ci.name, ci.type,
           ci.start_line, ci.start_column, ci.end_line, ci.end_column
    FROM code_items ci WHERE ci.id = ?
  `).get(transformId)
)

// 10. stmtResolveType
test('resolveType ("Vector3")', () =>
  db.prepare(`
    SELECT id, kind, name FROM code_items
    WHERE name = ? AND kind IN (1, 2)
    ORDER BY (SELECT COUNT(*) FROM code_items m
              WHERE m.parent_id = code_items.id AND m.kind NOT IN (9, 17)) DESC,
             id
    LIMIT 1
  `).get('Vector3')
)

console.log('\n=== Verification complete ===')
db.close()

if (process.versions.electron) process.exit(process.exitCode || 0)
