"""
beecrowd_push.py - Beecrowd er data local machine theke backend e pathay
========================================================================

Keno alada file:
    Beecrowd Cloudflare er karone server (PythonAnywhere) theke scrape kora jay na.
    Tai local machine e beecrowd.py diye scrape kori, tarpor ei script data ta
    backend e POST kore dey. beecrowd.py te kono change lage na, ei file shudhu
    oitake import kore use kore.

Pura flow:
    1. Backend theke beecrowd ID list ani   (GET  /api/ingest/beecrowd/usernames)
    2. beecrowd.get_beecrowd_bulk(ids) diye scrape kori
    3. Backup hishebe JSON file e save kori (beecrowd_stats.json)
    4. Backend e pathai                      (POST /api/ingest/beecrowd)

Security (HMAC signature):
    Proti request e duita header jay:
        X-Timestamp : ekhon er unix time (second)
        X-Signature : HMAC_SHA256(INGEST_SECRET, "<timestamp>." + body) er hex
    Backend o same secret diye signature banay ar mille tobei data ney.
    Secret ta network e kokhono jay na, ar 5 minute er purono request reject hoy.
    Tai computer er clock thik thakte hobe.

Usage:
    python beecrowd_push.py                         backend theke ID ene scrape + push
    python beecrowd_push.py --ids 1072467 1072468   shudhu ei ID gulo
    python beecrowd_push.py --dry-run               scrape kore, push kore na
    python beecrowd_push.py --push-only beecrowd_stats.json   ager save kora JSON abar pathay

Settings (.env file e, ei script er folder e):
    BACKEND_URL   = http://localhost:5000            (deploy er por: https://<user>.pythonanywhere.com)
    INGEST_SECRET = <backend er .env er same secret>
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request

try:  # .env thakle pori, python-dotenv na thakleo script chole
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

import beecrowd  # same folder er beecrowd.py

log = logging.getLogger("beecrowd_push")

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5000").rstrip("/")
INGEST_SECRET = os.environ.get("INGEST_SECRET", "")


def signed_request(method: str, path: str, body: bytes = b"", timeout: float = 30) -> dict:
    """
    Backend e signed request pathai ar JSON uttor ferot dei.
    Error hole RuntimeError raise kori, jate main() bujhte pare.
    """
    if not INGEST_SECRET:
        raise RuntimeError("INGEST_SECRET set kora nai (.env file dekho)")

    timestamp = str(int(time.time()))
    signature = hmac.new(INGEST_SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        BACKEND_URL + path,
        data=body if method == "POST" else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            "X-Timestamp": timestamp,
            "X-Signature": signature,
            "User-Agent": "beecrowd-agent/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"Backend {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Backend e connect kora jacche na ({BACKEND_URL}): {exc.reason}") from exc


def fetch_ids_from_backend() -> list[str]:
    """Database e je beecrowd ID gulo ache, shegulo ani."""
    return signed_request("GET", "/api/ingest/beecrowd/usernames").get("usernames", [])


def push(payload: dict) -> dict:
    """beecrowd.save_json() er same structure ta backend e pathai."""
    body = json.dumps(payload, ensure_ascii=False).encode()
    return signed_request("POST", "/api/ingest/beecrowd", body)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description="Scrape beecrowd locally and push to the backend.")
    parser.add_argument("--ids", nargs="*", help="nirdishto beecrowd ID (na dile backend theke ane)")
    parser.add_argument("--output", default=beecrowd.OUTPUT_JSON, help="backup JSON er path")
    parser.add_argument("--dry-run", action="store_true", help="scrape kori, push kori na")
    parser.add_argument("--push-only", metavar="JSON", help="scrape na kore ei JSON file push kori")
    args = parser.parse_args(argv)

    try:
        if args.push_only:
            with open(args.push_only, encoding="utf-8") as fh:
                payload = json.load(fh)
        else:
            ids = args.ids or fetch_ids_from_backend()
            if not ids:
                log.info("Kono beecrowd ID nai. Kaj shesh.")
                return 0
            log.info("%d ta beecrowd profile scrape korbo", len(ids))
            results = beecrowd.get_beecrowd_bulk(ids)
            beecrowd.save_json(results, args.output)  # push fail korleo data hariye jabe na
            beecrowd.print_table(results)
            with open(args.output, encoding="utf-8") as fh:
                payload = json.load(fh)

        if args.dry_run:
            log.info("--dry-run: push kora holo na")
            return 0

        answer = push(payload)
        log.info("Backend: %d updated, %d failed, %d unknown",
                 answer.get("updated", 0), len(answer.get("failed", [])), len(answer.get("unknown", [])))
        for line in answer.get("failed", []):
            log.warning("failed: %s", line)
        if answer.get("unknown"):
            log.warning("Database e nai emon ID: %s", ", ".join(answer["unknown"]))
        return 0
    except RuntimeError as exc:
        log.error("%s", exc)
        if not args.push_only and not args.dry_run:
            log.error("Data %s e save ache. Pore chalao: python beecrowd_push.py --push-only %s",
                      args.output, args.output)
        return 1


if __name__ == "__main__":
    sys.exit(main())