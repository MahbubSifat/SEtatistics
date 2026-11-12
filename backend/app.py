"""
Competitive Programming Student Tracker  -  Backend (Flask + SQLite)
====================================================================
Run it:   python app.py        (server starts at http://localhost:5000)

Put this file in the SAME folder as:
    cp_helpers.py, codeforces.py, leetcode.py, codechef.py

Big picture (think of it like a school notebook):
    users             -> teachers / admins who can log in
    students          -> the kids we are tracking
    platform_accounts -> a kid's username on Codeforces / LeetCode / ...
    solved_problems   -> one row for every problem a kid solved

How "daily / weekly / monthly" works:
    Our fetchers (codeforces.py, leetcode.py, codechef.py) only tell us the
    TOTAL number solved, not the date of each problem. So we do this:
      * First sync of an account  -> we save the old problems with solved_at = NULL
                                     (meaning "solved before we started watching").
      * Next syncs                -> if the total went up, the NEW problems get
                                     solved_at = "now" (Dhaka time).
    Then "today", "last 7 days" etc. are just counting rows by date.
"""

import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta
from functools import wraps
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, session
from flask_cors import CORS
from openpyxl import load_workbook
from werkzeug.security import check_password_hash, generate_password_hash

# Our own fetchers (they return {"solved": ..., "rating": ..., "rank": ...})
from codechef import get_codechef_stats
from codeforces import get_codeforces_stats
from leetcode import get_leetcode_stats

load_dotenv()

# ----------------------------------------------------------------------------
# 1. SETTINGS
# ----------------------------------------------------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-me-in-.env-file")

# Allow the React app (running on another port) to talk to us and keep the login cookie.
CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:3000", "http://localhost:5173"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tracker.db")
TIMEZONE = ZoneInfo("Asia/Dhaka")  # BR-08: always use Bangladesh time

# beecrowd is stored in the database but NOT synced (no fetcher yet).
PLATFORMS = ["codeforces", "leetcode", "codechef", "beecrowd"]
FETCHERS = {
    "codeforces": get_codeforces_stats,
    "leetcode": get_leetcode_stats,
    "codechef": get_codechef_stats,
}

PERIODS = ["last-day", "last-week", "last-month", "all-time"]


# ----------------------------------------------------------------------------
# 2. DATABASE
# ----------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'teacher'      -- 'admin' or 'teacher'
);

CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL UNIQUE,                   -- BR-01: unique
    name       TEXT NOT NULL,
    batch      TEXT NOT NULL,
    email      TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS platform_accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    platform    TEXT NOT NULL,
    username    TEXT NOT NULL,
    last_synced TEXT,                                  -- NULL = never synced yet
    UNIQUE (student_id, platform)                      -- BR-02: one account per platform
);

CREATE TABLE IF NOT EXISTS solved_problems (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id   INTEGER NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    problem_key  TEXT NOT NULL,
    problem_name TEXT,
    solved_at    TEXT,                                 -- 'YYYY-MM-DD HH:MM:SS' (Dhaka) or NULL
    UNIQUE (account_id, problem_key)                   -- BR-03: count a problem only once
);
"""


def connect():
    """Open a new connection to the SQLite file."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row            # lets us use row["name"]
    conn.execute("PRAGMA foreign_keys = ON")  # so ON DELETE CASCADE works
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


def init_db():
    """Create tables and make one default admin if there are no users."""
    conn = connect()
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ("Admin", "admin@example.com", generate_password_hash("admin123"), "admin"),
        )
        conn.commit()
        print("Default admin created ->  admin@example.com / admin123  (change it!)")
    conn.close()


# ----------------------------------------------------------------------------
# 3. SMALL HELPERS
# ----------------------------------------------------------------------------
def error(message, status=400):
    return jsonify({"error": message}), status


def clean(value):
    """Turn anything (None, 12.0, ' abc ') into a tidy string."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def login_required(view):
    """Put this above a route to say 'only logged-in people allowed'."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return error("Please log in first", 401)
        return view(*args, **kwargs)

    return wrapper


