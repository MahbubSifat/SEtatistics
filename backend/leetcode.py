from curl_cffi import requests
from cp_helpers import _request, UserNotFound, FetchError, NOT_FOUND, ERROR, log

_LC_QUERY = """
query getUserProfile($username: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal { 
      acSubmissionNum { 
        difficulty 
        count 
      } 
    }
  }
  userContestRanking(username: $username) {
    rating
    badge { name }
  }
}
"""

def _leetcode_graphql(username):
    session = requests.Session(impersonate="chrome")
    headers = {
        "content-type": "application/json",  # Fix: 'json' er bodole 'application/json'
        "origin": "https://leetcode.com",
        "referer": f"https://leetcode.com/u/{username}/",
    }
    
    try:
        session.get("https://leetcode.com/", timeout=15)
        token = session.cookies.get("csrftoken", "")
        if token:
            headers["x-csrftoken"] = token
    except Exception:
        pass

    r = session.post(
        "https://leetcode.com/graphql",
        json={"query": _LC_QUERY, "variables": {"username": username}},
        headers=headers,
        timeout=15,
    )
    
    try:
        body = r.json()
    except Exception:
        raise FetchError(f"LeetCode GraphQL non-JSON (HTTP {r.status_code})")

    data = body.get("data") or {}
    matched = data.get("matchedUser")
    if not matched:
        errs = " ".join(e.get("message", "") for e in body.get("errors", []))
        if "does not exist" in errs.lower() or "user not found" in errs.lower() or (not errs and r.status_code == 200):
            raise UserNotFound(username)
        raise FetchError(errs or "LeetCode GraphQL failed")

    ac = matched.get("submitStatsGlobal", {}).get("acSubmissionNum", [])
    solved = next((i["count"] for i in ac if i["difficulty"] == "All"), 0)

    rating, rank = "Unrated", "Unrated"
    contest = data.get("userContestRanking")
    if contest and contest.get("rating"):
        rating = round(contest["rating"])
        badge = contest.get("badge") or {}
        rank = badge.get("name") or "Practitioner"
        
    return {"solved": solved, "rating": rating, "rank": rank}

def _leetcode_stats_api(username):
    r = _request("GET", f"https://leetcode-stats-api.herokuapp.com/{username}", retries=2)
    d = r.json()
    if d.get("status") != "success":
        if "not exist" in str(d.get("message", "")).lower():
            raise UserNotFound(username)
        raise FetchError(d.get("message", "stats api failed"))
    return {"solved": d["totalSolved"], "rating": "N/A", "rank": "N/A"}

def _leetcode_alfa(username):
    base = f"https://alfa-leetcode-api.onrender.com/{username}"
    r = _request("GET", f"{base}/solved", retries=2)
    d = r.json()
    solved = d.get("solvedProblem")
    if solved is None:
        raise FetchError("alfa api returned no data")
    rating, rank = "Unrated", "Unrated"
    try:
        c = _request("GET", f"{base}/contest", retries=1).json()
        if c.get("contestRating"):
            rating, rank = round(c["contestRating"]), "Practitioner"
    except Exception:
        pass
    return {"solved": solved, "rating": rating, "rank": rank}

def get_leetcode_stats(username: str) -> dict:
    username = username.strip()
    if not username:
        return dict(NOT_FOUND)

    last = None
    for fn in (_leetcode_graphql, _leetcode_stats_api, _leetcode_alfa):
        try:
            return fn(username)
        except UserNotFound:
            return dict(NOT_FOUND)
        except Exception as e:

            log.debug("LeetCode source %s failed: %s", fn.__name__, e)
            last = e

    log.error("LeetCode/%s failed: all sources failed (%s)", username, last)
    return dict(ERROR)