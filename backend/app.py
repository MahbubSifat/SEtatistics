"""
CP Student Tracker  -  Backend (Flask + SQLite)
===============================================
Run locally : python app.py                     -> http://localhost:5000
Daily sync  : automatic at 23:59 Dhaka while `python app.py` runs (AUTO_SYNC=1)
              python app.py sync                -> PythonAnywhere "Scheduled task" / manual
New login   : python app.py create-user EMAIL "Full Name" [admin|developer]
Reset pass  : python app.py set-password EMAIL

Keep these in the SAME folder:
    codeforces.py, leetcode.py, codechef.py   (fetchers, return {"solved", "rating", "rank"})
    .env                                      (settings, see .env.example)

Tables (think of a school notebook):
    users             -> people who can log in: role 'admin' or 'developer'
                         (optionally linked to their own student profile)
    students          -> the students we track (+ photo, github, linkedin, special role)
    platform_accounts -> one row per student per platform, holding the LATEST solved count
    solve_snapshots   -> one row per account per day (Dhaka date)  = the history
    sync_runs         -> progress of every sync (in the DB, so it survives restarts / workers)
    activity_logs     -> who did what, and when
    pending_imports   -> Excel previews waiting for "Confirm"
    meta              -> tiny key/value store (cache version, last beecrowd push time)

How "this day / last 3 days / last week / last month" works:
    Every sync writes today's total into solve_snapshots (1 row per account per day; a
    second sync on the same day just updates that row).
        solved in a window = latest total - total at the end of the day BEFORE the window
    If the account has no snapshot that old, its very first synced total is used instead,
    so the first sync never counts old problems as "new".
"""

import getpass
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import sqlite3
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from functools import wraps
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, g, has_request_context, jsonify, request, send_file, session
from flask_cors import CORS
from openpyxl import Workbook, load_workbook
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))  # explicit path: PythonAnywhere's working dir is not this folder


def env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


# ----------------------------------------------------------------------------
# 1. SETTINGS
# ----------------------------------------------------------------------------
DB_PATH = os.getenv("DB_PATH") or os.path.join(BASE_DIR, "tracker.db")
TIMEZONE = ZoneInfo("Asia/Dhaka")
FRONTEND_ORIGINS = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
    if o.strip()
]
PUBLIC_READ = env_bool("PUBLIC_READ", True)          # leaderboard / profile without login
SYNC_MODE = os.getenv("SYNC_MODE", "thread").lower()  # "thread" (local) | "queue" (PythonAnywhere)
INGEST_SECRET = os.getenv("INGEST_SECRET", "")        # shared secret for the beecrowd agent
INGEST_MAX_SKEW_SEC = 300                             # signed request must be < 5 minutes old
AUTO_SYNC = env_bool("AUTO_SYNC", True)               # daily automatic sync (thread mode)
AUTO_SYNC_TIME = os.getenv("AUTO_SYNC_TIME", "23:59") # Dhaka time, HH:MM
ROLES = ["admin", "developer"]

app = Flask(__name__)
_secret = os.getenv("SECRET_KEY")
if not _secret:
    _secret = "dev-only-secret-change-me"
    print("WARNING: SECRET_KEY is not set in .env - using an insecure development key.")

app.config.update(
    SECRET_KEY=_secret,
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,  # 5 MB (Excel upload / beecrowd push)
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=os.getenv("COOKIE_SAMESITE", "Lax"),  # "None" if frontend is on another domain
    SESSION_COOKIE_SECURE=env_bool("COOKIE_SECURE", False),        # True on HTTPS (PythonAnywhere)
    PERMANENT_SESSION_LIFETIME=timedelta(days=int(os.getenv("SESSION_DAYS", "7"))),
)
app.json.sort_keys = False

CORS(app, supports_credentials=True, origins=["https://setatistics.vercel.app", "http://localhost:5173", "http://localhost:3000"])

PLATFORMS = ["codeforces", "leetcode", "codechef", "beecrowd"]
SYNC_PLATFORMS = ["codeforces", "leetcode", "codechef"]  # beecrowd comes from the local agent
PROFILE_LINKS = {
    "codeforces": "https://codeforces.com/profile/{}",
    "leetcode": "https://leetcode.com/u/{}/",
    "codechef": "https://www.codechef.com/users/{}",
    "beecrowd": "https://judge.beecrowd.com/en/profile/{}",
}
# (how many requests in parallel, pause after each request) - be polite to the sites
SYNC_LIMITS = {"codeforces": (1, 0.5), "leetcode": (3, 0.2), "codechef": (2, 0.5)}

PERIODS = ["this-day", "last-3-days", "last-week", "last-month", "all-time"]
PERIOD_ALIASES = {"last-day": "this-day", "today": "this-day", "last-3-day": "last-3-days"}
# period -> (window starts N days ago, previous window starts M days ago)
WINDOWS = {"this-day": (0, 1), "last-3-days": (2, 5), "last-week": (6, 13), "last-month": (29, 59)}
SORTS = ["solved", "rating"] + PLATFORMS
MEDALS = {1: "gold", 2: "silver", 3: "bronze"}


# ----------------------------------------------------------------------------
# 2. DATABASE
# ----------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'developer',   -- 'admin' | 'developer'
    student_pk    INTEGER REFERENCES students(id) ON DELETE SET NULL,  -- own leaderboard profile (optional)
    created_at    TEXT,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS students (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    department   TEXT NOT NULL DEFAULT '',
    batch        TEXT NOT NULL DEFAULT '',
    email        TEXT NOT NULL DEFAULT '',
    avatar_url   TEXT NOT NULL DEFAULT '',
    github_url   TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    special_role TEXT NOT NULL DEFAULT '',          -- e.g. 'developer' (frontend shows an icon)
    created_by   INTEGER REFERENCES users(id),
    created_at   TEXT,
    updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS platform_accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    platform     TEXT NOT NULL,
    username     TEXT NOT NULL,
    solved       INTEGER,                           -- latest total (NULL = never synced)
    first_solved INTEGER,                           -- total at the very first sync
    rating       REAL,                              -- CF/CC/LC rating, beecrowd points
    rank_text    TEXT,                              -- e.g. 'specialist', '3 Star', '12,345'
    last_synced  TEXT,
    last_error   TEXT,
    created_at   TEXT,
    UNIQUE (student_id, platform)
);

CREATE TABLE IF NOT EXISTS solve_snapshots (
    account_id INTEGER NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    day        TEXT NOT NULL,                       -- 'YYYY-MM-DD' (Dhaka)
    solved     INTEGER NOT NULL,
    rating     REAL,
    PRIMARY KEY (account_id, day)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sync_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    status       TEXT NOT NULL,                     -- queued | running | finished | failed
    trigger      TEXT NOT NULL,                     -- manual | schedule
    user_id      INTEGER,
    day          TEXT,                              -- snapshot date this run writes (date it started)
    total        INTEGER NOT NULL DEFAULT 0,
    done         INTEGER NOT NULL DEFAULT 0,
    failed       TEXT NOT NULL DEFAULT '[]',        -- JSON list of messages
    created_at   TEXT,
    started_at   TEXT,
    finished_at  TEXT,
    heartbeat_at TEXT
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    user_id     INTEGER,                            -- NULL for system / beecrowd-agent
    actor       TEXT NOT NULL,                      -- staff email, 'system' or 'beecrowd-agent'
    action      TEXT NOT NULL,                      -- e.g. 'student.update'
    target_type TEXT,
    target_id   TEXT,
    summary     TEXT,
    details     TEXT,                               -- JSON
    ip          TEXT
);

CREATE TABLE IF NOT EXISTS pending_imports (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER,
    mode       TEXT NOT NULL,
    rows       TEXT NOT NULL,                       -- JSON
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""

INDEXES = """
CREATE INDEX IF NOT EXISTS idx_accounts_platform_user ON platform_accounts(platform, username);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_runs(status);
"""

# Columns added after the first version - so an old tracker.db keeps working.
MIGRATIONS = {
    "users": {
        "role": "TEXT NOT NULL DEFAULT 'developer'",
        "student_pk": "INTEGER REFERENCES students(id) ON DELETE SET NULL",
        "created_at": "TEXT",
        "last_login_at": "TEXT",
    },
    "sync_runs": {"day": "TEXT"},
    "students": {
        "department": "TEXT NOT NULL DEFAULT ''",
        "avatar_url": "TEXT NOT NULL DEFAULT ''",
        "github_url": "TEXT NOT NULL DEFAULT ''",
        "linkedin_url": "TEXT NOT NULL DEFAULT ''",
        "special_role": "TEXT NOT NULL DEFAULT ''",
        "created_at": "TEXT",
        "updated_at": "TEXT",
    },
    "platform_accounts": {
        "solved": "INTEGER",
        "first_solved": "INTEGER",
        "rating": "REAL",
        "rank_text": "TEXT",
        "last_error": "TEXT",
        "created_at": "TEXT",
    },
}


def connect():
    """Open a new connection. timeout = wait up to 15 s if another process is writing."""
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    """One connection per request (Flask's 'g' is a per-request backpack)."""
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_error):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_columns(conn, table, columns):
    have = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for column, declaration in columns.items():
        if column not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def init_db():
    """Create / upgrade tables, and make the first staff account if there is none."""
    conn = connect()
    if env_bool("SQLITE_WAL", False):  # faster locally; keep OFF on PythonAnywhere (network disk)
        conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    for table, columns in MIGRATIONS.items():
        ensure_columns(conn, table, columns)
    conn.executescript(INDEXES)
    conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('data_version', '0')")

    conn.execute("UPDATE sync_runs SET day = substr(COALESCE(started_at, created_at), 1, 10) WHERE day IS NULL")
    # old databases had 'teacher' - every non-admin becomes 'developer'
    conn.execute("UPDATE users SET role = 'developer' WHERE role NOT IN ('admin', 'developer')")

    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        email = os.getenv("FIRST_USER_EMAIL", "admin@example.com").strip().lower()
        password = os.getenv("FIRST_USER_PASSWORD", "admin123")
        conn.execute(
            "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
            ("Admin", email, generate_password_hash(password), now_str()),
        )
        print(f"First admin account created ->  {email}  (change the password after login!)")
    elif conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0] == 0:
        conn.execute("UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users)")
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# 3. SMALL HELPERS
# ----------------------------------------------------------------------------
def now_dhaka():
    return datetime.now(TIMEZONE).replace(tzinfo=None)