def now_dhaka():
    return datetime.now(TIMEZONE).replace(tzinfo=None)


def fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def period_start(period):
    """
    Returns the 'start time' string for a period. A problem counts if solved_at >= start.
      last-day   -> since midnight today (BR-05)
      last-week  -> previous 7 days     (BR-06)
      last-month -> previous 30 days    (BR-07)
      all-time   -> None (no limit)
    """
    now = now_dhaka()
    if period == "last-day":
        return fmt(now.replace(hour=0, minute=0, second=0, microsecond=0))
    if period == "last-week":
        return fmt(now - timedelta(days=7))
    if period == "last-month":
        return fmt(now - timedelta(days=30))
    return None


def counts_by_student(db, since=None):
    """
    Count solved problems, grouped like this:
        { student_pk: { "codeforces": 10, "leetcode": 5, ... }, ... }
    If `since` is given, only problems solved at/after that time are counted.
    """
    sql = """
        SELECT pa.student_id AS sid, pa.platform AS platform, COUNT(*) AS n
        FROM solved_problems sp
        JOIN platform_accounts pa ON pa.id = sp.account_id
    """
    params = []
    if since:
        sql += " WHERE sp.solved_at >= ?"   # NULL (old problems) never matches
        params.append(since)
    sql += " GROUP BY pa.student_id, pa.platform"

    result = {}
    for row in db.execute(sql, params):
        result.setdefault(row["sid"], {})[row["platform"]] = row["n"]
    return result


# ----------------------------------------------------------------------------
# 4. STUDENT HELPERS  (used by the normal routes AND the Excel import)
# ----------------------------------------------------------------------------
def student_to_dict(db, row):
    """Student row + their platform usernames as one dictionary."""
    data = {
        "id": row["id"],
        "student_id": row["student_id"],
        "name": row["name"],
        "batch": row["batch"],
        "email": row["email"],
    }
    for p in PLATFORMS:
        data[f"{p}_id"] = ""
    accounts = db.execute(
        "SELECT platform, username FROM platform_accounts WHERE student_id = ?",
        (row["id"],),
    )
    for acc in accounts:
        data[f"{acc['platform']}_id"] = acc["username"]
    return data


def save_accounts(db, student_pk, data):
    """
    Save the 4 platform usernames for a student.
      - empty value  -> remove that account
      - new username -> replace the account (old solved problems are removed)
    Only keys that are present in `data` are touched.
    """
    for p in PLATFORMS:
        key = f"{p}_id"
        if key not in data:
            continue
        username = clean(data[key])
        old = db.execute(
            "SELECT id, username FROM platform_accounts WHERE student_id = ? AND platform = ?",
            (student_pk, p),
        ).fetchone()

        if old and old["username"] == username:
            continue  # nothing changed
        if old:
            db.execute("DELETE FROM platform_accounts WHERE id = ?", (old["id"],))
        if username:
            db.execute(
                "INSERT INTO platform_accounts (student_id, platform, username) VALUES (?, ?, ?)",
                (student_pk, p, username),
            )


def insert_student(db, data, created_by):
    """Insert one student (+ accounts). Returns the new row id."""
    cur = db.execute(
        "INSERT INTO students (student_id, name, batch, email, created_by) VALUES (?, ?, ?, ?, ?)",
        (
            clean(data.get("student_id")),
            clean(data.get("name")),
            clean(data.get("batch")),
            clean(data.get("email")),
            created_by,
        ),
    )
    save_accounts(db, cur.lastrowid, data)
    return cur.lastrowid


# ============================================================================
# 5. ROUTES
# ============================================================================

# ---------------------------- Authentication (FR-01, FR-02) -----------------
@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean(data.get("email")).lower()
    password = data.get("password") or ""

    user = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return error("Wrong email or password", 401)

    session.clear()
    session["user_id"] = user["id"]
    return jsonify(
        {
            "message": "Login successful",
            "user": {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]},
        }
    )


@app.post("/api/auth/logout")
@login_required
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})


