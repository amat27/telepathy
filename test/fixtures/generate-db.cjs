#!/usr/bin/env node
// ============================================================
// Generate a test fixture Browse.VC.db with fictional classes
// ============================================================
// Usage: node test/fixtures/generate-db.cjs
//
// Creates test/fixtures/sample.db — a small SQLite database that
// matches the Browse.VC.db v18 schema, populated with fictional
// game-engine classes for integration testing.
// ============================================================

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = path.join(__dirname, 'sample.db')

// Remove existing DB (if it exists and isn't locked)
try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH) }
catch (e) { console.warn('Could not remove old DB:', e.message) }

const db = new Database(DB_PATH)

// ---- Schema ----

db.exec(`
  -- Metadata
  CREATE TABLE properties (
    name  TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Parsers
  CREATE TABLE parsers (
    parser_guid TEXT NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    short_name  TEXT NOT NULL
  );

  -- Kind definitions
  CREATE TABLE code_item_kinds (
    id          INTEGER NOT NULL PRIMARY KEY,
    name        TEXT NOT NULL,
    parser_guid TEXT NOT NULL REFERENCES parsers(parser_guid)
  );

  -- Source files
  CREATE TABLE files (
    id          INTEGER NOT NULL PRIMARY KEY,
    timestamp   INTEGER NOT NULL DEFAULT 0,
    parsetime   REAL    NOT NULL DEFAULT 0.0,
    addtime     REAL    NOT NULL DEFAULT 0.0,
    difftime    REAL    NOT NULL DEFAULT 0.0,
    name        TEXT    NOT NULL,
    leaf_name   TEXT    NOT NULL,
    extension   TEXT,
    attributes  INTEGER NOT NULL DEFAULT 0,
    parser_guid TEXT    NOT NULL REFERENCES parsers(parser_guid)
  );
  CREATE UNIQUE INDEX uq_files_name ON files(name);

  -- All symbols
  CREATE TABLE code_items (
    id                INTEGER NOT NULL PRIMARY KEY,
    file_id           INTEGER NOT NULL,
    parent_id         INTEGER NOT NULL DEFAULT 0,
    kind              INTEGER NOT NULL,
    attributes        INTEGER NOT NULL DEFAULT 0,
    name              TEXT    NOT NULL,
    type              TEXT,
    start_column      INTEGER NOT NULL DEFAULT 0,
    start_line        INTEGER NOT NULL DEFAULT 1,
    end_column        INTEGER NOT NULL DEFAULT 0,
    end_line          INTEGER NOT NULL DEFAULT 1,
    name_start_column INTEGER NOT NULL DEFAULT 0,
    name_start_line   INTEGER NOT NULL DEFAULT 1,
    name_end_column   INTEGER NOT NULL DEFAULT 0,
    name_end_line     INTEGER NOT NULL DEFAULT 1,
    param_default_value TEXT,
    param_default_value_start_column INTEGER,
    param_default_value_start_line   INTEGER,
    param_default_value_end_column   INTEGER,
    param_default_value_end_line     INTEGER,
    param_number      INTEGER,
    lower_name_hint   TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX ix_code_items_file_id ON code_items(file_id);

  -- Inheritance relationships
  CREATE TABLE base_class_parents (
    base_code_item_id   INTEGER NOT NULL REFERENCES code_items(id),
    parent_code_item_id INTEGER NOT NULL REFERENCES code_items(id),
    PRIMARY KEY (base_code_item_id, parent_code_item_id)
  ) WITHOUT ROWID;
`)

// ---- Seed data helpers ----

const CPP_GUID = '{c9c0868c-42a2-4dfa-a535-6c3be3f1f1c3}'
db.prepare('INSERT INTO parsers VALUES (?, ?, ?)').run(CPP_GUID, 'C/C++', 'cpp')

// Kind IDs matching Browse.VC.db v18
const KINDS = {
  class: 1, struct: 2, union: 3, enum: 4, typedef: 5,
  memberFunction: 6, member: 7, enumerator: 8, parameter: 9,
  baseClassMarker: 17, namespace: 18, function: 27, macro: 37,
}

for (const [name, id] of Object.entries(KINDS)) {
  db.prepare('INSERT INTO code_item_kinds VALUES (?, ?, ?)').run(id, name, CPP_GUID)
}