def now_str():
    return now_dhaka().strftime("%Y-%m-%d %H:%M:%S")


def today_dhaka():
    return now_dhaka().date()


def error(message, status=400, **extra):
    return jsonify({"error": message, **extra}), status


def clean(value):
    """Turn anything (None, 12.0, ' abc ') into a tidy string."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def to_number(value):
    """'1,234.5' -> 1234.5 ; 'N/A' -> None."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"[,\s]", "", str(value))
    try:
        return float(text)
    except ValueError:
        return None


def to_int(value):
    """Solved count must be a real whole number, otherwise None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    number = to_number(value)
    if number is None or not float(number).is_integer() or number < 0:
        return None
    return int(number)


def int_arg(name, default, low, high):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(low, min(high, value))


def client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return request.headers.get("X-Real-IP") or forwarded or request.remote_addr


def bump_version(conn):
    """Any change to students / accounts / solved counts -> leaderboard cache is rebuilt."""
    conn.execute("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'")


def set_meta(conn, key, value):
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def get_meta(conn, key):
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def log_activity(conn, action, target_type=None, target_id=None, summary="", details=None,
                 actor=None, user_id=None):
    """Write one line to activity_logs. The caller commits."""
    if actor is None and has_request_context() and g.get("user") is not None:
        user_id, actor = g.user["id"], g.user["email"]
    conn.execute(
        "INSERT INTO activity_logs (created_at, user_id, actor, action, target_type, target_id, summary, details, ip) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            now_str(),
            user_id,
            actor or "anonymous",
            action,
            target_type,
            None if target_id is None else str(target_id),
            summary,
            json.dumps(details, ensure_ascii=False) if details is not None else None,
            client_ip() if has_request_context() else None,
        ),
    )


def normalize_period(value, default="all-time"):
    period = clean(value).lower() or default
    period = PERIOD_ALIASES.get(period, period)
    return period if period in PERIODS else None


# ----------------------------------------------------------------------------
# 4. AUTH HELPERS
# ----------------------------------------------------------------------------
def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return get_db().execute(
        "SELECT id, name, email, role, student_pk, created_at, last_login_at FROM users WHERE id = ?", (uid,)
    ).fetchone()


def login_required(view):
    """Only logged-in admin / developer allowed (both can change students, import, sync)."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            session.clear()
            return error("Please log in first", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    """Only the admin (managing login accounts)."""

    @wraps(view)
    @login_required
    def wrapper(*args, **kwargs):
        if g.user["role"] != "admin":
            return error("Only an admin can do this", 403)
        return view(*args, **kwargs)

    return wrapper


def public_read(view):
    """Open to everyone when PUBLIC_READ=1, otherwise same as login_required."""
    if not PUBLIC_READ:
        return login_required(view)

    @wraps(view)
    def wrapper(*args, **kwargs):
        g.user = current_user()
        return view(*args, **kwargs)

    return wrapper


def user_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "student_pk": row["student_pk"],  # id of own leaderboard profile, or null
        "created_at": row["created_at"],
        "last_login_at": row["last_login_at"],
    }


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def signed_request_required(view):
    """
    For the beecrowd agent (no cookie). Headers:
        X-Timestamp: unix seconds
        X-Signature: hex( HMAC_SHA256(INGEST_SECRET, "<timestamp>." + raw_body) )
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        if not INGEST_SECRET:
            return error("Ingest is disabled. Set INGEST_SECRET in .env", 503)
        timestamp = request.headers.get("X-Timestamp", "")
        signature = request.headers.get("X-Signature", "")
        if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > INGEST_MAX_SKEW_SEC:
            return error("Missing or expired X-Timestamp (check the computer clock)", 401)
        expected = hmac.new(
            INGEST_SECRET.encode(), timestamp.encode() + b"." + request.get_data(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return error("Bad signature", 401)
        return view(*args, **kwargs)

    return wrapper


# ----------------------------------------------------------------------------
# 5. STUDENT HELPERS  (normal routes AND the Excel import use these)
# ----------------------------------------------------------------------------
REQUIRED_FIELDS = ["student_id", "name", "department", "batch"]
TEXT_FIELDS = ["student_id", "name", "department", "batch", "email", "special_role"]
LINK_FIELDS = {"avatar_url": "avatar", "github_url": "github", "linkedin_url": "linkedin"}
ACCOUNT_FIELDS = [f"{p}_id" for p in PLATFORMS]
STUDENT_COLUMNS = TEXT_FIELDS + list(LINK_FIELDS)
ALL_FIELDS = STUDENT_COLUMNS + ACCOUNT_FIELDS
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,64}$")


def normalize_username(value):
    """Accepts 'tourist', '@tourist' or a pasted profile link -> 'tourist'."""
    text = clean(value)
    if "/" in text:
        text = re.sub(r"^https?://", "", text, flags=re.I).split("?")[0].split("#")[0]
        parts = [p for p in text.split("/") if p]
        text = parts[-1] if len(parts) > 1 else ""
    return text.lstrip("@")


def normalize_link(kind, value):
    """Returns (url, error). Only http/https links are allowed (safe to put in <img>/<a>)."""
    text = clean(value)
    if not text:
        return "", None
    if not re.match(r"^https?://", text, re.I):
        if kind == "github" and re.fullmatch(r"[A-Za-z0-9-]{1,39}", text):
            text = f"https://github.com/{text}"
        elif kind == "linkedin" and re.fullmatch(r"[A-Za-z0-9\-_%]{3,100}", text):
            text = f"https://www.linkedin.com/in/{text}"
        elif re.match(r"^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+/", text, re.I):
            text = "https://" + text
        else:
            return "", "must be a full http(s) link"
    if len(text) > 500 or re.search(r"\s", text):
        return "", "invalid link"
    return text, None


def validate_student(data, partial=False):
    """
    Clean + check incoming student data.
    partial=False -> new student (required fields must be there)
    partial=True  -> edit: only keys that were sent are checked
    Returns (clean_dict, list_of_errors).
    """
    out, errors = {}, []
    for field in TEXT_FIELDS:
        if field in data:
            out[field] = clean(data[field])[:200]
    if "special_role" in out:
        out["special_role"] = out["special_role"].lower()
    if out.get("email") and not EMAIL_RE.match(out["email"]):
        errors.append("email is not valid")

    for field, kind in LINK_FIELDS.items():
        if field in data:
            url, problem = normalize_link(kind, data[field])
            out[field] = url
            if problem:
                errors.append(f"{field} {problem}")

    for field in ACCOUNT_FIELDS:
        if field in data:
            username = normalize_username(data[field])
            if username and not USERNAME_RE.match(username):
                errors.append(f"{field} has invalid characters")
            out[field] = username

    for field in REQUIRED_FIELDS:
        if partial:
            if field in out and not out[field]:
                errors.append(f"'{field}' cannot be empty")
        elif not out.get(field):
            errors.append(f"'{field}' is required")
    return out, errors


def load_accounts(conn, student_ids=None):
    """{student_pk: {platform: account_row}} with ONE query (no N+1 problem)."""
    sql = "SELECT * FROM platform_accounts"
    params = []
    if student_ids is not None:
        if not student_ids:
            return {}
        sql += f" WHERE student_id IN ({','.join('?' * len(student_ids))})"
        params = list(student_ids)
    result = {}
    for acc in conn.execute(sql, params):
        result.setdefault(acc["student_id"], {})[acc["platform"]] = acc
    return result


def student_to_dict(row, accounts):
    """Full student object (staff only - contains email)."""
    data = {"id": row["id"]}
    for column in STUDENT_COLUMNS:
        data[column] = row[column]
    for p in PLATFORMS:
        acc = accounts.get(p)
        data[f"{p}_id"] = acc["username"] if acc else ""
    data["created_at"] = row["created_at"]
    data["updated_at"] = row["updated_at"]
    return data


def save_accounts(conn, student_pk, data):
    """
    Save platform usernames. Only keys present in `data` are touched.
      empty value  -> account removed
      new username -> old account + its history removed, new account created
    Returns a list of changes (for the activity log).
    """
    changes = []
    for p in PLATFORMS:
        key = f"{p}_id"
        if key not in data:
            continue
        username = data[key]
        old = conn.execute(
            "SELECT id, username FROM platform_accounts WHERE student_id = ? AND platform = ?",
            (student_pk, p),
        ).fetchone()
        if old and old["username"] == username:
            continue
        if old:
            conn.execute("DELETE FROM platform_accounts WHERE id = ?", (old["id"],))
        if username:
            conn.execute(
                "INSERT INTO platform_accounts (student_id, platform, username, created_at) VALUES (?, ?, ?, ?)",
                (student_pk, p, username, now_str()),
            )
        changes.append({"field": key, "old": old["username"] if old else "", "new": username})
    return changes


def insert_student(conn, data, user_id):
    values = [data.get(c, "") for c in STUDENT_COLUMNS]
    cur = conn.execute(
        f"INSERT INTO students ({', '.join(STUDENT_COLUMNS)}, created_by, created_at, updated_at) "
        f"VALUES ({', '.join('?' * len(STUDENT_COLUMNS))}, ?, ?, ?)",
        (*values, user_id, now_str(), now_str()),
    )
    save_accounts(conn, cur.lastrowid, data)
    return cur.lastrowid


def update_student_row(conn, row, data):
    """Update only the sent fields. Returns list of {field, old, new} changes."""
    changes = []
    sets, params = [], []
    for column in STUDENT_COLUMNS:
        if column in data and data[column] != row[column]:
            sets.append(f"{column} = ?")
            params.append(data[column])
            changes.append({"field": column, "old": row[column], "new": data[column]})
    changes += save_accounts(conn, row["id"], data)
    if changes:
        sets.append("updated_at = ?")
        params.append(now_str())
        conn.execute(f"UPDATE students SET {', '.join(sets)} WHERE id = ?", (*params, row["id"]))
    return changes


# ----------------------------------------------------------------------------
# 6. STATS ENGINE  (leaderboard, profile, dashboard all read from here)
# ----------------------------------------------------------------------------
# The full calculation for 300 students x 4 platforms is ~1 query and a few ms.
# Result is cached and rebuilt only when data changes (data_version) or the date changes.
# data_version lives in the DB, so this is correct even with many web workers.
_stats_cache = {"key": None, "value": None}
_stats_lock = threading.Lock()


def load_stats(conn):
    today = today_dhaka()
    key = (get_meta(conn, "data_version"), today.isoformat())
    with _stats_lock:
        if _stats_cache["key"] == key:
            return _stats_cache["value"]
    value = compute_stats(conn, today)
    with _stats_lock:
        _stats_cache.update(key=key, value=value)
    return value


def blank_counts():
    return {p: 0 for p in PERIODS}


def reference_day(conn, today):
    """
    The day "this-day" talks about = the day of the latest platform sync.
    Why: the automatic sync runs at 23:59. Right after midnight the new calendar day
    has no data yet, so without this "This Day" would show 0 for everyone all day long.
    With it, "This Day" shows the last synced day until the next sync (manual or nightly).
    """
    row = conn.execute(
        "SELECT MAX(day) FROM sync_runs WHERE status IN ('finished', 'failed') AND done > 0"
    ).fetchone()
    if row[0]:
        day = datetime.strptime(row[0], "%Y-%m-%d").date()
        return min(day, today)
    return today


def compute_stats(conn, today):
    ref = reference_day(conn, today)
    offsets = sorted({o for pair in WINDOWS.values() for o in pair})
    day_of = {o: (ref - timedelta(days=o)).isoformat() for o in offsets}
    # For every account: total at the end of the reference day ("cur"), and the total at the
    # end of the day before each window start ("b<offset>").
    current_sub = ("(SELECT s.solved FROM solve_snapshots s WHERE s.account_id = a.id AND s.day <= ? "
                   "ORDER BY s.day DESC LIMIT 1) AS cur")
    sub = ("(SELECT s.solved FROM solve_snapshots s WHERE s.account_id = a.id AND s.day < ? "
           "ORDER BY s.day DESC LIMIT 1)")
    columns = ", ".join([current_sub] + [f"{sub} AS b{o}" for o in offsets])
    sql = f"SELECT a.*, {columns} FROM platform_accounts a"

    rows = {}
    for s in conn.execute("SELECT * FROM students"):
        rows[s["id"]] = {
            "id": s["id"],
            "student_id": s["student_id"],
            "name": s["name"],
            "department": s["department"],
            "batch": s["batch"],
            "avatar_url": s["avatar_url"],
            "github_url": s["github_url"],
            "linkedin_url": s["linkedin_url"],
            "special_role": s["special_role"],
            "solved": blank_counts(),
            "growth": {},
            "platforms": {
                p: {"username": None, "url": None, "solved": blank_counts(), "rating": None,
                    "rank": None, "last_synced": None, "error": None}
                for p in PLATFORMS
            },
            "_previous": {p: 0 for p in WINDOWS},
        }

    for a in conn.execute(sql, [ref.isoformat()] + [day_of[o] for o in offsets]):
        row = rows.get(a["student_id"])
        if row is None or a["platform"] not in PLATFORMS:
            continue
        plat = row["platforms"][a["platform"]]
        plat.update(
            username=a["username"],
            url=PROFILE_LINKS[a["platform"]].format(a["username"]),
            rating=a["rating"],
            rank=a["rank_text"],
            last_synced=a["last_synced"],
            error=a["last_error"],
        )
        latest = a["solved"]
        if latest is None:
            continue  # never synced yet
        first = a["first_solved"] if a["first_solved"] is not None else latest
        at_ref = a["cur"] if a["cur"] is not None else first  # first synced after the reference day

        def base(offset):
            value = a[f"b{offset}"]
            return first if value is None else value

        for period, (start, prev_start) in WINDOWS.items():
            gained = max(0, at_ref - base(start))
            plat["solved"][period] = gained
            row["solved"][period] += gained
            row["_previous"][period] += max(0, base(start) - base(prev_start))
        plat["solved"]["all-time"] = latest
        row["solved"]["all-time"] += latest

    for row in rows.values():
        previous = row.pop("_previous")
        for period in WINDOWS:
            now_value, before = row["solved"][period], previous[period]
            row["growth"][period] = {
                "previous": before,
                "change": now_value - before,
                "percent": round((now_value - before) * 100 / before, 1) if before else None,
            }
    return {"rows": list(rows.values()), "generated_at": now_str(), "as_of_day": ref.isoformat()}


def sort_key_fn(sort, period, rating_platform):
    if sort == "solved":
        return lambda r: (r["solved"][period], r["solved"]["all-time"])
    if sort in PLATFORMS:
        return lambda r: (r["platforms"][sort]["solved"][period], r["solved"][period])
    # sort == "rating" ("Rank" toggle). platform=all -> total solved on all platforms (all-time)
    if rating_platform == "all":
        return lambda r: (r["solved"]["all-time"], r["solved"][period])
    return lambda r: (
        r["platforms"][rating_platform]["rating"] if r["platforms"][rating_platform]["rating"] is not None else -1,
        r["solved"]["all-time"],
    )


def build_leaderboard(conn, period="all-time", sort="solved", rating_platform="all",
                      batch="", department=""):
    """Rank students. Returns NEW row dicts (the cached rows are never modified)."""
    stats = load_stats(conn)
    rows = stats["rows"]
    if batch:
        rows = [r for r in rows if r["batch"] == batch]
    if department:
        rows = [r for r in rows if r["department"].lower() == department.lower()]

    key = sort_key_fn(sort, period, rating_platform)
    ranked = sorted(rows, key=lambda r: (-key(r)[0], -key(r)[1], r["name"].lower()))

    best = {p: max((r["platforms"][p]["solved"][period] for r in ranked), default=0) for p in PLATFORMS}
    platform_leaders = {
        p: {"value": best[p], "ids": [r["id"] for r in ranked if best[p] > 0 and
                                      r["platforms"][p]["solved"][period] == best[p]]}
        for p in PLATFORMS
    }

    out = []
    for position, r in enumerate(ranked, start=1):
        sort_value = key(r)[0]
        item = dict(r)
        item.update(
            rank=position,
            medal=MEDALS.get(position) if sort_value > 0 else None,
            period_solved=r["solved"][period],
            sort_value=sort_value,
            top_in=[p for p in PLATFORMS if best[p] > 0 and r["platforms"][p]["solved"][period] == best[p]],
        )
        out.append(item)
    return {
        "period": period,
        "sort": sort,
        "rating_platform": rating_platform if sort == "rating" else None,
        "out_of": len(out),
        "as_of_day": stats["as_of_day"],  # the day "this-day" refers to
        "generated_at": stats["generated_at"],
        "platform_leaders": platform_leaders,
        "rows": out,
    }


def read_board_args():
    """Shared query params: period, sort, platform (for rating), batch, department."""
    period = normalize_period(request.args.get("period"))
    if period is None:
        return None, f"period must be one of: {', '.join(PERIODS)}"
    sort = clean(request.args.get("sort")).lower() or "solved"
    if sort not in SORTS:
        return None, f"sort must be one of: {', '.join(SORTS)}"
    rating_platform = clean(request.args.get("platform")).lower() or "all"
    if rating_platform not in ["all"] + PLATFORMS:
        return None, f"platform must be one of: all, {', '.join(PLATFORMS)}"
    return {
        "period": period,
        "sort": sort,
        "rating_platform": rating_platform,
        "batch": clean(request.args.get("batch")),
        "department": clean(request.args.get("department")),
    }, None


def last_sync_info(conn):
    run = conn.execute(
        "SELECT finished_at FROM sync_runs WHERE status = 'finished' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return {
        "platforms_synced_at": run["finished_at"] if run else None,
        "beecrowd_synced_at": get_meta(conn, "beecrowd_last_ingest"),
    }


def build_history(conn, student_pk, days):
    """
    Daily series for graphs.
      total[i]  = total solved at the end of that day (null = not tracked yet)
      daily[i]  = problems solved on that day
      rating[i] = rating / points at the end of that day
    """
    today = today_dhaka()
    start = today - timedelta(days=days - 1)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    platforms = {p: {"total": [None] * days, "daily": [0] * days, "rating": [None] * days} for p in PLATFORMS}

    accounts = conn.execute(
        "SELECT id, platform FROM platform_accounts WHERE student_id = ?", (student_pk,)
    ).fetchall()
    for acc in accounts:
        before = conn.execute(
            "SELECT solved, rating FROM solve_snapshots WHERE account_id = ? AND day < ? "
            "ORDER BY day DESC LIMIT 1",
            (acc["id"], dates[0]),
        ).fetchone()
        snaps = {
            s["day"]: s
            for s in conn.execute(
                "SELECT day, solved, rating FROM solve_snapshots WHERE account_id = ? AND day >= ?",
                (acc["id"], dates[0]),
            )
        }
        last_total = before["solved"] if before else None
        last_rating = before["rating"] if before else None
        series = platforms[acc["platform"]]
        for i, day in enumerate(dates):
            if day in snaps:
                value = snaps[day]["solved"]
                series["daily"][i] = max(0, value - last_total) if last_total is not None else 0
                last_total = value
                if snaps[day]["rating"] is not None:
                    last_rating = snaps[day]["rating"]
            series["total"][i] = last_total
            series["rating"][i] = last_rating

    combined = {"total": [], "daily": []}
    for i in range(days):
        totals = [platforms[p]["total"][i] for p in PLATFORMS if platforms[p]["total"][i] is not None]
        combined["total"].append(sum(totals) if totals else None)
        combined["daily"].append(sum(platforms[p]["daily"][i] for p in PLATFORMS))
    return dates, {"all": combined, **platforms}


# ============================================================================
# 7. ROUTES
# ============================================================================

# ---------------------------- Authentication --------------------------------
@app.post("/api/auth/login")
def login():
    db = get_db()
    data = request.get_json(silent=True) or {}
    email = clean(data.get("email")).lower()
    password = data.get("password") or ""
    ip = client_ip()

    since = (now_dhaka() - timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S")
    recent_fails = db.execute(
        "SELECT COUNT(*) FROM activity_logs WHERE action = 'auth.login_failed' AND created_at >= ? "
        "AND (ip = ? OR target_id = ?)",
        (since, ip, email),
    ).fetchone()[0]
    if recent_fails >= 10:
        return error("Too many failed attempts. Try again in 15 minutes.", 429)

    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        log_activity(db, "auth.login_failed", "user", email, f"Failed login for {email}", actor=email or "anonymous")
        db.commit()
        return error("Wrong email or password", 401)

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    db.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now_str(), user["id"]))
    log_activity(db, "auth.login", "user", user["id"], "Logged in", user_id=user["id"], actor=user["email"])
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify({"message": "Login successful", "user": user_to_dict(user)})


@app.post("/api/auth/logout")
def logout():
    user = current_user()
    if user:
        db = get_db()
        log_activity(db, "auth.logout", "user", user["id"], "Logged out", user_id=user["id"], actor=user["email"])
        db.commit()
    session.clear()
    return jsonify({"message": "Logged out"})


@app.get("/api/auth/me")
@login_required
def me():
    """Who is logged in + their own leaderboard profile (null if they have none)."""
    db = get_db()
    student = None
    if g.user["student_pk"]:
        row = db.execute("SELECT * FROM students WHERE id = ?", (g.user["student_pk"],)).fetchone()
        if row:
            student = student_to_dict(row, load_accounts(db, [row["id"]]).get(row["id"], {}))
    return jsonify({"user": user_to_dict(g.user), "student": student})


@app.put("/api/auth/me/profile")
@login_required
def update_my_profile():
    """
    Edit OWN leaderboard profile (photo, links, platform usernames ...).
    No profile yet -> one is created (student_id, name, department, batch required) and linked.
    An admin who does not want to appear on the leaderboard simply never calls this.
    """
    db = get_db()
    body = request.get_json(silent=True) or {}
    linked = None
    if g.user["student_pk"]:
        linked = db.execute("SELECT * FROM students WHERE id = ?", (g.user["student_pk"],)).fetchone()

    data, problems = validate_student(body, partial=linked is not None)
    if problems:
        return error(problems[0], 400, errors=problems)
    if "student_id" in data and db.execute(
        "SELECT 1 FROM students WHERE student_id = ? AND id != ?", (data["student_id"], linked["id"] if linked else 0)
    ).fetchone():
        return error("This student_id already exists", 409)

    if linked:
        changes = update_student_row(db, linked, data)
        student_pk = linked["id"]
        if changes:
            log_activity(db, "profile.update", "student", student_pk,
                         "Edited own profile: " + ", ".join(c["field"] for c in changes), {"changes": changes})
    else:
        if g.user["role"] == "developer" and not data.get("special_role"):
            data["special_role"] = "developer"
        student_pk = insert_student(db, data, g.user["id"])
        db.execute("UPDATE users SET student_pk = ? WHERE id = ?", (student_pk, g.user["id"]))
        log_activity(db, "profile.create", "student", student_pk, "Created own leaderboard profile", data)
    bump_version(db)
    db.commit()
    row = db.execute("SELECT * FROM students WHERE id = ?", (student_pk,)).fetchone()
    return jsonify({"student": student_to_dict(row, load_accounts(db, [student_pk]).get(student_pk, {}))})


@app.delete("/api/auth/me/profile")
@login_required
def delete_my_profile():
    """Remove own profile from the leaderboard (deletes the linked student + history)."""
    db = get_db()
    if not g.user["student_pk"]:
        return error("You have no leaderboard profile", 404)
    db.execute("DELETE FROM students WHERE id = ?", (g.user["student_pk"],))
    db.execute("UPDATE users SET student_pk = NULL WHERE id = ?", (g.user["id"],))
    log_activity(db, "profile.delete", "student", g.user["student_pk"], "Removed own leaderboard profile")
    bump_version(db)
    db.commit()
    return jsonify({"message": "Profile removed from the leaderboard"})


@app.put("/api/auth/me")
@login_required
def update_me():
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"))[:100]
    if not name:
        return error("'name' is required")
    db = get_db()
    db.execute("UPDATE users SET name = ? WHERE id = ?", (name, g.user["id"]))
    log_activity(db, "auth.profile_update", "user", g.user["id"], "Changed own name",
                 {"old": g.user["name"], "new": name})
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id = ?", (g.user["id"],)).fetchone()
    return jsonify({"user": user_to_dict(user)})


@app.post("/api/auth/change-password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    db = get_db()
    row = db.execute("SELECT password_hash FROM users WHERE id = ?", (g.user["id"],)).fetchone()
    if not check_password_hash(row["password_hash"], current):
        log_activity(db, "auth.password_change_failed", "user", g.user["id"], "Wrong current password")
        db.commit()
        return error("Current password is wrong", 400)
    if len(new) < 6:
        return error("New password must be at least 6 characters")
    if new == current:
        return error("New password must be different from the current one")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new), g.user["id"]))
    log_activity(db, "auth.password_change", "user", g.user["id"], "Changed own password")
    db.commit()
    return jsonify({"message": "Password changed"})


# ---------------------------- Staff users -----------------------------------
@app.get("/api/users")
@login_required
def list_users():
    rows = get_db().execute("SELECT * FROM users ORDER BY name").fetchall()
    return jsonify([user_to_dict(r) for r in rows])


def check_student_link(db, student_pk, user_id=0):
    """Returns (student_pk or None, error message or None)."""
    if student_pk in (None, "", 0):
        return None, None
    try:
        student_pk = int(student_pk)
    except (TypeError, ValueError):
        return None, "student_pk must be a number"
    if not db.execute("SELECT 1 FROM students WHERE id = ?", (student_pk,)).fetchone():
        return None, "Student not found"
    if db.execute("SELECT 1 FROM users WHERE student_pk = ? AND id != ?", (student_pk, user_id)).fetchone():
        return None, "This student is already linked to another account"
    return student_pk, None


@app.post("/api/users")
@admin_required
def create_user_route():
    """Admin creates a login: {name, email, password, role: admin|developer, student_pk?}"""
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"))[:100]
    email = clean(data.get("email")).lower()
    password = data.get("password") or ""
    role = clean(data.get("role")).lower() or "developer"
    if not name or not EMAIL_RE.match(email):
        return error("'name' and a valid 'email' are required")
    if role not in ROLES:
        return error("role must be 'admin' or 'developer'")
    if len(password) < 6:
        return error("Password must be at least 6 characters")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        return error("This email already has an account", 409)
    student_pk, problem = check_student_link(db, data.get("student_pk"))
    if problem:
        return error(problem, 409 if "linked" in problem else 400)
    cur = db.execute(
        "INSERT INTO users (name, email, password_hash, role, student_pk, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (name, email, generate_password_hash(password), role, student_pk, now_str()),
    )
    if student_pk and role == "developer":
        db.execute("UPDATE students SET special_role = 'developer' WHERE id = ? AND special_role = ''", (student_pk,))
        bump_version(db)
    log_activity(db, "user.create", "user", cur.lastrowid, f"Created {role} account {email}",
                 {"role": role, "student_pk": student_pk})
    db.commit()
    return jsonify(user_to_dict(db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone())), 201


@app.put("/api/users/<int:id>")
@admin_required
def update_user_route(id):
    """Admin edits an account: {name?, role?, student_pk? (null = unlink)}"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (id,)).fetchone()
    if not user:
        return error("User not found", 404)
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"))[:100] if "name" in data else user["name"]
    role = clean(data.get("role")).lower() if "role" in data else user["role"]
    if not name:
        return error("'name' cannot be empty")
    if role not in ROLES:
        return error("role must be 'admin' or 'developer'")
    if user["role"] == "admin" and role != "admin" and \
            db.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0] <= 1:
        return error("There must be at least one admin", 409)
    student_pk = user["student_pk"]
    if "student_pk" in data:
        student_pk, problem = check_student_link(db, data.get("student_pk"), id)
        if problem:
            return error(problem, 409 if "linked" in problem else 400)

    db.execute("UPDATE users SET name = ?, role = ?, student_pk = ? WHERE id = ?", (name, role, student_pk, id))
    log_activity(db, "user.update", "user", id, f"Edited account {user['email']}",
                 {"old": {"name": user["name"], "role": user["role"], "student_pk": user["student_pk"]},
                  "new": {"name": name, "role": role, "student_pk": student_pk}})
    db.commit()
    return jsonify(user_to_dict(db.execute("SELECT * FROM users WHERE id = ?", (id,)).fetchone()))