# ---------------------------- Students (FR-03 .. FR-07) ---------------------
@app.get("/api/students")
@login_required
def list_students():
    """List all students. Optional search:  /api/students?search=123  (name or student id)."""
    db = get_db()
    search = clean(request.args.get("search"))

    if search:
        like = f"%{search}%"
        rows = db.execute(
            "SELECT * FROM students WHERE name LIKE ? OR student_id LIKE ? ORDER BY name",
            (like, like),
        ).fetchall()
    else:
        rows = db.execute("SELECT * FROM students ORDER BY name").fetchall()

    return jsonify([student_to_dict(db, r) for r in rows])


@app.post("/api/students")
@login_required
def add_student():
    db = get_db()
    data = request.get_json(silent=True) or {}

    for field in ("student_id", "name", "batch", "email"):
        if not clean(data.get(field)):
            return error(f"'{field}' is required")

    if db.execute("SELECT 1 FROM students WHERE student_id = ?", (clean(data["student_id"]),)).fetchone():
        return error("This student_id already exists", 409)

    new_id = insert_student(db, data, session["user_id"])
    db.commit()
    row = db.execute("SELECT * FROM students WHERE id = ?", (new_id,)).fetchone()
    return jsonify(student_to_dict(db, row)), 201


@app.get("/api/students/<int:id>")
@login_required
def get_student(id):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)
    return jsonify(student_to_dict(db, row))


@app.put("/api/students/<int:id>")
@login_required
def update_student(id):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)

    data = request.get_json(silent=True) or {}

    # Use the new value if sent, otherwise keep the old one.
    new_student_id = clean(data.get("student_id")) or row["student_id"]
    name = clean(data.get("name")) or row["name"]
    batch = clean(data.get("batch")) or row["batch"]
    email = clean(data.get("email")) or row["email"]

    clash = db.execute(
        "SELECT 1 FROM students WHERE student_id = ? AND id != ?", (new_student_id, id)
    ).fetchone()
    if clash:
        return error("This student_id already exists", 409)

    db.execute(
        "UPDATE students SET student_id = ?, name = ?, batch = ?, email = ? WHERE id = ?",
        (new_student_id, name, batch, email, id),
    )
    save_accounts(db, id, data)
    db.commit()

    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    return jsonify(student_to_dict(db, row))


@app.delete("/api/students/<int:id>")
@login_required
def delete_student(id):
    db = get_db()
    if not db.execute("SELECT 1 FROM students WHERE id = ?", (id,)).fetchone():
        return error("Student not found", 404)
    db.execute("DELETE FROM students WHERE id = ?", (id,))  # accounts + problems go too (CASCADE)
    db.commit()
    return jsonify({"message": "Student deleted"})


# ---------------------------- Excel upload & import (FR-08 .. FR-11) --------
REQUIRED_COLUMNS = ["student_id", "name", "batch", "email"]
OPTIONAL_COLUMNS = ["codeforces_id", "leetcode_id", "codechef_id", "beecrowd_id"]

# Valid rows wait here (in memory) between "upload" and "import" steps.
PENDING_IMPORTS = {}


@app.post("/api/students/excel/upload")
@login_required
def excel_upload():
    """
    Step 1: send an .xlsx file (form field name: 'file').
    We check every row and send back a preview. Nothing is saved yet.
    """
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

    # First row = column titles. "Student ID" -> "student_id"
    header = [clean(h).lower().replace(" ", "_") for h in all_rows[0]]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        return error(f"Missing required column(s): {', '.join(missing)}")

    db = get_db()
    seen_in_file = set()
    preview, valid_rows = [], []

    for number, cells in enumerate(all_rows[1:], start=2):  # Excel row numbers start at 1; row 1 is header
        row = {col: clean(cells[i]) if i < len(cells) else "" for i, col in enumerate(header) if col}
        if not any(row.values()):
            continue  # blank line, skip

        problems = []
        for col in REQUIRED_COLUMNS:
            if not row.get(col):
                problems.append(f"{col} is missing")

        sid = row.get("student_id", "")
        if sid:
            if sid in seen_in_file:
                problems.append("duplicate student_id inside the file")
            elif db.execute("SELECT 1 FROM students WHERE student_id = ?", (sid,)).fetchone():
                problems.append("student_id already exists in the database")
            seen_in_file.add(sid)

        data = {c: row.get(c, "") for c in REQUIRED_COLUMNS + OPTIONAL_COLUMNS}
        preview.append({"row": number, "data": data, "errors": problems})
        if not problems:
            valid_rows.append(data)

    import_id = uuid.uuid4().hex
    PENDING_IMPORTS[import_id] = valid_rows

    return jsonify(
        {
            "import_id": import_id,  # send this back to /excel/import to confirm
            "total_rows": len(preview),
            "valid_count": len(valid_rows),
            "error_count": len(preview) - len(valid_rows),
            "rows": preview,
        }
    )