// Properties
const props = {
  version: '18.0', client_version: '18.0',
  indexes_ready: 'true', safe_to_open: 'true',
  enhanced_fts: 'false',
}
for (const [k, v] of Object.entries(props)) {
  db.prepare('INSERT INTO properties VALUES (?, ?)').run(k, v)
}

// Auto-increment counters
let nextFileId = 1
let nextItemId = 1

function addFile(fullPath) {
  const id = nextFileId++
  const leaf = path.basename(fullPath)
  const ext = path.extname(fullPath)
  db.prepare(`
    INSERT INTO files (id, name, leaf_name, extension, parser_guid)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, fullPath, leaf, ext, CPP_GUID)
  return id
}

const stmtInsertItem = db.prepare(`
  INSERT INTO code_items (id, file_id, parent_id, kind, name, type,
    start_line, end_line, start_column, end_column,
    name_start_line, name_end_line, name_start_column, name_end_column,
    lower_name_hint)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 1, ?, ?)
`)

function addItem(fileId, parentId, kind, name, type, startLine, endLine) {
  const id = nextItemId++
  const hint = name.substring(0, 4).toLowerCase()
  //       id, file_id, parent_id, kind, name, type,
  //       start_line, end_line,
  //       name_start_line, name_end_line, name_end_column, lower_name_hint
  stmtInsertItem.run(id, fileId, parentId, kind, name, type,
    startLine, endLine, startLine, startLine, name.length, hint)
  return id
}

function addInheritance(derivedClassId, baseMarkerItemId) {
  db.prepare(`
    INSERT INTO base_class_parents (base_code_item_id, parent_code_item_id)
    VALUES (?, ?)
  `).run(baseMarkerItemId, derivedClassId)
}

// ============================================================
// Fictional game-engine data
// ============================================================

// Use test-relative paths so getSourceSnippet can find stub files
const SRC_ROOT = 'C:/GameEngine/src'

// --- Files ---
const fEntity    = addFile(`${SRC_ROOT}/core/Entity.h`)
const fComponent = addFile(`${SRC_ROOT}/core/Component.h`)
const fTransform = addFile(`${SRC_ROOT}/core/Transform.h`)
const fRenderer  = addFile(`${SRC_ROOT}/rendering/MeshRenderer.h`)
const fRigidBody = addFile(`${SRC_ROOT}/physics/RigidBody.h`)
const fVector3   = addFile(`${SRC_ROOT}/math/Vector3.h`)
const fMatrix4   = addFile(`${SRC_ROOT}/math/Matrix4.h`)
const fAudio     = addFile(`${SRC_ROOT}/audio/AudioSource.h`)
const fTypes     = addFile(`${SRC_ROOT}/core/Types.h`)

// --- Namespace ---
const nsGameEngine = addItem(fEntity, 0, KINDS.namespace, 'GameEngine', null, 1, 200)

// --- Entity class (base, no inheritance) ---
const clsEntity = addItem(fEntity, nsGameEngine, KINDS.class, 'Entity', null, 5, 50)
addItem(fEntity, clsEntity, KINDS.member, 'm_id', 'uint32_t', 8, 8)
addItem(fEntity, clsEntity, KINDS.member, 'm_name', 'std::string', 9, 9)
addItem(fEntity, clsEntity, KINDS.member, 'm_active', 'bool', 10, 10)
addItem(fEntity, clsEntity, KINDS.memberFunction, 'Update', 'void (float deltaTime)', 15, 25)
addItem(fEntity, clsEntity, KINDS.memberFunction, 'Destroy', 'void ()', 27, 30)
addItem(fEntity, clsEntity, KINDS.memberFunction, 'GetId', 'uint32_t ()', 32, 34)
addItem(fEntity, clsEntity, KINDS.memberFunction, 'SetActive', 'void (bool active)', 36, 38)
// parameter (kind 9) — should be filtered out by plugin
addItem(fEntity, clsEntity, KINDS.parameter, 'deltaTime', 'float', 15, 15)

// --- Component class (base) ---
const clsComponent = addItem(fComponent, nsGameEngine, KINDS.class, 'Component', null, 5, 40)
addItem(fComponent, clsComponent, KINDS.member, 'm_owner', 'Entity *', 8, 8)
addItem(fComponent, clsComponent, KINDS.member, 'm_enabled', 'bool', 9, 9)
addItem(fComponent, clsComponent, KINDS.memberFunction, 'Initialize', 'void ()', 12, 18)
addItem(fComponent, clsComponent, KINDS.memberFunction, 'Tick', 'void (float dt)', 20, 30)
addItem(fComponent, clsComponent, KINDS.memberFunction, 'SetEnabled', 'void (bool enabled)', 32, 35)

// --- Transform extends Component ---
const clsTransform = addItem(fTransform, nsGameEngine, KINDS.class, 'Transform', null, 5, 60)
// base_class marker (kind 17) — "Transform inherits Component"
const baseMarkerTransform = addItem(fTransform, clsTransform, KINDS.baseClassMarker, 'Component', null, 5, 5)
addInheritance(clsTransform, baseMarkerTransform)

addItem(fTransform, clsTransform, KINDS.member, 'm_position', 'Vector3', 10, 10)
addItem(fTransform, clsTransform, KINDS.member, 'm_rotation', 'Vector3', 11, 11)
addItem(fTransform, clsTransform, KINDS.member, 'm_scale', 'Vector3', 12, 12)
addItem(fTransform, clsTransform, KINDS.memberFunction, 'SetPosition', 'void (const Vector3 &pos)', 16, 22)
addItem(fTransform, clsTransform, KINDS.memberFunction, 'GetWorldMatrix', 'Matrix4 ()', 24, 35)
addItem(fTransform, clsTransform, KINDS.memberFunction, 'Translate', 'void (const Vector3 &offset)', 37, 42)

// --- MeshRenderer extends Component ---
const clsRenderer = addItem(fRenderer, nsGameEngine, KINDS.class, 'MeshRenderer', null, 5, 50)
const baseMarkerRenderer = addItem(fRenderer, clsRenderer, KINDS.baseClassMarker, 'Component', null, 5, 5)
addInheritance(clsRenderer, baseMarkerRenderer)

addItem(fRenderer, clsRenderer, KINDS.member, 'm_mesh', 'Mesh *', 10, 10)
addItem(fRenderer, clsRenderer, KINDS.member, 'm_material', 'Material *', 11, 11)
addItem(fRenderer, clsRenderer, KINDS.memberFunction, 'Draw', 'void (const Matrix4 &viewProj)', 15, 30)
addItem(fRenderer, clsRenderer, KINDS.memberFunction, 'SetMaterial', 'void (Material *mat)', 32, 36)
addItem(fRenderer, clsRenderer, KINDS.memberFunction, 'SetMesh', 'void (Mesh *mesh)', 38, 42)

// --- RigidBody extends Component ---
const clsRigidBody = addItem(fRigidBody, nsGameEngine, KINDS.class, 'RigidBody', null, 5, 55)
const baseMarkerRB = addItem(fRigidBody, clsRigidBody, KINDS.baseClassMarker, 'Component', null, 5, 5)
addInheritance(clsRigidBody, baseMarkerRB)

addItem(fRigidBody, clsRigidBody, KINDS.member, 'm_mass', 'float', 10, 10)
addItem(fRigidBody, clsRigidBody, KINDS.member, 'm_velocity', 'Vector3', 11, 11)
addItem(fRigidBody, clsRigidBody, KINDS.member, 'm_isKinematic', 'bool', 12, 12)
addItem(fRigidBody, clsRigidBody, KINDS.memberFunction, 'ApplyForce', 'void (const Vector3 &force)', 16, 25)
addItem(fRigidBody, clsRigidBody, KINDS.memberFunction, 'Simulate', 'void (float dt)', 27, 40)
addItem(fRigidBody, clsRigidBody, KINDS.memberFunction, 'SetMass', 'void (float mass)', 42, 46)

// --- AudioSource extends Component ---
const clsAudio = addItem(fAudio, nsGameEngine, KINDS.class, 'AudioSource', null, 5, 45)
const baseMarkerAudio = addItem(fAudio, clsAudio, KINDS.baseClassMarker, 'Component', null, 5, 5)
addInheritance(clsAudio, baseMarkerAudio)

addItem(fAudio, clsAudio, KINDS.member, 'm_volume', 'float', 10, 10)
addItem(fAudio, clsAudio, KINDS.member, 'm_loop', 'bool', 11, 11)
addItem(fAudio, clsAudio, KINDS.memberFunction, 'Play', 'void ()', 14, 20)
addItem(fAudio, clsAudio, KINDS.memberFunction, 'Stop', 'void ()', 22, 26)
addItem(fAudio, clsAudio, KINDS.memberFunction, 'SetVolume', 'void (float volume)', 28, 32)

// --- Vector3 struct (no inheritance) ---
const stVector3 = addItem(fVector3, nsGameEngine, KINDS.struct, 'Vector3', null, 3, 60)
addItem(fVector3, stVector3, KINDS.member, 'x', 'float', 5, 5)
addItem(fVector3, stVector3, KINDS.member, 'y', 'float', 6, 6)
addItem(fVector3, stVector3, KINDS.member, 'z', 'float', 7, 7)
addItem(fVector3, stVector3, KINDS.memberFunction, 'Normalize', 'Vector3 ()', 10, 16)
addItem(fVector3, stVector3, KINDS.memberFunction, 'Dot', 'float (const Vector3 &other)', 18, 22)
addItem(fVector3, stVector3, KINDS.memberFunction, 'Cross', 'Vector3 (const Vector3 &other)', 24, 30)
addItem(fVector3, stVector3, KINDS.memberFunction, 'Length', 'float ()', 32, 36)
addItem(fVector3, stVector3, KINDS.memberFunction, 'operator+', 'Vector3 (const Vector3 &rhs)', 38, 42)

// --- Matrix4 struct ---
const stMatrix4 = addItem(fMatrix4, nsGameEngine, KINDS.struct, 'Matrix4', null, 3, 55)
addItem(fMatrix4, stMatrix4, KINDS.member, 'm', 'float[16]', 5, 5)
addItem(fMatrix4, stMatrix4, KINDS.memberFunction, 'Multiply', 'Matrix4 (const Matrix4 &other)', 8, 20)
addItem(fMatrix4, stMatrix4, KINDS.memberFunction, 'Inverse', 'Matrix4 ()', 22, 35)
addItem(fMatrix4, stMatrix4, KINDS.memberFunction, 'Transpose', 'Matrix4 ()', 37, 45)
addItem(fMatrix4, stMatrix4, KINDS.memberFunction, 'Identity', 'static Matrix4 ()', 47, 52)

// --- ShaderType enum ---
const enumShader = addItem(fTypes, nsGameEngine, KINDS.enum, 'ShaderType', null, 5, 12)
addItem(fTypes, enumShader, KINDS.enumerator, 'Vertex', null, 7, 7)
addItem(fTypes, enumShader, KINDS.enumerator, 'Fragment', null, 8, 8)
addItem(fTypes, enumShader, KINDS.enumerator, 'Compute', null, 9, 9)
addItem(fTypes, enumShader, KINDS.enumerator, 'Geometry', null, 10, 10)

// --- EntityId typedef ---
addItem(fTypes, nsGameEngine, KINDS.typedef, 'EntityId', 'uint32_t', 14, 14)

// --- A free function (kind 27) ---
addItem(fEntity, nsGameEngine, KINDS.function, 'CreateEntity', 'Entity * (const std::string &name)', 55, 65)

// --- A macro (kind 37) ---
addItem(fTypes, 0, KINDS.macro, 'ENGINE_API', null, 1, 1)

// ---- Update code_items_cnt property ----
const totalItems = db.prepare('SELECT COUNT(*) as c FROM code_items').get().c
db.prepare('INSERT OR REPLACE INTO properties VALUES (?, ?)').run('code_items_cnt', String(totalItems))

// ---- Summary ----
const fileCount = db.prepare('SELECT COUNT(*) as c FROM files').get().c
const classCount = db.prepare("SELECT COUNT(*) as c FROM code_items WHERE kind IN (1, 2)").get().c
const inheritCount = db.prepare('SELECT COUNT(*) as c FROM base_class_parents').get().c

console.log(`Generated: ${DB_PATH}`)
console.log(`  Files:        ${fileCount}`)
console.log(`  Code items:   ${totalItems}`)
console.log(`  Classes:      ${classCount}`)
console.log(`  Inheritance:  ${inheritCount} relations`)

db.close()

// When run via Electron (needed for native better-sqlite3), force exit
if (process.versions.electron) {
  process.exit(0)
}