@app.post("/api/users/<int:id>/reset-password")
@admin_required
def reset_user_password(id):
    """Admin sets a new password for someone who forgot it: {new_password}"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (id,)).fetchone()
    if not user:
        return error("User not found", 404)
    new = (request.get_json(silent=True) or {}).get("new_password") or ""
    if len(new) < 6:
        return error("New password must be at least 6 characters")
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new), id))
    log_activity(db, "auth.password_reset", "user", id, f"Reset password of {user['email']}")
    db.commit()
    return jsonify({"message": "Password reset"})


@app.delete("/api/users/<int:id>")
@admin_required
def delete_user_route(id):
    """Removes the login only. Their leaderboard profile (student) stays."""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (id,)).fetchone()
    if not user:
        return error("User not found", 404)
    if id == g.user["id"]:
        return error("You cannot delete your own account", 409)
    db.execute("DELETE FROM users WHERE id = ?", (id,))
    log_activity(db, "user.delete", "user", id, f"Deleted account {user['email']}", user_to_dict(user))
    db.commit()
    return jsonify({"message": "User deleted"})


# ---------------------------- Activity logs ---------------------------------
@app.get("/api/logs")
@login_required
def list_logs():
    """
    /api/logs?user_id=2&action=student.update&target_id=15&from=2026-11-01&to=2026-11-16&limit=50&offset=0
    Admin sees everyone's logs, a developer sees only their own.
    """
    where, params = [], []
    if g.user["role"] != "admin":
        where.append("user_id = ?")
        params.append(g.user["id"])
    for arg, column in (("user_id", "user_id"), ("target_type", "target_type"), ("target_id", "target_id")):
        value = clean(request.args.get(arg))
        if value:
            where.append(f"{column} = ?")
            params.append(value)
    action = clean(request.args.get("action"))
    if action:  # 'student' matches student.create / student.update / ...
        where.append("(action = ? OR action LIKE ?)")
        params += [action, f"{action}.%"]
    if clean(request.args.get("from")):
        where.append("created_at >= ?")
        params.append(clean(request.args.get("from")))
    if clean(request.args.get("to")):
        where.append("created_at <= ?")
        params.append(clean(request.args.get("to")) + " 23:59:59")
    sql_where = f"WHERE {' AND '.join(where)}" if where else ""
    limit = int_arg("limit", 50, 1, 200)
    offset = int_arg("offset", 0, 0, 10**9)

    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM activity_logs {sql_where}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM activity_logs {sql_where} ORDER BY id DESC LIMIT ? OFFSET ?", (*params, limit, offset)
    ).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        item["details"] = json.loads(r["details"]) if r["details"] else None
        items.append(item)
    return jsonify({"total": total, "limit": limit, "offset": offset, "items": items})


# ---------------------------- Students (staff) ------------------------------
@app.get("/api/students")
@login_required
def list_students():
    """/api/students?search=rahim&batch=10&department=SWE"""
    db = get_db()
    where, params = [], []
    search = clean(request.args.get("search"))
    if search:
        where.append("(name LIKE ? OR student_id LIKE ?)")
        params += [f"%{search}%", f"%{search}%"]
    for field in ("batch", "department"):
        value = clean(request.args.get(field))
        if value:
            where.append(f"{field} = ?")
            params.append(value)
    sql = "SELECT * FROM students"
    if where:
        sql += " WHERE " + " AND ".join(where)
    rows = db.execute(sql + " ORDER BY name", params).fetchall()
    accounts = load_accounts(db, None if not where else [r["id"] for r in rows])
    return jsonify([student_to_dict(r, accounts.get(r["id"], {})) for r in rows])


@app.post("/api/students")
@login_required
def add_student():
    db = get_db()
    data, problems = validate_student(request.get_json(silent=True) or {}, partial=False)
    if problems:
        return error(problems[0], 400, errors=problems)
    if db.execute("SELECT 1 FROM students WHERE student_id = ?", (data["student_id"],)).fetchone():
        return error("This student_id already exists", 409)

    new_id = insert_student(db, data, g.user["id"])
    log_activity(db, "student.create", "student", new_id, f"Added {data['name']} ({data['student_id']})", data)
    bump_version(db)
    db.commit()
    row = db.execute("SELECT * FROM students WHERE id = ?", (new_id,)).fetchone()
    return jsonify(student_to_dict(row, load_accounts(db, [new_id]).get(new_id, {}))), 201


@app.get("/api/students/<int:id>")
@login_required
def get_student(id):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)
    return jsonify(student_to_dict(row, load_accounts(db, [id]).get(id, {})))


@app.put("/api/students/<int:id>")
@login_required
def update_student(id):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)

    data, problems = validate_student(request.get_json(silent=True) or {}, partial=True)
    if problems:
        return error(problems[0], 400, errors=problems)
    if "student_id" in data and db.execute(
        "SELECT 1 FROM students WHERE student_id = ? AND id != ?", (data["student_id"], id)
    ).fetchone():
        return error("This student_id already exists", 409)

    changes = update_student_row(db, row, data)
    if changes:
        log_activity(db, "student.update", "student", id,
                     f"Edited {row['name']} ({row['student_id']}): " + ", ".join(c["field"] for c in changes),
                     {"changes": changes})
        bump_version(db)
    db.commit()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    return jsonify(student_to_dict(row, load_accounts(db, [id]).get(id, {})))


@app.delete("/api/students/<int:id>")
@login_required
def delete_student(id):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)
    snapshot = student_to_dict(row, load_accounts(db, [id]).get(id, {}))
    db.execute("DELETE FROM students WHERE id = ?", (id,))  # accounts + history go too (CASCADE)
    log_activity(db, "student.delete", "student", id, f"Deleted {row['name']} ({row['student_id']})", snapshot)
    bump_version(db)
    db.commit()
    return jsonify({"message": "Student deleted"})


# ---------------------------- Excel upload & import -------------------------
HEADER_ALIASES = {
    "id": "student_id", "roll": "student_id", "studentid": "student_id", "student_roll": "student_id",
    "full_name": "name", "student_name": "name",
    "dept": "department",
    "mail": "email", "email_address": "email",
    "photo": "avatar_url", "picture": "avatar_url", "image": "avatar_url", "avatar": "avatar_url",
    "photo_url": "avatar_url", "picture_url": "avatar_url", "image_url": "avatar_url",
    "profile_picture": "avatar_url", "profile_picture_url": "avatar_url", "profile_photo": "avatar_url",
    "github": "github_url", "github_profile": "github_url", "github_link": "github_url",
    "linkedin": "linkedin_url", "linkedin_profile": "linkedin_url", "linkedin_link": "linkedin_url",
    "role": "special_role", "special": "special_role", "tag": "special_role",
    "codeforces": "codeforces_id", "codeforce": "codeforces_id", "codeforce_id": "codeforces_id", "cf": "codeforces_id",
    "leetcode": "leetcode_id", "lc": "leetcode_id",
    "codechef": "codechef_id", "cc": "codechef_id",
    "beecrowd": "beecrowd_id", "beecrowed": "beecrowd_id", "beecrowed_id": "beecrowd_id", "uri": "beecrowd_id",
}
IMPORT_TTL_HOURS = 2


def normalize_header(title):
    key = re.sub(r"[^a-z0-9]+", "_", clean(title).lower()).strip("_")
    return HEADER_ALIASES.get(key, key)


@app.get("/api/students/excel/template")
@login_required
def excel_template():
    """Download an empty .xlsx with the right column names + one example row."""
    wb = Workbook()
    ws = wb.active
    ws.title = "students"
    ws.append(ALL_FIELDS)
    ws.append(["2023001", "Rahim Uddin", "SWE", "10", "rahim@example.com", "developer",
               "https://example.com/rahim.jpg", "https://github.com/rahim", "https://www.linkedin.com/in/rahim",
               "rahim_cf", "rahim_lc", "rahim_cc", "1072467"])
    for column in ws.columns:
        ws.column_dimensions[column[0].column_letter].width = 22
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name="students_template.xlsx",
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/api/students/excel/upload")
@login_required
def excel_upload():
    """
    Step 1: multipart/form-data with 'file' (.xlsx) and optional 'mode':
        mode=create (default) -> student_id that already exists = error row
        mode=upsert           -> student_id that already exists = update (non-empty cells only)
    Nothing is saved yet - we only return a preview.
    """
    mode = clean(request.form.get("mode")).lower() or "create"
    if mode not in ("create", "upsert"):
        return error("mode must be 'create' or 'upsert'")
    file = request.files.get("file")
    if not file or not file.filename.lower().endswith(".xlsx"):
        return error("Please upload an .xlsx Excel file")
    try:
        sheet = load_workbook(file, read_only=True, data_only=True).active
        all_rows = list(sheet.iter_rows(values_only=True))
    except Exception:
        return error("Could not read this file. Is it a real .xlsx?")
    if not all_rows:
        return error("The Excel file is empty")

    header = [normalize_header(h) for h in all_rows[0]]
    missing = [c for c in REQUIRED_FIELDS if c not in header]
    if missing:
        return error(f"Missing required column(s): {', '.join(missing)}")
    positions = {}
    for index, column in enumerate(header):
        if column in ALL_FIELDS and column not in positions:
            positions[column] = index
    ignored = sorted({h for h in header if h and h not in ALL_FIELDS})

    db = get_db()
    existing = {r["student_id"] for r in db.execute("SELECT student_id FROM students")}
    seen_in_file = set()
    preview, ready = [], []

    for number, cells in enumerate(all_rows[1:], start=2):  # row 1 is the header
        raw = {col: clean(cells[i]) if i < len(cells) else "" for col, i in positions.items()}
        if not any(raw.values()):
            continue  # blank line

        sid = raw.get("student_id", "")
        action = "update" if (mode == "upsert" and sid in existing) else "create"
        if action == "update":
            data, problems = validate_student({k: v for k, v in raw.items() if v}, partial=True)
        else:
            data, problems = validate_student(raw, partial=False)
            if sid in existing:
                problems.append("student_id already exists in the database")
        if sid:
            if sid in seen_in_file:
                problems.append("duplicate student_id inside the file")
            seen_in_file.add(sid)

        preview.append({"row": number, "action": action, "data": raw, "errors": problems})
        if not problems:
            ready.append({"action": action, "data": data})

    import_id = uuid.uuid4().hex
    cutoff = (now_dhaka() - timedelta(hours=IMPORT_TTL_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute("DELETE FROM pending_imports WHERE created_at < ?", (cutoff,))
    db.execute(
        "INSERT INTO pending_imports (id, user_id, mode, rows, created_at) VALUES (?, ?, ?, ?, ?)",
        (import_id, g.user["id"], mode, json.dumps(ready, ensure_ascii=False), now_str()),
    )
    log_activity(db, "excel.upload", "import", import_id,
                 f"Uploaded {file.filename}: {len(preview)} rows, {len(ready)} valid",
                 {"file": file.filename, "mode": mode, "rows": len(preview), "valid": len(ready)})
    db.commit()

    return jsonify({
        "import_id": import_id,
        "mode": mode,
        "total_rows": len(preview),
        "valid_count": len(ready),
        "error_count": len(preview) - len(ready),
        "create_count": sum(1 for r in ready if r["action"] == "create"),
        "update_count": sum(1 for r in ready if r["action"] == "update"),
        "ignored_columns": ignored,
        "rows": preview,
    })


@app.post("/api/students/excel/import")
@login_required
def excel_import():
    """Step 2: {"import_id": "..."} -> saves the valid rows in ONE transaction."""
    data = request.get_json(silent=True) or {}
    db = get_db()
    pending = db.execute("SELECT * FROM pending_imports WHERE id = ?", (clean(data.get("import_id")),)).fetchone()
    cutoff = (now_dhaka() - timedelta(hours=IMPORT_TTL_HOURS)).strftime("%Y-%m-%d %H:%M:%S")
    if pending is None or pending["created_at"] < cutoff:
        return error("Import not found or expired. Please upload the file again.", 404)

    rows = json.loads(pending["rows"])
    existing = {r["student_id"]: r for r in db.execute("SELECT * FROM students")}
    imported = updated = skipped = 0
    for item in rows:
        row_data = item["data"]
        sid = row_data.get("student_id")
        old = existing.get(sid)
        if item["action"] == "create":
            if old:  # somebody added the same ID after the upload step
                skipped += 1
                continue
            insert_student(db, row_data, g.user["id"])
            existing[sid] = True
            imported += 1
        else:
            if not old or old is True:
                skipped += 1
                continue
            if update_student_row(db, old, row_data):
                updated += 1
    db.execute("DELETE FROM pending_imports WHERE id = ?", (pending["id"],))
    log_activity(db, "excel.import", "import", pending["id"],
                 f"Excel import: {imported} added, {updated} updated, {skipped} skipped",
                 {"imported": imported, "updated": updated, "skipped": skipped})
    bump_version(db)
    db.commit()
    return jsonify({"message": "Import finished", "imported": imported, "updated": updated, "skipped": skipped})


# ---------------------------- Sync (Codeforces / LeetCode / CodeChef) -------
STALE_RUN_MINUTES = 20


def load_fetchers():
    """Imported only when a sync runs, so normal web requests stay light."""
    from codechef import get_codechef_stats
    from codeforces import get_codeforces_stats
    from leetcode import get_leetcode_stats

    return {"codeforces": get_codeforces_stats, "leetcode": get_leetcode_stats, "codechef": get_codechef_stats}


def record_result(conn, account_id, solved, rating, rank_text, day=None):
    """Save one account's fresh numbers: latest values + the snapshot of `day` (default today)."""
    conn.execute(
        "INSERT INTO solve_snapshots (account_id, day, solved, rating) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(account_id, day) DO UPDATE SET solved = excluded.solved, rating = excluded.rating",
        (account_id, day or today_dhaka().isoformat(), solved, rating),
    )
    conn.execute(
        "UPDATE platform_accounts SET solved = ?, rating = ?, rank_text = ?, last_synced = ?, "
        "last_error = NULL, first_solved = COALESCE(first_solved, ?) WHERE id = ?",
        (solved, rating, rank_text or None, now_str(), solved, account_id),
    )