@app.post("/api/students/excel/import")
@login_required
def excel_import():
    """Step 2: confirm the preview. Body: {"import_id": "..."}  -> saves the valid rows."""
    data = request.get_json(silent=True) or {}
    rows = PENDING_IMPORTS.pop(data.get("import_id"), None)
    if rows is None:
        return error("Import not found. Please upload the file again.", 404)

    db = get_db()
    imported, skipped = 0, 0
    for row in rows:
        # Check again - somebody may have added the same ID after the upload step.
        if db.execute("SELECT 1 FROM students WHERE student_id = ?", (row["student_id"],)).fetchone():
            skipped += 1
            continue
        insert_student(db, row, session["user_id"])
        imported += 1
    db.commit()
    return jsonify({"message": "Import finished", "imported": imported, "skipped": skipped})


# ---------------------------- Sync / data collection (FR-12 .. FR-15) -------
sync_state = {
    "running": False,
    "total": 0,
    "done": 0,
    "failed": [],
    "started_at": None,
    "finished_at": None,
}


def apply_count(conn, account, solved):
    """
    Turn "the platform says N problems" into rows in solved_problems.
      first sync  -> N rows with solved_at = NULL   (old problems)
      later syncs -> only the extra ones, solved_at = now
    """
    have = conn.execute(
        "SELECT COUNT(*) FROM solved_problems WHERE account_id = ?", (account["id"],)
    ).fetchone()[0]
    now = fmt(now_dhaka())

    if account["last_synced"] is None:
        new_rows = [(account["id"], f"old-{i}", "Solved before tracking", None) for i in range(1, solved + 1)]
    elif solved > have:
        new_rows = [(account["id"], f"new-{i}", "New solved problem", now) for i in range(have + 1, solved + 1)]
    else:
        new_rows = []

    conn.executemany(
        "INSERT OR IGNORE INTO solved_problems (account_id, problem_key, problem_name, solved_at) VALUES (?, ?, ?, ?)",
        new_rows,
    )
    conn.execute("UPDATE platform_accounts SET last_synced = ? WHERE id = ?", (now, account["id"]))
    conn.commit()


def run_sync():
    """Runs in a background thread so the API answers right away (Codeforces is slow)."""
    conn = connect()  # a thread needs its own connection
    try:
        accounts = conn.execute(
            "SELECT pa.*, s.student_id AS roll FROM platform_accounts pa "
            "JOIN students s ON s.id = pa.student_id "
            "WHERE pa.platform IN ('codeforces', 'leetcode', 'codechef')"
        ).fetchall()
        sync_state["total"] = len(accounts)

        for acc in accounts:
            try:
                result = FETCHERS[acc["platform"]](acc["username"])
                solved = result["solved"]
                if isinstance(solved, int):
                    apply_count(conn, acc, solved)
                else:  # "Not Found" or "Error"
                    sync_state["failed"].append(f"{acc['roll']} / {acc['platform']}: {solved}")
            except Exception as e:
                sync_state["failed"].append(f"{acc['roll']} / {acc['platform']}: {e}")
            sync_state["done"] += 1
    finally:
        conn.close()
        sync_state["running"] = False
        sync_state["finished_at"] = fmt(now_dhaka())


