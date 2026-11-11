import time
import threading
from cp_helpers import _request, UserNotFound, FetchError, NOT_FOUND, ERROR, log

_cf_lock = threading.Lock()
_cf_last_call = 0.0

def _cf_throttle():
    global _cf_last_call
    with _cf_lock:
        wait = 2.1 - (time.time() - _cf_last_call)
        if wait > 0:
            time.sleep(wait)
        _cf_last_call = time.time()

def get_codeforces_stats(username: str) -> dict:
    username = username.strip()
    if not username:
        return dict(NOT_FOUND)

    def call(url):
        _cf_throttle()
        r = _request("GET", url)
        try:
            return r.json()
        except Exception:
            raise FetchError("Codeforces returned non-JSON")

    try:
        info = call(f"https://codeforces.com/api/user.info?handles={username}")
        if info.get("status") != "OK":
            comment = info.get("comment", "")
            if "not found" in comment.lower():
                raise UserNotFound(comment)
            raise FetchError(comment or "Codeforces API failed")

        u = info["result"][0]
        rating = u.get("rating", "Unrated")
        rank = u.get("rank", "Unrated").title()

        status = call(f"https://codeforces.com/api/user.status?handle={username}")
        if status.get("status") != "OK":
            raise FetchError(status.get("comment", "user.status failed"))

        solved = set()
        for sub in status["result"]:
            if sub.get("verdict") == "OK":
                p = sub.get("problem", {})
                if p.get("contestId") and p.get("index"):
                    solved.add(f"{p['contestId']}{p['index']}")

        return {"solved": len(solved), "rating": rating, "rank": rank}

    except UserNotFound:
        return dict(NOT_FOUND)
    except Exception as e:
        log.error("Codeforces/%s failed: %s", username, e)
        return dict(ERROR)