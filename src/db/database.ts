import initSqlJs, { type Database as SqlDatabase, type SqlValue } from 'sql.js'
import { MIGRATIONS } from './schema'

// Local-first SQLite via sql.js (WASM). The database bytes are persisted to
// IndexedDB after every write. When wrapped in Capacitor this module is the
// single place to swap in @capacitor-community/sqlite.

const IDB_NAME = 'coach-local'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'main.db'

type Listener = () => void

class Database {
  private db: SqlDatabase | null = null
  private listeners = new Set<Listener>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private inTx = 0
  private dirty = false
  private flushBound = false
  /** Set when another tab took over the database: this copy is stale and must never be written back. */
  private frozen = false
  /** True after a failed IndexedDB write (e.g. quota); cleared by the next successful persist. Listeners are notified on change. */
  persistFailed = false
  /** Called for every failed persist (after one retry) so the UI can warn that writes are not reaching disk. */
  onPersistError: ((e: unknown) => void) | null = null

  get ready() { return this.db !== null }

  async init(): Promise<void> {
    if (this.db) return
    // sql.js resolves to dist/sql-wasm-browser.js under Vite's `browser` export condition, which asks
    // for 'sql-wasm-browser.wasm'; only sql-wasm.wasm (byte-identical) is served from public/.
    // Under node (vitest) the default loader finds dist/sql-wasm.wasm next to the script.
    const SQL = await initSqlJs(typeof window === 'undefined' ? {} : { locateFile: () => '/sql-wasm.wasm' })
    const bytes = await idbGet()
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database()
    this.db.run('PRAGMA foreign_keys = ON;')
    this.migrate()
    this.bindFlush()
  }

  /**
   * iOS freezes timers the moment a home-screen PWA is backgrounded and may then kill it, so the
   * 250 ms debounce alone can lose the last write. Flush on hide, and ask for durable storage once.
   */
  private bindFlush() {
    if (this.flushBound || typeof window === 'undefined') return
    this.flushBound = true
    window.addEventListener('pagehide', () => this.flush())
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush() })
    try { navigator.storage?.persist?.().catch(() => {}) } catch { /* unsupported or insecure context */ }
  }

  private migrate() {
    const db = this.db!
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
    const row = db.exec(`SELECT value FROM meta WHERE key='schema_version'`)
    let version = row.length ? Number(row[0].values[0][0]) : 0
    for (let i = version; i < MIGRATIONS.length; i++) {
      db.exec(MIGRATIONS[i])
      version = i + 1
    }
    db.run(`INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)`, [String(version)])
    this.schedulePersist()
  }

  // --- query helpers -------------------------------------------------------

  all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db!.prepare(sql)
    stmt.bind(params)
    const out: T[] = []
    while (stmt.step()) out.push(stmt.getAsObject() as T)
    stmt.free()
    return out
  }

  get<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T | null {
    const rows = this.all<T>(sql, params)
    return rows[0] ?? null
  }

  run(sql: string, params: SqlValue[] = []): number {
    this.db!.run(sql, params)
    const id = this.get<{ id: number }>('SELECT last_insert_rowid() as id')!.id
    this.markDirty()
    return id
  }

  exec(sql: string) {
    this.db!.exec(sql)
    this.markDirty()
  }

  transaction<T>(fn: () => T): T {
    this.inTx++
    try {
      if (this.inTx === 1) this.db!.run('BEGIN')
      const r = fn()
      if (this.inTx === 1) this.db!.run('COMMIT')
      return r
    } catch (e) {
      if (this.inTx === 1) this.db!.run('ROLLBACK')
      throw e
    } finally {
      this.inTx--
      if (this.inTx === 0 && this.dirty) this.notify()
    }
  }

  // --- change notification -------------------------------------------------

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private markDirty() {
    this.dirty = true
    this.schedulePersist()
    if (this.inTx === 0) this.notify()
  }

  private notify() {
    this.dirty = false
    for (const l of this.listeners) l()
  }

  private schedulePersist() {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void this.persist(), 250)
  }

  /** Persist right away when a debounced write is pending (or the last attempt failed). */
  flush() {
    if (this.persistTimer === null && !this.persistFailed) return
    void this.persist()
  }

  /**
   * Writes the database bytes to IndexedDB. Never throws: a failure (QuotaExceededError is realistic,
   * photos live inside the blob) is retried once, then recorded on `persistFailed` and reported via
   * `onPersistError`. The in-memory database stays current either way.
   */
  async persist(): Promise<void> {
    if (!this.db || this.frozen) return
    if (this.persistTimer !== null) { clearTimeout(this.persistTimer); this.persistTimer = null }
    const bytes = this.snapshot()
    try {
      try {
        await idbPut(bytes)
      } catch {
        await idbPut(bytes)
      }
      if (this.persistFailed) { this.persistFailed = false; this.notify() }
    } catch (e) {
      console.error('[db] persist failed', e)
      const first = !this.persistFailed
      this.persistFailed = true
      this.onPersistError?.(e)
      if (first) this.notify()
    }
  }

  /**
   * sql.js `export()` closes and reopens the connection, which resets `PRAGMA foreign_keys` to OFF and
   * would silently disable ON DELETE CASCADE for the rest of the session — re-enable it after every snapshot.
   */
  private snapshot(): Uint8Array {
    const bytes = this.db!.export()
    this.db!.run('PRAGMA foreign_keys = ON;')
    return bytes
  }

  /** Stop persisting for good (another tab owns the database now). */
  freeze() {
    this.frozen = true
    if (this.persistTimer !== null) { clearTimeout(this.persistTimer); this.persistTimer = null }
  }

  // --- export / delete -----------------------------------------------------

  export(): Uint8Array { return this.snapshot() }

  exportJson(): Record<string, unknown[]> {
    const tables = this.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    const out: Record<string, unknown[]> = {}
    for (const t of tables) out[t.name] = this.all(`SELECT * FROM ${t.name}`)
    return out
  }

  async wipe() {
    if (this.db) { this.db.close(); this.db = null }
    await idbDelete()
    localStorage.clear()
  }
}

// --- IndexedDB persistence ---------------------------------------------------

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    // Close on versionchange so db.wipe()'s deleteDatabase is never blocked by our own idle connections
    // (otherwise the re-open in deleteAllData() waits on garbage collection to close them).
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result) }
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(): Promise<Uint8Array | null> {
  try {
    const idb = await openIdb()
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => resolve((req.result as Uint8Array) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbPut(bytes: Uint8Array): Promise<void> {
  const idb = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

export const db = new Database()
export type { SqlValue }