@app.post("/api/sync")
@login_required
def start_sync():
    """Start collecting data from the platforms. Returns immediately (HTTP 202)."""
    if sync_state["running"]:
        return error("A sync is already running", 409)

    sync_state.update(
        running=True, total=0, done=0, failed=[], started_at=fmt(now_dhaka()), finished_at=None
    )
    threading.Thread(target=run_sync, daemon=True).start()
    return jsonify({"message": "Sync started. Check progress at GET /api/sync/status"}), 202


@app.get("/api/sync/status")
@login_required
def sync_status():
    """Extra helper: lets the frontend show a progress bar."""
    return jsonify(sync_state)


# ---------------------------- Dashboard & statistics (FR-17..21, 29, 30) ----
@app.get("/api/dashboard/summary")
@login_required
def dashboard_summary():
    db = get_db()
    total_students = db.execute("SELECT COUNT(*) FROM students").fetchone()[0]

    all_counts = counts_by_student(db)
    today_counts = counts_by_student(db, period_start("last-day"))

    def grand_total(counts):
        return sum(sum(per.values()) for per in counts.values())

    return jsonify(
        {
            "total_students": total_students,
            "total_solved": grand_total(all_counts),
            "today_solved": grand_total(today_counts),
            "leaderboard": build_leaderboard(db, "all-time")["rows"][:10],  # top 10
        }
    )


@app.get("/api/students/<int:id>/statistics")
@login_required
def student_statistics(id):
    db = get_db()
    row = db.execute("SELECT * FROM students WHERE id = ?", (id,)).fetchone()
    if not row:
        return error("Student not found", 404)

    per_period = {}
    for period in PERIODS:
        counts = counts_by_student(db, period_start(period)).get(id, {})
        per_period[period] = sum(counts.values())

    per_platform = counts_by_student(db).get(id, {})

    return jsonify(
        {
            "student": {"id": row["id"], "student_id": row["student_id"], "name": row["name"], "batch": row["batch"]},
            "total_solved": per_period["all-time"],
            "periods": per_period,  # last-day, last-week, last-month, all-time
            "by_platform": {p: per_platform.get(p, 0) for p in PLATFORMS},
        }
    )


# ---------------------------- Leaderboard (FR-22 .. FR-28) ------------------
def build_leaderboard(db, period):
    """Rank students by problems solved in `period` (ties broken by all-time total)."""
    totals = counts_by_student(db)
    in_period = counts_by_student(db, period_start(period))

    rows = []
    for s in db.execute("SELECT id, student_id, name, batch FROM students"):
        per_platform = totals.get(s["id"], {})
        rows.append(
            {
                "student_id": s["student_id"],
                "id": s["id"],
                "name": s["name"],
                "batch": s["batch"],
                "total_solved": sum(per_platform.values()),
                "period_solved": sum(in_period.get(s["id"], {}).values()),
                "by_platform": {p: per_platform.get(p, 0) for p in PLATFORMS},
                "top_in": [],  # platforms where this student is the best
            }
        )

    rows.sort(key=lambda r: (-r["period_solved"], -r["total_solved"], r["name"].lower()))
    for position, r in enumerate(rows, start=1):
        r["rank"] = position

    # Highlight the best student(s) on each platform (FR-22).
    for p in PLATFORMS:
        best = max((r["by_platform"][p] for r in rows), default=0)
        if best > 0:
            for r in rows:
                if r["by_platform"][p] == best:
                    r["top_in"].append(p)

    return {"period": period, "rows": rows}


@app.get("/api/leaderboard")
@login_required
def leaderboard():
    """/api/leaderboard?period=last-day | last-week | last-month | all-time"""
    period = request.args.get("period", "all-time")
    if period not in PERIODS:
        return error(f"period must be one of: {', '.join(PERIODS)}")
    return jsonify(build_leaderboard(get_db(), period))


# ----------------------------------------------------------------------------
# 6. START THE SERVER
# ----------------------------------------------------------------------------
init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)