def expire_stale_runs(conn):
    cutoff = (now_dhaka() - timedelta(minutes=STALE_RUN_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "UPDATE sync_runs SET status = 'failed', finished_at = ? "
        "WHERE status = 'running' AND COALESCE(heartbeat_at, started_at) < ?",
        (now_str(), cutoff),
    )


def claim_run(conn, trigger, user_id, status):
    """
    Atomically create a run. Returns run id, or None if one is already running/queued.
    status='running' -> start now ; status='queued' -> the scheduled task will pick it up.
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        expire_stale_runs(conn)
        busy = conn.execute(
            "SELECT id FROM sync_runs WHERE status IN ('running', 'queued') LIMIT 1"
        ).fetchone()
        if busy:
            conn.rollback()
            return None
        now = now_str()
        cur = conn.execute(
            "INSERT INTO sync_runs (status, trigger, user_id, day, created_at, started_at, heartbeat_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (status, trigger, user_id, today_dhaka().isoformat() if status == "running" else None,
             now, now if status == "running" else None, now),
        )
        conn.commit()
        return cur.lastrowid
    except Exception:
        conn.rollback()
        raise


def interleave(accounts):
    """cf, lc, cc, cf, lc, cc ... so slow platforms don't block the worker pool."""
    groups = {p: [a for a in accounts if a["platform"] == p] for p in SYNC_PLATFORMS}
    out = []
    for i in range(max((len(v) for v in groups.values()), default=0)):
        for p in SYNC_PLATFORMS:
            if i < len(groups[p]):
                out.append(groups[p][i])
    return out


def run_sync(run_id):
    """Fetch every Codeforces/LeetCode/CodeChef account. Runs in a thread or from the CLI."""
    conn = connect()
    failed = []
    status = "finished"
    try:
        # All snapshots of this run use the day it STARTED. A 23:59 sync that ends at 00:10
        # still belongs to the old day.
        day = conn.execute("SELECT day FROM sync_runs WHERE id = ?", (run_id,)).fetchone()["day"] \
            or today_dhaka().isoformat()
        accounts = interleave(conn.execute(
            "SELECT pa.id, pa.platform, pa.username, s.student_id AS roll FROM platform_accounts pa "
            "JOIN students s ON s.id = pa.student_id "
            f"WHERE pa.platform IN ({','.join('?' * len(SYNC_PLATFORMS))})",
            SYNC_PLATFORMS,
        ).fetchall())
        conn.execute("UPDATE sync_runs SET total = ?, heartbeat_at = ? WHERE id = ?",
                     (len(accounts), now_str(), run_id))
        conn.commit()

        fetchers = load_fetchers()
        gates = {p: threading.Semaphore(SYNC_LIMITS[p][0]) for p in SYNC_PLATFORMS}

        def fetch(acc):
            platform = acc["platform"]
            problem = "unknown error"
            for attempt in (1, 2):
                with gates[platform]:
                    try:
                        result = fetchers[platform](acc["username"]) or {}
                        solved = to_int(result.get("solved"))
                        if solved is not None:
                            return acc, result, solved, None
                        problem = clean(result.get("solved")) or "no data"
                    except Exception as exc:  # network error, site changed, ...
                        problem = str(exc)[:200]
                    finally:
                        time.sleep(SYNC_LIMITS[platform][1])
                if problem.lower() == "not found":
                    break  # wrong username - retrying won't help
                time.sleep(2)
            return acc, None, None, problem

        workers = sum(limit for limit, _ in SYNC_LIMITS.values())
        done = 0
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for future in as_completed([pool.submit(fetch, a) for a in accounts]):
                acc, result, solved, problem = future.result()
                if result is not None:
                    record_result(conn, acc["id"], solved, to_number(result.get("rating")),
                                  clean(result.get("rank"))[:50], day)
                else:
                    conn.execute("UPDATE platform_accounts SET last_error = ? WHERE id = ?", (problem, acc["id"]))
                    failed.append(f"{acc['roll']} / {acc['platform']} ({acc['username']}): {problem}")
                done += 1
                if done % 10 == 0 or done == len(accounts):
                    conn.execute(
                        "UPDATE sync_runs SET done = ?, failed = ?, heartbeat_at = ? WHERE id = ?",
                        (done, json.dumps(failed, ensure_ascii=False), now_str(), run_id),
                    )
                    bump_version(conn)
                    conn.commit()
    except Exception as exc:
        status = "failed"
        failed.append(f"Sync crashed: {exc}")
    finally:
        conn.execute(
            "UPDATE sync_runs SET status = ?, failed = ?, finished_at = ?, heartbeat_at = ? WHERE id = ?",
            (status, json.dumps(failed, ensure_ascii=False), now_str(), now_str(), run_id),
        )
        log_activity(conn, "sync.finished", "sync", run_id,
                     f"Sync {status}: {len(failed)} failed", {"failed": failed[:50]}, actor="system")
        bump_version(conn)
        conn.commit()
        conn.close()


def run_to_dict(row):
    if row is None:
        return {"id": None, "status": "never", "running": False, "queued": False, "total": 0, "done": 0,
                "failed": [], "trigger": None, "day": None, "created_at": None, "started_at": None, "finished_at": None}
    return {
        "id": row["id"],
        "status": row["status"],
        "running": row["status"] == "running",
        "queued": row["status"] == "queued",
        "trigger": row["trigger"],
        "day": row["day"],
        "total": row["total"],
        "done": row["done"],
        "failed": json.loads(row["failed"] or "[]"),
        "created_at": row["created_at"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
    }


@app.post("/api/sync")
@login_required
def start_sync():
    """thread mode: starts now (202). queue mode: queued for the scheduled task (202)."""
    db = get_db()
    status = "running" if SYNC_MODE == "thread" else "queued"
    run_id = claim_run(db, "manual", g.user["id"], status)
    if run_id is None:
        return error("A sync is already running or queued", 409)
    log_activity(db, "sync.start", "sync", run_id, f"Started a sync ({status})")
    db.commit()
    if status == "running":
        threading.Thread(target=run_sync, args=(run_id,), daemon=True).start()
        message = "Sync started. Check progress at GET /api/sync/status"
    else:
        message = "Sync queued. It will run with the next scheduled task."
    return jsonify({"message": message, "run_id": run_id, "mode": SYNC_MODE}), 202


@app.get("/api/sync/status")
@login_required
def sync_status():
    db = get_db()
    expire_stale_runs(db)
    db.commit()
    row = db.execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").fetchone()
    return jsonify({**run_to_dict(row), "mode": SYNC_MODE, **last_sync_info(db)})


@app.get("/api/sync/runs")
@login_required
def sync_runs():
    rows = get_db().execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?",
                            (int_arg("limit", 20, 1, 100),)).fetchall()
    return jsonify([run_to_dict(r) for r in rows])

# health check

@app.route('/api/hello', methods=['GET'])
def hello_api():
    return jsonify({
        "status": "success",
        "message": "Hello from Flask"
    })

# ---------------------------- Beecrowd agent (signed, no cookie) ------------
@app.get("/api/ingest/beecrowd/usernames")
@signed_request_required
def beecrowd_usernames():
    rows = get_db().execute(
        "SELECT DISTINCT username FROM platform_accounts WHERE platform = 'beecrowd' ORDER BY username"
    ).fetchall()
    return jsonify({"usernames": [r["username"] for r in rows]})


@app.post("/api/ingest/beecrowd")
@signed_request_required
def beecrowd_ingest():
    """
    Body = the JSON beecrowd.py saves:
      {"source": "beecrowd", "updated_at": "...", "users": {"1072467": {"rank","points","submissions","solved"}}}
    """
    try:
        payload = json.loads(request.get_data() or b"{}")
    except ValueError:
        return error("Body must be JSON")
    users = payload.get("users") if isinstance(payload, dict) else None
    if not isinstance(users, dict):
        return error("'users' must be an object")

    db = get_db()
    by_username = {}
    for acc in db.execute("SELECT id, username FROM platform_accounts WHERE platform = 'beecrowd'"):
        by_username.setdefault(acc["username"], []).append(acc["id"])

    updated, unknown, failed = 0, [], []
    for user_id, stats in users.items():
        account_ids = by_username.get(clean(user_id))
        if not account_ids:
            unknown.append(clean(user_id))
            continue
        stats = stats if isinstance(stats, dict) else {}
        solved = to_int(stats.get("solved"))
        for account_id in account_ids:
            if solved is None:
                db.execute("UPDATE platform_accounts SET last_error = ? WHERE id = ?",
                           (clean(stats.get("solved")) or "no data", account_id))
            else:
                record_result(db, account_id, solved, to_number(stats.get("points")), clean(stats.get("rank"))[:50])
        if solved is None:
            failed.append(f"{user_id}: {clean(stats.get('solved')) or 'no data'}")
        else:
            updated += 1

    set_meta(db, "beecrowd_last_ingest", now_str())
    log_activity(db, "beecrowd.ingest", "sync", None,
                 f"Beecrowd push: {updated} updated, {len(failed)} failed, {len(unknown)} unknown",
                 {"updated": updated, "failed": failed[:50], "unknown": unknown[:50],
                  "agent_updated_at": payload.get("updated_at")},
                 actor="beecrowd-agent")
    bump_version(db)
    db.commit()
    return jsonify({"message": "Beecrowd data saved", "updated": updated, "failed": failed, "unknown": unknown})


# ---------------------------- Public: leaderboard / profile / dashboard -----
@app.get("/api/leaderboard")
@public_read
def leaderboard():
    """/api/leaderboard?period=last-week&sort=solved&batch=10&search=rah&limit=50&offset=0"""
    args, problem = read_board_args()
    if problem:
        return error(problem)
    db = get_db()
    board = build_leaderboard(db, **args)
    rows = board["rows"]
    search = clean(request.args.get("search")).lower()
    if search:  # rank stays the real rank, search only hides rows
        rows = [r for r in rows if search in r["name"].lower() or search in r["student_id"].lower()]
    offset = int_arg("offset", 0, 0, 10**6)
    limit = int_arg("limit", len(rows) or 1, 1, 1000)
    board["rows"] = rows[offset:offset + limit]
    board["matched"] = len(rows)
    board["last_sync"] = last_sync_info(db)
    return jsonify(board)


@app.get("/api/students/<int:id>/profile")
@public_read
def student_profile(id):
    """Everything the profile page needs (except graphs). Same query params as the leaderboard."""
    args, problem = read_board_args()
    if problem:
        return error(problem)
    db = get_db()
    board = build_leaderboard(db, **args)
    me = next((r for r in board["rows"] if r["id"] == id), None)
    if me is None:
        return error("Student not found", 404)
    leader = board["rows"][0]
    return jsonify({
        "student": me,
        "standing": {
            "rank": me["rank"],
            "out_of": board["out_of"],
            "medal": me["medal"],
            "period": board["period"],
            "sort": board["sort"],
        },
        "is_leader": leader["id"] == me["id"],
        "leader": leader,
        "last_sync": last_sync_info(db),
    })


@app.get("/api/students/<int:id>/history")
@public_read
def student_history(id):
    """
    Graph data. /api/students/5/history?days=30&compare=leader&period=all-time&sort=solved
    compare=leader -> also returns the #1 student's series (period/sort decide who #1 is)
    """
    db = get_db()
    row = db.execute("SELECT id, student_id, name, avatar_url FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)
    days = int_arg("days", 30, 2, 365)
    dates, series = build_history(db, id, days)
    result = {"days": days, "dates": dates, "student": {**dict(row), "series": series},
              "leader": None, "leader_is_self": False}

    if clean(request.args.get("compare", "leader")).lower() == "leader":
        args, problem = read_board_args()
        if problem:
            return error(problem)
        board = build_leaderboard(db, **args)
        if board["rows"]:
            top = board["rows"][0]
            result["leader_is_self"] = top["id"] == id
            _, leader_series = build_history(db, top["id"], days) if top["id"] != id else (None, series)
            result["leader"] = {"id": top["id"], "student_id": top["student_id"], "name": top["name"],
                                "avatar_url": top["avatar_url"], "series": leader_series}
    return jsonify(result)


@app.get("/api/dashboard/summary")
@public_read
def dashboard_summary():
    db = get_db()
    board = build_leaderboard(db, "all-time", "solved")
    rows = board["rows"]
    accounts = db.execute("SELECT platform, COUNT(*) AS n FROM platform_accounts GROUP BY platform").fetchall()
    return jsonify({
        "total_students": len(rows),
        "accounts": {p: 0 for p in PLATFORMS} | {a["platform"]: a["n"] for a in accounts},
        "total_solved": sum(r["solved"]["all-time"] for r in rows),
        "today_solved": sum(r["solved"]["this-day"] for r in rows),
        "solved": {p: sum(r["solved"][p] for r in rows) for p in PERIODS},
        "by_platform": {p: sum(r["platforms"][p]["solved"]["all-time"] for r in rows) for p in PLATFORMS},
        "batches": sorted({r["batch"] for r in rows if r["batch"]}),
        "departments": sorted({r["department"] for r in rows if r["department"]}),
        "leaderboard": rows[:10],
        "last_sync": last_sync_info(db),
    })


@app.get("/api/meta")
def meta_info():
    """Constants for the frontend (dropdowns etc.)."""
    return jsonify({"platforms": PLATFORMS, "periods": PERIODS, "sorts": SORTS,
                    "profile_links": PROFILE_LINKS, "public_read": PUBLIC_READ})


# ---------------------------- Errors + gzip ---------------------------------
@app.errorhandler(HTTPException)
def http_error(exc):
    messages = {404: "Not found", 405: "Method not allowed", 413: "File is too large (max 5 MB)"}
    return error(messages.get(exc.code, exc.description), exc.code)


@app.errorhandler(Exception)
def server_error(exc):
    app.logger.exception(exc)
    return error("Something went wrong on the server", 500)


@app.after_request
def compress(response):
    """gzip big JSON answers (300-student leaderboard ~200 KB -> ~20 KB)."""
    if (
        response.direct_passthrough
        or response.status_code >= 300
        or response.mimetype != "application/json"
        or "gzip" not in request.headers.get("Accept-Encoding", "")
        or "Content-Encoding" in response.headers
    ):
        return response
    data = response.get_data()
    if len(data) < 1500:
        return response
    response.set_data(gzip.compress(data, compresslevel=5))
    response.headers["Content-Encoding"] = "gzip"
    response.vary.add("Accept-Encoding")
    return response


# ----------------------------------------------------------------------------
# 8. COMMAND LINE  (python app.py <command>)
# ----------------------------------------------------------------------------
def cli_sync():
    """For cron / PythonAnywhere scheduled task. Runs a queued sync, or a fresh one."""
    conn = connect()
    expire_stale_runs(conn)
    conn.commit()
    queued = conn.execute("SELECT id FROM sync_runs WHERE status = 'queued' ORDER BY id LIMIT 1").fetchone()
    if queued:
        conn.execute("UPDATE sync_runs SET status = 'running', day = ?, started_at = ?, heartbeat_at = ? "
                     "WHERE id = ?", (today_dhaka().isoformat(), now_str(), now_str(), queued["id"]))
        conn.commit()
        run_id = queued["id"]
    else:
        run_id = claim_run(conn, "schedule", None, "running")
    conn.close()
    if run_id is None:
        print("A sync is already running. Exiting.")
        return 1
    print(f"Sync #{run_id} started at {now_str()}")
    run_sync(run_id)
    conn = connect()
    print(json.dumps(run_to_dict(conn.execute("SELECT * FROM sync_runs WHERE id = ?", (run_id,)).fetchone()),
                     indent=2, ensure_ascii=False))
    conn.close()
    return 0


def cli_create_user(email, name, role="developer", password=None):
    email = email.strip().lower()
    if role not in ROLES:
        print("role must be 'admin' or 'developer'")
        return 1
    password = password or getpass.getpass("Password (min 6 chars): ")
    if len(password) < 6:
        print("Password too short")
        return 1
    conn = connect()
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        print("This email already exists")
        return 1
    conn.execute("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                 (name, email, generate_password_hash(password), role, now_str()))
    log_activity(conn, "user.create", "user", email, f"Created {role} account {email} from console", actor="console")
    conn.commit()
    conn.close()
    print(f"{role.title()} account created: {email}")
    return 0


def cli_set_password(email):
    password = getpass.getpass("New password (min 6 chars): ")
    if len(password) < 6:
        print("Password too short")
        return 1
    conn = connect()
    cur = conn.execute("UPDATE users SET password_hash = ? WHERE email = ?",
                       (generate_password_hash(password), email.strip().lower()))
    if cur.rowcount:
        log_activity(conn, "auth.password_reset", "user", email, "Password reset from console", actor="console")
    conn.commit()
    conn.close()
    print("Password changed" if cur.rowcount else "No user with this email")
    return 0 if cur.rowcount else 1


# ----------------------------------------------------------------------------
# 9. AUTOMATIC DAILY SYNC  (thread mode / local server)
# ----------------------------------------------------------------------------
# On PythonAnywhere (SYNC_MODE=queue) this does nothing - a Scheduled task runs
# "python3 app.py sync" at 17:59 UTC (= 23:59 Dhaka) instead.
def run_daily_sync_once():
    """Start the nightly sync, unless today's nightly sync already ran."""
    conn = connect()
    try:
        if conn.execute("SELECT 1 FROM sync_runs WHERE trigger = 'schedule' AND day = ?",
                        (today_dhaka().isoformat(),)).fetchone():
            return
        run_id = claim_run(conn, "schedule", None, "running")
    finally:
        conn.close()
    if run_id is not None:
        app.logger.info("Automatic sync #%s started", run_id)
        run_sync(run_id)


def auto_sync_loop():
    hour, minute = (int(x) for x in AUTO_SYNC_TIME.split(":"))
    while True:
        now = now_dhaka()
        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        while now_dhaka() < target:  # short naps, so a sleeping laptop / clock change can't confuse it
            time.sleep(min(60, max(1, (target - now_dhaka()).total_seconds())))
        try:
            run_daily_sync_once()
        except Exception:
            app.logger.exception("Automatic sync failed")
        time.sleep(61)


def start_auto_sync():
    if AUTO_SYNC and SYNC_MODE == "thread":
        threading.Thread(target=auto_sync_loop, daemon=True, name="auto-sync").start()
        print(f"Automatic sync every day at {AUTO_SYNC_TIME} (Dhaka time)")


init_db()  # runs on import too (PythonAnywhere WSGI imports this file)

# if __name__ == "__main__":
#     command = sys.argv[1] if len(sys.argv) > 1 else "run"
#     if command == "sync":
#         sys.exit(cli_sync())
#     elif command == "create-user" and len(sys.argv) >= 4:
#         sys.exit(cli_create_user(sys.argv[2], sys.argv[3], *sys.argv[4:6]))
#     elif command == "set-password" and len(sys.argv) >= 3:
#         sys.exit(cli_set_password(sys.argv[2]))
#     elif command == "run":
#         debug = env_bool("FLASK_DEBUG", True)
#         # With debug=True Flask starts the app twice (reloader); start the clock only in the real one.
#         if not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
#             start_auto_sync()
#         app.run(debug=debug, port=int(os.getenv("PORT", "5000")))
#     else:
#         print(__doc__)
#         sys.exit(1)
