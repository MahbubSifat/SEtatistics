"""
beecrowd.py - Beecrowd bulk profile scraper
============================================

Ei script ki kore:
    Beecrowd judge site theke onek user er profile stats (rank, points,
    submissions, solved) ekta browser session e porpor fetch kore, terminal e
    table akare print kore, ar shob data ekta .json file e save kore.

Pura flow ta short e:
    1. Brave browser ke normal vabe chalai (Playwright diye launch kori na),
       karon Playwright nije browser launch korle Cloudflare automation dhore
       fele ar challenge loop e atke jay.
    2. Browser chalu hoyar sathe sathe window minimize kore dei.
    3. Cloudflare challenge ashle 8 second wait kori. Nije pass na hole window
       samne ani + desktop notification dei, jate user ekbar click kore dey.
       Pass hoye gele abar minimize kori.
    4. Challenge pass hoyar POR Playwright ke `connect_over_cdp` diye already
       chola browser e attach kori, ar shudhu page theke data pori.
    5. Shob profile shesh hole browser puro bondho kori, data JSON e save kori,
       ar terminal e table print kori.

Cloudflare challenge proti browser session e ekbar lage, proti profile e na.
`cf_clearance` cookie `cf_profile_brave/` folder e save thake, tai porer
run gulote beshirvag shomoy kono click e lage na.

Usage:
    python beecrowd.py                      (default ID: 1072467 theke 1072480)
    python beecrowd.py 1072464 123 456      (nirdishto ID)
    python beecrowd.py --file ids.txt       (file er proti line e ekta ID)
    python beecrowd.py --output out.json    (onno jaygay JSON save)

Environment variable (shob optional):
    CDP_PORT        Browser er remote debugging port. Default: 9222
    BROWSER_PATH    Brave/Chrome er path, jodi auto-detect na hoy
    BEECROWD_OUTPUT JSON output file er path
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import random
import re
import shutil
import socket
import struct
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any

from playwright.sync_api import Page, sync_playwright


"""
----------------------------------------------------------------------------
Configuration
----------------------------------------------------------------------------
Shob constant ek jaygay rakhsi jate behavior bodlate code er moddhe khujte na
hoy. Je value gulo machine onujayi bodlate pare (port, browser path, output
path), segulo environment variable theke pori, na thakle default use kori.
"""

log = logging.getLogger("beecrowd")

Stats = dict[str, Any]

STAT_KEYS = ("rank", "points", "submissions", "solved")
NOT_FOUND: Stats = {k: "Not Found" for k in STAT_KEYS}
ERROR: Stats = {k: "Error" for k in STAT_KEYS}

DEFAULT_IDS = [str(i) for i in range(1072467, 1072481)]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("CDP_PORT", "9222"))
PROFILE_DIR = os.path.join(BASE_DIR, "cf_profile_brave")
OUTPUT_JSON = os.environ.get("BEECROWD_OUTPUT",
                             os.path.join(BASE_DIR, "beecrowd_stats.json"))

CHALLENGE_GRACE_SEC = 8
CHALLENGE_TIMEOUT_SEC = 180
NOT_FOUND_AFTER_SEC = 10
DELAY_RANGE_SEC = (3.0, 7.0)

"""
Beecrowd er profile page e ei class/id name gulo diye stat gulo dekhay.
Key holo amader output er field name, value holo HTML e element er name.
"""
PROFILE_FIELDS = {
    "rank": "profile-rank-text",
    "points": "profile-rank-points-text",
    "submissions": "profile-submissions-number",
    "solved": "profile-solved-number",
}

"""
Browser khojar list. Prothome BROWSER_PATH env, tarpor Linux er common
Brave path, tarpor Windows path, shesh e Chrome fallback. Je path ta age
exist kore, setai use hoy.
"""
BROWSER_CANDIDATES = [
    os.environ.get("BROWSER_PATH"),
    shutil.which("brave-browser"),
    shutil.which("brave"),
    "/usr/bin/brave-browser",
    "/opt/brave.com/brave/brave",
    "/snap/bin/brave",
    os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
    shutil.which("google-chrome"),
    shutil.which("google-chrome-stable"),
]

"""
Cloudflare challenge page er title e ei shobder kono ekta thake
(jemon "Just a moment..."). Title e egulo pele dhore nei challenge cholche.
"""
CHALLENGE_WORDS = ("just a moment", "attention required", "verify", "checking")


"""
----------------------------------------------------------------------------
Small helpers
----------------------------------------------------------------------------
"""


def find_browser() -> str | None:
    """
    BROWSER_CANDIDATES list er moddhe prothom je path ta disk e ache, seta
    return kori.

    Library:
        shutil.which(name) -> PATH e oi naam er program khuje full path dey,
        na pele None.
        os.path.exists(path) -> file/folder ache kina True/False dey.

    Return: browser executable er path, kichu na pele None.
    """
    for candidate in BROWSER_CANDIDATES:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def css_selector(name: str) -> str:
    """
    Beecrowd kokhono element e class hishebe naam dey, kokhono id hishebe.
    Tai ekta selector banai jeta duitai dhore: ".name, #name".

    Input: element er naam, jemon "profile-rank-text".
    Return: CSS selector string.
    """
    return f".{name}, #{name}"


def clean_text(text: str | None) -> str:
    """
    Page theke pora text e extra space, newline, tab thake. Regex diye
    shob whitespace ke ekta space banai ar dui pasher space kete dei.

    Library:
        re.sub(pattern, replacement, text) -> pattern er shob match ke
        replacement diye bodle notun string dey.
    """
    return re.sub(r"\s+", " ", text or "").strip()


def to_int_if_possible(text: str) -> int | str:
    """
    "1,234" er moto text theke comma ar space shoriye int banai, jate JSON e
    number hishebe jay ar pore sort kora jay. Number na hole (jemon "N/A")
    original text e return kori.
    """
    plain = re.sub(r"[,\s]", "", text)
    return int(plain) if plain.isdigit() else text


def profile_url(user_id: str) -> str:
    """User ID theke Beecrowd profile page er URL banai."""
    return f"https://judge.beecrowd.com/en/profile/{user_id}"


def is_challenge_title(title: str | None) -> bool:
    """
    Page title e CHALLENGE_WORDS er kono shobdo thakle True dei, mane
    Cloudflare challenge page dekhache.
    """
    lowered = (title or "").lower()
    return any(word in lowered for word in CHALLENGE_WORDS)


def notify(message: str) -> None:
    """
    User ke janai je click lagbe. Duita upay e janai:
        1. Terminal bell ("\\a" print korle terminal beep kore).
        2. Linux desktop notification, jodi `notify-send` install thake.

    Library:
        subprocess.Popen(cmd_list) -> alada process e command chalay, wait
        kore na. Notification er jonno wait korar dorkar nai, tai Popen.

    Notification fail korle script thamai na, karon notification shudhu shubidha,
    mul kaj na.
    """
    print("\a", end="", flush=True)
    try:
        if shutil.which("notify-send"):
            subprocess.Popen(
                ["notify-send", "-u", "critical", "Beecrowd", message],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    except OSError:
        pass


_warned_keys: set[str] = set()


def warn_once(key: str, message: str, *args: Any) -> None:
    """
    Ek-i warning loop e bar bar print hole log bhore jay. Tai proti key er
    jonno warning shudhu prothom bar print kori.
    """
    if key not in _warned_keys:
        _warned_keys.add(key)
        log.warning(message, *args)


"""
----------------------------------------------------------------------------
Browser control without Playwright (raw Chrome DevTools Protocol)
----------------------------------------------------------------------------
Brave/Chrome ke `--remote-debugging-port` diye chalale se localhost e ekta
HTTP + WebSocket server khole. Ei server ke bole CDP (Chrome DevTools
Protocol). Ekhane amra Playwright chara shorashori CDP use kori, karon
challenge pass hoyar age Playwright attach korle Cloudflare automation
dhore fele. Ei section er kaj gulo page er vitore kichu inject kore na,
shudhu browser er bahire theke tab list pore ar window control kore.
"""


def cdp_tabs() -> list[dict[str, Any]] | None:
    """
    Browser e khola shob tab er list ani.

    Library:
        urllib.request.urlopen(url, timeout) -> HTTP GET kore response object
        dey. response.read() raw bytes dey, .decode() kore string banai,
        json.loads() diye Python list banai.

    CDP endpoint:
        GET http://127.0.0.1:PORT/json -> proti tab er id, type, url, title
        shoho JSON list return kore.

    Return: tab list. Browser chalu na thakle (connection fail) None.
    None dekhe amra bujhi browser bondho.
    """
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=2) as resp:
            return json.loads(resp.read().decode())
    except (OSError, ValueError):
        return None


def ws_call(ws_url: str, payload: dict[str, Any], timeout: float = 5) -> dict[str, Any]:
    """
    Choto ekta WebSocket client, shudhu Python standard library diye banano.
    CDP er browser-level command gulo (window minimize, browser close) shudhu
    WebSocket diye pathano jay, HTTP diye na.

    Keno nijer client banalam:
        `websocket-client` package Ubuntu te system pip diye install hoy na
        (externally-managed-environment error). Ekta command pathiye uttor
        porar jonno pura library dorkar nai, tai stdlib diye korsi, kono
        extra install lage na. Ei client shudhu localhost CDP er jonno banano.

    Step by step:
        1. socket.create_connection((host, port)) diye TCP connection khuli.
        2. HTTP "Upgrade: websocket" request pathai (handshake). Server
           "101 Switching Protocols" dile connection WebSocket hoye jay.
        3. Amader JSON message ke WebSocket "text frame" e mude pathai.
           Client theke jaoya frame e 4 byte random mask lagano niyom, tai
           os.urandom(4) diye mask banai ar proti byte XOR kori.
        4. Server er frame gulo pori. Proti frame er prothom 2 byte e
           frame type ar length thake. Length 126 hole porer 2 byte e
           asol length, 127 hole porer 8 byte e (struct.unpack diye pori).
        5. Je response er "id" amader pathano "id" er sathe mile, seta
           return kori. Majhe browser onno event pathale segulo baad dei.

    Library:
        socket.create_connection(addr, timeout) -> connected socket dey.
        sock.sendall(bytes) -> pura data pathay.
        sock.recv(n) -> shorbochcho n byte pore, connection bondho hole b"".
        base64.b64encode(bytes) -> handshake er Sec-WebSocket-Key banate.
        struct.pack/unpack(">H" / ">Q") -> 2/8 byte big-endian number
        lekha ar pora.

    Input: browser er WebSocket URL ar CDP message dict ({"id", "method", "params"}).
    Return: browser er response dict. Fail hole ConnectionError raise kore.
    """
    hostport, path = ws_url.split("://", 1)[1].split("/", 1)
    host, port = hostport.rsplit(":", 1)
    sock = socket.create_connection((host, int(port)), timeout=timeout)
    try:
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {hostport}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(handshake.encode())

        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                raise ConnectionError("WebSocket handshake failed")
            buf += chunk
        head, buf = buf.split(b"\r\n\r\n", 1)
        status_line = head.split(b"\r\n", 1)[0]
        if b" 101" not in status_line:
            raise ConnectionError(status_line.decode(errors="replace"))

        data = json.dumps(payload).encode()
        size = len(data)
        if size < 126:
            header = bytes([0x81, 0x80 | size])
        elif size < 65536:
            header = bytes([0x81, 0x80 | 126]) + struct.pack(">H", size)
        else:
            header = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", size)
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        sock.sendall(header + mask + masked)

        def read_exact(count: int) -> bytes:
            """
            Buffer e kom data thakle socket theke aro pori, tarpor thik
            `count` byte kete return kori. Baki ta buffer e rekhe dei porer
            frame er jonno.
            """
            nonlocal buf
            while len(buf) < count:
                chunk = sock.recv(65536)
                if not chunk:
                    raise ConnectionError("WebSocket connection closed")
                buf += chunk
            out, buf = buf[:count], buf[count:]
            return out

        message = b""
        while True:
            first, second = read_exact(2)
            length = second & 0x7F
            if length == 126:
                length = struct.unpack(">H", read_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", read_exact(8))[0]
            body = read_exact(length)
            opcode = first & 0x0F

            if opcode == 0x8:
                raise ConnectionError("WebSocket closed by browser")
            if opcode in (0x0, 0x1):
                message += body
                is_final_fragment = bool(first & 0x80)
                if is_final_fragment:
                    response = json.loads(message)
                    message = b""
                    if response.get("id") == payload["id"]:
                        return response
    finally:
        sock.close()


def browser_command(method: str, params: dict[str, Any] | None = None,
                    quiet: bool = False) -> dict[str, Any] | None:
    """
    Browser e ekta CDP command pathai ar result ferot ani.

    Kivabe:
        1. GET /json/version theke browser er WebSocket URL
           (`webSocketDebuggerUrl`) ani.
        2. ws_call() diye {"id": 1, "method": ..., "params": ...} pathai.

    Je command gulo use kori:
        Browser.getWindowForTarget {targetId} -> tab ta kon window e ache
            tar windowId dey.
        Browser.getWindowBounds {windowId} -> window er state dey
            ("normal", "minimized", "maximized").
        Browser.setWindowBounds {windowId, bounds} -> window minimize/restore kore.
        Browser.close -> pura browser gracefully bondho kore.

    Fail hole exception chorai na, None return kori ar ekbar warning dei.
    quiet=True dile warning o dei na (jemon Browser.close er shomoy
    connection bhanga swabhabik).

    Return: CDP result dict, fail hole None.
    """
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2) as resp:
            ws_url = json.loads(resp.read().decode())["webSocketDebuggerUrl"]
        response = ws_call(ws_url, {"id": 1, "method": method, "params": params or {}})
    except (OSError, ValueError, KeyError) as exc:
        if not quiet:
            warn_once(method, "CDP %s failed: %s", method, exc)
        return None

    if "error" in response:
        if not quiet:
            warn_once(method, "CDP %s error: %s", method, response["error"].get("message"))
        return None
    return response.get("result", {})


class BrowserWindow:
    """
    Brave window lukano (minimize) ar dekhano (restore) er kaj ekhane.

    State:
        tab_id   -> je tab e profile khola, challenge er shomoy oi tab er
                    window ke samne ani.
        visible  -> amader hishab e window ekhon dekha jacche kina. Ei flag
                    rakhi jate already minimized window ke bar bar minimize
                    korte giye shomoy noshto na hoy.
        _asked   -> ek challenge er jonno user ke ekbar-i notification dei.
    """

    def __init__(self) -> None:
        self.tab_id: str | None = None
        self.visible = True
        self._asked = False

    def attach(self, tab_id: str) -> None:
        """Kon tab ta amader, seta mone rakhi."""
        self.tab_id = tab_id

    @staticmethod
    def _all_window_ids() -> list[int]:
        """
        Browser er shob page tab er window ID ber kori (duplicate chara).
        Shob gula lagbe karon Brave ager session restore korle alada window
        khulte pare, segulo o lukate hobe.
        """
        window_ids: list[int] = []
        for tab in cdp_tabs() or []:
            if tab.get("type") != "page":
                continue
            result = browser_command("Browser.getWindowForTarget", {"targetId": tab["id"]})
            if result and result.get("windowId") not in window_ids:
                window_ids.append(result["windowId"])
        return window_ids

    @staticmethod
    def _state(window_id: int) -> str | None:
        """Window er current state ("normal"/"minimized"/...) ani."""
        result = browser_command("Browser.getWindowBounds", {"windowId": window_id})
        return (result or {}).get("bounds", {}).get("windowState")

    def hide(self) -> None:
        """
        Shob Brave window minimize kori.

        Retry keno:
            Browser chalu hoyar shathe shathe minimize pathale window tokhono
            screen e ashe ni, tai window manager command ta ignore kore.
            Tai minimize pathai, 0.5 second wait kori, state check kori, ar
            "minimized" na hole abar pathai. 8 bar porjonto.

        8 bar e o na hole visible=False kore dei jate proti profile e abar
        4 second noshto na hoy, ar user ke warning dei.
        """
        self._asked = False
        if not self.visible:
            return

        for _ in range(8):
            window_ids = self._all_window_ids()
            for window_id in window_ids:
                if self._state(window_id) != "minimized":
                    browser_command("Browser.setWindowBounds", {
                        "windowId": window_id,
                        "bounds": {"windowState": "minimized"},
                    })
            time.sleep(0.5)
            if window_ids and all(self._state(w) == "minimized" for w in window_ids):
                self.visible = False
                log.info("Browser window minimized")
                return

        self.visible = False
        warn_once("minimize", "Could not confirm window minimize. Check the CDP warning "
                              "above and the output of `echo $XDG_SESSION_TYPE`.")

    def show(self, user_id: str) -> None:
        """
        Challenge er shomoy amader tab er window "normal" state e samne ani,
        ar user ke notification dei je click lagbe. Ek challenge e ekbar-i
        janai (_asked flag diye), jate loop e bar bar notification na ashe.
        """
        if self._asked:
            return
        self._asked = True

        result = (browser_command("Browser.getWindowForTarget", {"targetId": self.tab_id})
                  if self.tab_id else None)
        if result:
            browser_command("Browser.setWindowBounds", {
                "windowId": result["windowId"],
                "bounds": {"windowState": "normal"},
            })
        self.visible = True
        log.warning("Cloudflare challenge (user %s): click the checkbox in the Brave window...",
                    user_id)
        notify("Cloudflare challenge: click once in the Brave window")


def open_tab(url: str) -> None:
    """
    Already chola browser e notun tab khuli.

    CDP endpoint:
        PUT /json/new?<url> -> oi URL diye notun tab khole. Notun Chrome
        version e GET na, PUT method lage.
    """
    try:
        request = urllib.request.Request(f"http://127.0.0.1:{PORT}/json/new?{url}", method="PUT")
        urllib.request.urlopen(request, timeout=3).read()
    except OSError as exc:
        log.debug("open_tab failed: %s", exc)


def start_browser(url: str) -> subprocess.Popen | None:
    """
    Brave ke normal program er moto chalai, Playwright diye na.

    Ager theke browser chalu thakle (port e response pai):
        Notun kore chalai na, oi browser e notun tab khuli ar None return
        kori. None mane "amra nije chalai ni".

    Notun kore chalale je flag gulo dei:
        --remote-debugging-port      -> CDP server chalu kore, jate amra
                                        bahir theke control korte pari.
        --remote-debugging-address   -> shudhu localhost e shune, network e na.
        --user-data-dir              -> alada profile folder. Ekhane
                                        Cloudflare cookie save thake, ar
                                        user er normal Brave er sathe
                                        jhamela hoy na.
        --no-first-run / --no-default-browser-check
                                     -> welcome page ar popup bondho.
        --hide-crash-restore-bubble  -> "restore pages?" popup bondho.
        --disable-background-timer-throttling
        --disable-renderer-backgrounding
        --disable-backgrounding-occluded-windows
                                     -> minimized window e browser JS
                                        dhire kore dey. Egulo bondho kori
                                        jate challenge er JS minimized
                                        obosthay o thik moto chole.

    Library:
        subprocess.Popen(cmd_list, stdout, stderr) -> browser alada process
        e chalay ar shathe shathe Popen object return kore. proc.poll()
        None dile process ekhono cholche.

    Chalanor por 20 second porjonto (40 x 0.5s) wait kori debug port khola
    porjonto. Process age-i mara gele bujhi same profile onno browser e
    khola, tai clear error dei.

    Return: Popen object (amra chalale) othoba None (ager browser reuse korle).
    """
    if cdp_tabs() is not None:
        log.info("Browser already running on port %d, reusing", PORT)
        open_tab(url)
        return None

    executable = find_browser()
    if not executable:
        raise RuntimeError("Brave/Chrome not found. Set the BROWSER_PATH environment variable.")

    log.info("Starting browser: %s", executable)
    proc = subprocess.Popen(
        [
            executable,
            f"--remote-debugging-port={PORT}",
            "--remote-debugging-address=127.0.0.1",
            f"--user-data-dir={PROFILE_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
            "--hide-crash-restore-bubble",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            url,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if cdp_tabs() is not None:
            return proc
        if proc.poll() is not None:
            raise RuntimeError("Browser exited immediately (is the same profile already open?)")
        time.sleep(0.5)
    raise RuntimeError("Browser debug port did not open")


def shutdown_browser(proc: subprocess.Popen | None) -> None:
    """
    Kaj shesh e browser puro bondho kori.

    Prothome CDP "Browser.close" pathai. Browser.close gracefully bondho kore, mane
    browser cookie disk e likhe tarpor bondho hoy. Graceful close important, karon
    Cloudflare cookie save na hole porer run e abar click lagbe.

    10 second e bondho na hole ar process amader chalano hole:
        proc.terminate() -> SIGTERM pathay (bhodro vabe bondho hote bole).
        proc.wait(timeout) -> bondho hoyar jonno wait kore.
        proc.kill() -> tao na hole SIGKILL (jor kore bondho).
    """
    def is_gone() -> bool:
        return cdp_tabs() is None and (proc is None or proc.poll() is not None)

    if is_gone():
        return

    browser_command("Browser.close", quiet=True)
    for _ in range(20):
        if is_gone():
            log.info("Browser closed")
            return
        time.sleep(0.5)

    if proc is not None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.info("Browser closed (terminated)")
    else:
        log.warning("Could not close the browser, please close it manually")


def wait_until_challenge_passed(user_id: str, proc: subprocess.Popen | None,
                                window: BrowserWindow, timeout: float) -> bool:
    """
    Playwright attach korar AGE prothom profile er challenge pass hoyar jonno
    wait kori. Ekhane shudhu /json endpoint diye tab er title pori, page e
    kichu inject kori na, tai Cloudflare kichu terpay na.

    Loop e proti second:
        1. Browser/process mara gele error raise kori.
        2. Amader profile URL er tab ta khuji.
        3. Prothom bar tab pele 1.5 second wait kore (window screen e ashar
           jonno) minimize kori.
        4. Title e challenge thakle timer chalai. CHALLENGE_GRACE_SEC er beshi
           thakle window samne ani + notify kori.
        5. Title ache ar challenge na hole pass, window lukiye True return kori.

    Return: timeout er moddhe pass hole True, na hole False.
    """
    deadline = time.time() + timeout
    url_key = f"/profile/{user_id}"
    challenge_since: float | None = None
    attached = False

    while time.time() < deadline:
        if proc is not None and proc.poll() is not None:
            raise RuntimeError("Browser window was closed before finishing")
        tabs = cdp_tabs()
        if tabs is None:
            raise RuntimeError("Browser closed")

        tab = next((t for t in tabs
                    if t.get("type") == "page" and url_key in t.get("url", "")), None)
        if tab:
            if not attached:
                window.attach(tab["id"])
                time.sleep(1.5)
                window.hide()
                attached = True

            title = tab.get("title") or ""
            if is_challenge_title(title):
                challenge_since = challenge_since or time.time()
                if time.time() - challenge_since > CHALLENGE_GRACE_SEC:
                    window.show(user_id)
            elif title:
                window.hide()
                return True
        time.sleep(1)
    return False


"""
----------------------------------------------------------------------------
Page scraping (Playwright, challenge pass hoyar por)
----------------------------------------------------------------------------
Ekhane Playwright er `Page` object use kori. `connect_over_cdp` diye already
chola browser e attach korle Playwright amader tab ke `Page` hishebe dey.
"""


def page_has_data(page: Page) -> bool:
    """
    Profile er rank ba solved element page e chole eshe kina check kori.

    Library:
        page.query_selector(css) -> prothom matching element dey, na pele
        None. Wait kore na, tai loop e bar bar check kora jay.
    """
    try:
        return bool(page.query_selector(css_selector(PROFILE_FIELDS["rank"]))
                    or page.query_selector(css_selector(PROFILE_FIELDS["solved"])))
    except Exception:
        return False


def page_is_challenge(page: Page) -> bool:
    """
    page.title() -> current page er <title> text dey. Navigation er majhe
    call korle exception dite pare, tokhon False dhori.
    """
    try:
        return is_challenge_title(page.title())
    except Exception:
        return False


def read_profile(page: Page) -> Stats:
    """
    Profile page theke 4 ta stat pori.

    Library:
        element.inner_text() -> element er dekha jay emon text dey.

    Element na pele "N/A" boshai. submissions ar solved ke int e convert
    kori, rank ar points string e rakhi (rank e comma thake, points e
    decimal).

    Return: {"rank": ..., "points": ..., "submissions": ..., "solved": ...}
    """
    result: Stats = {}
    for key, name in PROFILE_FIELDS.items():
        element = page.query_selector(css_selector(name))
        text = clean_text(element.inner_text()) if element else "N/A"
        result[key] = to_int_if_possible(text) if key in ("submissions", "solved") else text
    return result


def scrape_profile(page: Page, user_id: str, window: BrowserWindow,
                   navigate: bool = True,
                   challenge_timeout: float = CHALLENGE_TIMEOUT_SEC) -> Stats:
    """
    Ekta user er profile scrape kori.

    navigate=True hole page.goto() diye profile e jai.
        page.goto(url, wait_until="domcontentloaded", timeout) -> HTML load
        hoyar por return kore, image/script er jonno wait kore na.
    Prothom user er page already khola thake (start_browser e URL
    diyechilam), tai tar jonno navigate=False.

    Tarpor proti second e check:
        Data ache          -> window lukiye data pore return.
        Challenge ache     -> grace period er por window dekhai, user er
                              click er jonno wait kori.
        Kichui nai         -> page load hocche, othoba user exist kore na.
                              NOT_FOUND_AFTER_SEC por o kichu na ashle
                              NOT_FOUND return.
    Timeout e ERROR return.
    """
    if navigate:
        page.goto(profile_url(user_id), wait_until="domcontentloaded", timeout=60_000)

    deadline = time.time() + challenge_timeout
    empty_since: float | None = None
    challenge_since: float | None = None

    while time.time() < deadline:
        if page.is_closed():
            raise RuntimeError("Browser window closed")

        if page_has_data(page):
            window.hide()
            return read_profile(page)

        if page_is_challenge(page):
            empty_since = None
            challenge_since = challenge_since or time.time()
            if time.time() - challenge_since > CHALLENGE_GRACE_SEC:
                window.show(user_id)
        else:
            challenge_since = None
            empty_since = empty_since or time.time()
            if time.time() - empty_since > NOT_FOUND_AFTER_SEC:
                window.hide()
                return dict(NOT_FOUND)
        time.sleep(1)
    return dict(ERROR)


def find_profile_page(browser: Any, user_id: str) -> Page | None:
    """
    connect_over_cdp er por Playwright browser er shob context er shob page
    dey (browser.contexts -> list, context.pages -> list). Ekhan theke
    amader prothom profile er tab ta khuje ber kori.
    """
    url_key = f"/profile/{user_id}"
    for context in browser.contexts:
        for page in context.pages:
            if url_key in page.url:
                return page
    return None


"""
----------------------------------------------------------------------------
Public API
----------------------------------------------------------------------------
"""


def unique_ids(user_ids: list[Any]) -> list[str]:
    """
    ID gulo string banai, khali gulo baad dei, duplicate baad dei, kintu
    original order thik rakhi. dict.fromkeys() order rakhe ar duplicate
    shoray, tai dict.fromkeys() use korsi.
    """
    cleaned = (str(u).strip() for u in user_ids)
    return list(dict.fromkeys(u for u in cleaned if u))


def get_beecrowd_bulk(user_ids: list[Any],
                      delay: tuple[float, float] = DELAY_RANGE_SEC,
                      challenge_timeout: float = CHALLENGE_TIMEOUT_SEC) -> dict[str, Stats]:
    """
    Ekta browser session e onek user er stats ani. Ei file er mul function.

    Input:
        user_ids          -> Beecrowd user ID er list.
        delay             -> profile er majhe random wait (min, max) second,
                             jate site amader block na kore.
        challenge_timeout -> challenge pass er jonno shorbochcho koto second
                             wait korbo.

    Flow:
        1. start_browser() diye Brave chalai prothom profile URL diye.
        2. wait_until_challenge_passed() diye challenge pass er wait.
        3. sync_playwright() context khuli.
           p.chromium.connect_over_cdp(url) -> chola browser e attach kore
           Browser object dey. Notun browser launch kore na.
        4. Proti ID er jonno scrape_profile(). Fail hole ekbar retry.
        5. browser.close() -> connect_over_cdp er khetre shudhu Playwright
           disconnect hoy, browser bondho hoy na.
        6. finally te shutdown_browser() diye browser asholei bondho kori,
           error holeo.

    Return: {user_id: stats_dict}. Kono user fail korle tar stats ERROR.
    """
    ids = unique_ids(user_ids)
    if not ids:
        return {}

    results: dict[str, Stats] = {}
    proc: subprocess.Popen | None = None
    window = BrowserWindow()

    try:
        proc = start_browser(profile_url(ids[0]))

        if not wait_until_challenge_passed(ids[0], proc, window, challenge_timeout):
            log.error("Cloudflare challenge not passed in time")
            return {i: dict(ERROR) for i in ids}

        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
            try:
                page = find_profile_page(browser, ids[0])
                if page is None:
                    log.error("Could not find the profile tab after connecting")
                    return {i: dict(ERROR) for i in ids}

                for index, user_id in enumerate(ids):
                    stats: Stats = dict(ERROR)
                    for attempt in (1, 2):
                        try:
                            stats = scrape_profile(
                                page, user_id, window,
                                navigate=(index > 0 or attempt > 1),
                                challenge_timeout=challenge_timeout,
                            )
                            if stats != ERROR:
                                break
                        except Exception as exc:
                            log.warning("Beecrowd/%s attempt %d failed: %s", user_id, attempt, exc)
                            stats = dict(ERROR)
                            time.sleep(3)

                    results[user_id] = stats
                    log.info("[%d/%d] %s -> %s", index + 1, len(ids), user_id, stats)

                    if index < len(ids) - 1:
                        time.sleep(random.uniform(*delay))
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    except Exception as exc:
        log.error("Beecrowd bulk scrape failed: %s", exc)
        for user_id in ids:
            results.setdefault(user_id, dict(ERROR))
    finally:
        shutdown_browser(proc)

    return results


def get_beecrowd_stats(user_id: str) -> Stats:
    """Shudhu ekjon user er jonno shortcut. Vitore get_beecrowd_bulk() e call kore."""
    user_id = str(user_id).strip()
    return get_beecrowd_bulk([user_id]).get(user_id, dict(ERROR))


"""
----------------------------------------------------------------------------
Output
----------------------------------------------------------------------------
"""


def save_json(results: dict[str, Stats], path: str = OUTPUT_JSON) -> None:
    """
    Result JSON file e save kori.

    File er structure:
        {
          "source": "beecrowd",
          "updated_at": "2026-11-11T10:00:00+00:00",
          "users": { "1072467": {"rank": ..., "points": ..., ...}, ... }
        }

    updated_at UTC te rakhi (datetime.now(timezone.utc).isoformat()), jate
    pore server e time zone niye confusion na hoy. Ei same structure ta pore
    PythonAnywhere API te pathano jabe.

    Atomic save:
        Prothome ".tmp" file e likhi, tarpor os.replace() diye asol naam e
        rename kori. Majh pothe crash holeo ager valid JSON file nosto hoy na.

    Library:
        json.dump(obj, file, ensure_ascii=False, indent=2) -> sundor format
        e JSON likhe. ensure_ascii=False dile non-English text o thik thake.
    """
    payload = {
        "source": "beecrowd",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "users": results,
    }
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)
    log.info("Saved %d users to %s", len(results), path)


def print_table(results: dict[str, Stats]) -> None:
    """
    Terminal e column align kore table print kori. f-string er
    `:<10` mane bame align 10 ghor, `:>12` mane dane align 12 ghor.
    """
    header = f"{'ID':<10}{'Rank':>12}{'Points':>10}{'Subs':>8}{'Solved':>8}"
    print()
    print(header)
    print("-" * len(header))
    for user_id, stats in results.items():
        print(f"{user_id:<10}{str(stats['rank']):>12}{str(stats['points']):>10}"
              f"{str(stats['submissions']):>8}{str(stats['solved']):>8}")
    print()


"""
----------------------------------------------------------------------------
Command line entry point
----------------------------------------------------------------------------
"""


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    """
    argparse diye command line argument pori.

    Library:
        argparse.ArgumentParser.add_argument(...) -> kon argument nibe
        define kore. parse_args(argv) -> Namespace object dey jekhane
        args.ids, args.file, args.output pawa jay. Vul argument dile
        argparse nije help message dekhay.
    """
    parser = argparse.ArgumentParser(description="Fetch Beecrowd profile stats in bulk.")
    parser.add_argument("ids", nargs="*", help="Beecrowd user IDs")
    parser.add_argument("--file", help="text file with one user ID per line")
    parser.add_argument("--output", default=OUTPUT_JSON, help="JSON output path")
    return parser.parse_args(argv)


def load_ids(args: argparse.Namespace) -> list[str]:
    """
    ID kotha theke ashbe thik kori:
        --file dile file theke (khali line ar "#" diye shuru line baad).
        Na hole command line er ID.
        Kichui na dile DEFAULT_IDS.
    """
    if args.file:
        with open(args.file, encoding="utf-8") as fh:
            return [line.strip() for line in fh
                    if line.strip() and not line.lstrip().startswith("#")]
    return args.ids or DEFAULT_IDS


def main(argv: list[str] | None = None) -> int:
    """
    Script er shuru ekhane.

    logging.basicConfig() ekhane call kori, module er upore na, jate onno
    keu ei file import korle tar logging setting nosto na hoy.

    Return (exit code):
        0 -> komoponokhe ekjon user er data shothik vabe esheche.
        1 -> shobai fail (cron/systemd e failure dhora jay).
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args(argv)

    results = get_beecrowd_bulk(load_ids(args))
    save_json(results, args.output)
    print_table(results)

    succeeded = any(stats["rank"] not in ("Error", "Not Found") for stats in results.values())
    return 0 if succeeded else 1


if __name__ == "__main__":
    sys.exit(main())