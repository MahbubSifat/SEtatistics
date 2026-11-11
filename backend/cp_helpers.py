import logging
import time
from curl_cffi import requests

log = logging.getLogger("cp_stats")

NOT_FOUND = {"solved": "Not Found", "rating": "Not Found", "rank": "Not Found"}
ERROR = {"solved": "Error", "rating": "Error", "rank": "Error"}

class UserNotFound(Exception):
    pass

class FetchError(Exception):
    pass

def _request(method, url, retries=3, **kw):
    """HTTP call with retry + exponential backoff."""
    last = None
    for attempt in range(retries):
        try:
            r = requests.request(
                method, url, impersonate="chrome", timeout=15, **kw
            )
            if r.status_code in (403, 429, 500, 502, 503, 504):
                last = FetchError(f"HTTP {r.status_code} from {url}")
                log.warning("%s (attempt %d)", last, attempt + 1)
                time.sleep(2**attempt)
                continue
            return r
        except Exception as e:
            last = FetchError(f"{type(e).__name__}: {e}")
            log.warning("%s (attempt %d)", last, attempt + 1)
            time.sleep(2**attempt)
    raise last or FetchError("request failed")