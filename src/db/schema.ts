// Ordered migrations. Each entry runs once; the version is stored in `meta`.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    dob TEXT NOT NULL,
    sex TEXT NOT NULL,
    height_cm REAL NOT NULL,
    units TEXT NOT NULL DEFAULT 'metric',
    experience TEXT NOT NULL DEFAULT 'intermediate',
    diet_pattern TEXT NOT NULL DEFAULT '',
    equipment_json TEXT NOT NULL DEFAULT '[]',
    mobility_priorities_json TEXT NOT NULL DEFAULT '[]',
    coach_style TEXT NOT NULL DEFAULT 'demanding',
    training_days_min INTEGER NOT NULL DEFAULT 3,
    training_days_target INTEGER NOT NULL DEFAULT 4,
    training_days_stretch INTEGER NOT NULL DEFAULT 5,
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, target_value REAL NOT NULL, unit TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1, start_date TEXT NOT NULL, target_date TEXT,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS condition_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region TEXT NOT NULL, label TEXT NOT NULL, baseline_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS symptom_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, region TEXT NOT NULL, pain_score INTEGER NOT NULL,
    red_flags_json TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT 'manual', session_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_symptom_ts ON symptom_checks(ts);

  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, equipment TEXT NOT NULL,
    primary_muscles_json TEXT NOT NULL, secondary_muscles_json TEXT NOT NULL,
    pattern TEXT NOT NULL, safety_tags_json TEXT NOT NULL, substitutions_json TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '', timed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'minimum',
    scheduled_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned',
    started_at TEXT, completed_at TEXT, duration_min INTEGER, readiness TEXT,
    session_rpe REAL, notes TEXT NOT NULL DEFAULT '', exercises_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON workout_sessions(scheduled_date);

  CREATE TABLE IF NOT EXISTS exercise_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL, set_index INTEGER NOT NULL,
    reps INTEGER, load_kg REAL, rir REAL, rpe REAL, duration_sec INTEGER,
    pain_flag INTEGER NOT NULL DEFAULT 0, logged_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sets_session ON exercise_sets(session_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise ON exercise_sets(exercise_id, logged_at);

  CREATE TABLE IF NOT EXISTS cardio_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER, modality TEXT NOT NULL, duration_min INTEGER NOT NULL,
    distance_km REAL, avg_hr INTEGER, ts TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual'
  );

  CREATE TABLE IF NOT EXISTS mobility_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id TEXT NOT NULL, ts TEXT NOT NULL, movements_json TEXT NOT NULL DEFAULT '[]',
    completed INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS body_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, type TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  );
  CREATE INDEX IF NOT EXISTS idx_body_ts ON body_metrics(type, ts);

  CREATE TABLE IF NOT EXISTS progress_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, angle TEXT NOT NULL, uri TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, meal_type TEXT NOT NULL, photo_uri TEXT, notes TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual', saved_name TEXT, is_saved INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_meals_ts ON meals(ts);

  CREATE TABLE IF NOT EXISTS food_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    food_name TEXT NOT NULL, quantity_g REAL NOT NULL, serving_description TEXT NOT NULL DEFAULT '',
    kcal REAL NOT NULL, protein_g REAL NOT NULL, carbs_g REAL NOT NULL, fat_g REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual', confidence REAL, uncertainty_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS nutrition_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date TEXT NOT NULL, end_date TEXT, kcal INTEGER NOT NULL, protein_g INTEGER NOT NULL,
    carbs_g INTEGER NOT NULL, fat_g INTEGER NOT NULL, rationale TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sleep_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_ts TEXT NOT NULL, end_ts TEXT NOT NULL, duration_min INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual', quality INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_sleep_end ON sleep_records(end_ts);

  CREATE TABLE IF NOT EXISTS health_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, type TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual'
  );

  CREATE TABLE IF NOT EXISTS daily_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE, energy INTEGER, soreness INTEGER, stress INTEGER, notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS coach_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, rationale TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]', action_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed', result_notes TEXT NOT NULL DEFAULT '', decided_at TEXT
  );

  CREATE TABLE IF NOT EXISTS coach_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS voice_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, transcript TEXT NOT NULL, intent TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS privacy_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, provider TEXT NOT NULL, data_type TEXT NOT NULL, purpose TEXT NOT NULL,
    bytes INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL
  );
  `,
  // Pain / Issue reports remember the exercise they were filed against (progression hold without a logged set).
  `ALTER TABLE symptom_checks ADD COLUMN exercise_id TEXT;`,
  // Mind pillar: mood check-ins, breathing / wind-down sessions, local-only journal.
  `
  CREATE TABLE IF NOT EXISTS mood_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'momentary', valence INTEGER NOT NULL,
    labels_json TEXT NOT NULL DEFAULT '[]', contexts_json TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_mood_ts ON mood_logs(ts);

  CREATE TABLE IF NOT EXISTS mind_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'breathing', technique TEXT NOT NULL DEFAULT '',
    duration_sec INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 1,
    valence_before INTEGER, valence_after INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_mind_sessions_ts ON mind_sessions(ts);

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, prompt_id TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS idx_journal_ts ON journal_entries(ts);
  `,
  // Health reports: uploaded blood tests, body-composition scans, clinical notes. Values are transcribed as printed.
  `
  CREATE TABLE IF NOT EXISTS health_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'other', title TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '', media_type TEXT NOT NULL DEFAULT '', file_data_url TEXT,
    status TEXT NOT NULL DEFAULT 'manual', summary TEXT NOT NULL DEFAULT '',
    markers_json TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_health_reports_ts ON health_reports(ts);
  `,
]
