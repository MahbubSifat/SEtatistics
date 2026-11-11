import re
from bs4 import BeautifulSoup
from cp_helpers import _request, UserNotFound, FetchError, NOT_FOUND, ERROR, log

def _codechef_stars(rating):
    for limit, s in ((2500, "7★"), (2200, "6★"), (2000, "5★"),
                     (1800, "4★"), (1600, "3★"), (1400, "2★")):
        if rating >= limit:
            return s
    return "1★"

def get_codechef_stats(username: str) -> dict:
    username = username.strip()
    if not username:
        return dict(NOT_FOUND)

    try:
        r = _request(
            "GET",
            f"https://www.codechef.com/users/{username}",
            headers={"Referer": "https://www.codechef.com/"},
        )
        if r.status_code == 404:
            raise UserNotFound(username)
        if r.status_code != 200:
            raise FetchError(f"CodeChef HTTP {r.status_code}")

        html = r.text
        soup = BeautifulSoup(html, "html.parser")
        if "Could not find page you were looking for" in html or soup.find(
            "div", class_="page-not-found"
        ):
            raise UserNotFound(username)

        rating = 0
        header = soup.find("div", class_="rating-header")
        if header:
            num = header.find("div", class_="rating-number")
            if num:
                digits = re.sub(r"\D", "", num.text)
                rating = int(digits) if digits else 0

        star_span = soup.find("span", class_="rating")
        if star_span and star_span.text.strip():
            stars = star_span.text.strip()
        elif rating > 0:
            stars = _codechef_stars(rating)
        else:
            stars = "Unrated"

        m = re.search(r"Total Problems Solved:\s*(\d+)", html)
        solved = int(m.group(1)) if m else 0
        return {"solved": solved, "rating": rating or "Unrated", "rank": stars}

    except UserNotFound:
        return dict(NOT_FOUND)
    except Exception as e:
        log.error("CodeChef/%s failed: %s", username, e)
        return dict(ERROR)