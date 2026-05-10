#!/usr/bin/env python3
"""
TreatNote RPA HTTP Server
=========================
Lightweight HTTP wrapper around treatnote.py.
Listens on port 8900 for POST /run requests, spawns treatnote.py
with the payload piped to stdin, and returns the result.

Deploy to: /opt/voice-recorder/playground/TreatNote/SCRIPTS/rpa_server.py
Run with:  python3 rpa_server.py
Systemd:   See rpa_server.service

Security: Requires X-RPA-Key header matching RPA_SECRET env var.
"""

import asyncio
import json
import os
import sys
import time
import hashlib
import hmac
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

PORT = int(os.environ.get("RPA_PORT", "8900"))
RPA_SECRET = os.environ.get("RPA_SECRET", "").strip()
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TREATNOTE_PY = os.path.join(SCRIPT_DIR, "treatnote.py")

# Max concurrent RPA runs
MAX_CONCURRENT = 3
_running = 0


def log(level: str, msg: str):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{level}] {ts} {msg}", flush=True)


class RPAHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        log("HTTP", f"{self.client_address[0]} {format % args}")

    def do_GET(self):
        """Health check endpoint"""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "running": _running,
                "max_concurrent": MAX_CONCURRENT,
            }).encode("utf-8"))
            return

        if self.path == "/diag":
            import subprocess as sp
            diag = {
                "sys_executable": sys.executable,
                "script_dir": SCRIPT_DIR,
                "treatnote_exists": os.path.isfile(TREATNOTE_PY),
            }
            # Check multiple python paths
            candidates = ["/usr/bin/python3", "/usr/local/bin/python3", "/opt/voice-recorder/playground/TreatNote/SCRIPTS/venv/bin/python3", sys.executable]
            # Also check for any venv in the SCRIPTS dir
            for item in os.listdir(SCRIPT_DIR):
                venv_python = os.path.join(SCRIPT_DIR, item, "bin", "python3")
                if os.path.isfile(venv_python):
                    candidates.append(venv_python)
            # Also check parent dirs
            parent = os.path.dirname(SCRIPT_DIR)
            for item in os.listdir(parent):
                venv_python = os.path.join(parent, item, "bin", "python3")
                if os.path.isfile(venv_python):
                    candidates.append(venv_python)

            checks = {}
            for pypath in set(candidates):
                try:
                    r = sp.run([pypath, "-c", "import playwright; print(playwright.__file__)"], capture_output=True, text=True, timeout=5)
                    checks[pypath] = {"has_playwright": r.returncode == 0, "output": r.stdout.strip(), "error": r.stderr.strip()[:200]}
                except Exception as e:
                    checks[pypath] = {"has_playwright": False, "error": str(e)[:200]}
            diag["python_checks"] = checks

            # Also list files in SCRIPT_DIR
            diag["script_dir_contents"] = os.listdir(SCRIPT_DIR)[:30]

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(diag, indent=2).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        global _running

        if self.path != "/run":
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"not_found"}')
            return

        # Auth check
        if RPA_SECRET:
            key = self.headers.get("X-RPA-Key", "")
            if not hmac.compare_digest(key, RPA_SECRET):
                log("WARN", f"Auth failed from {self.client_address[0]}")
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"unauthorized"}')
                return

        # Concurrency check
        if _running >= MAX_CONCURRENT:
            log("WARN", f"Concurrency limit ({_running}/{MAX_CONCURRENT})")
            self.send_response(429)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "too_many_concurrent",
                "running": _running,
                "max": MAX_CONCURRENT,
            }).encode("utf-8"))
            return

        # Read body
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"empty_body"}')
            return

        body = self.rfile.read(content_length)

        try:
            payload = json.loads(body)
        except json.JSONDecodeError as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"invalid_json: {e}"}).encode("utf-8"))
            return

        # Extract args
        domain = payload.get("flexi_domain", "").strip()
        username = payload.get("flexi_username", "").strip()
        pw = payload.get("flexi_pw", "").strip()
        paciens_id = payload.get("PaciensID", "").strip()

        if not domain or not username or not pw:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"missing flexi_domain, flexi_username, or flexi_pw"}')
            return

        if not paciens_id:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"missing PaciensID"}')
            return

        # Build command
        cmd = [sys.executable, TREATNOTE_PY, domain, username, pw, paciens_id]

        # The payload piped to stdin should include vizitek
        stdin_payload = json.dumps(payload, ensure_ascii=False)

        log("INFO", f"Starting RPA: domain={domain} paciens={paciens_id} vizitek={len(payload.get('vizitek', []))}")

        _running += 1
        t0 = time.time()

        try:
            proc = self._run_subprocess(cmd, stdin_payload)
            elapsed = time.time() - t0
            log("INFO", f"RPA finished: exit={proc['returncode']} elapsed={elapsed:.1f}s")

            # Try to parse stdout as JSON (treatnote.py outputs JSON)
            stdout = proc["stdout"]
            stderr = proc["stderr"]
            try:
                # treatnote.py may print debug lines before JSON — grab last line
                lines = stdout.strip().split("\n")
                result_json = None
                for line in reversed(lines):
                    line = line.strip()
                    if line.startswith("{"):
                        result_json = json.loads(line)
                        break

                if result_json is None:
                    result_json = {"ok": 0, "error": "no_json_output", "stdout": stdout[-2000:], "stderr": stderr[-2000:]}
            except json.JSONDecodeError:
                result_json = {"ok": 0, "error": "invalid_json_output", "stdout": stdout[-2000:], "stderr": stderr[-2000:]}

            result_json["elapsed_seconds"] = round(elapsed, 2)
            result_json["exit_code"] = proc["returncode"]
            # Include full stdout for debugging (treatnote.py print lines)
            debug_lines = [l for l in stdout.strip().split("\n") if l.strip() and not l.strip().startswith("{")]
            if stderr.strip():
                debug_lines.append("--- STDERR ---")
                debug_lines.extend(stderr.strip().split("\n"))
            if debug_lines:
                result_json["debug_log"] = debug_lines[-200:]  # last 200 lines

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result_json, ensure_ascii=False).encode("utf-8"))

        except Exception as e:
            elapsed = time.time() - t0
            log("ERROR", f"RPA error: {type(e).__name__}: {e}")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "ok": 0,
                "error": f"{type(e).__name__}: {str(e)[:500]}",
                "elapsed_seconds": round(elapsed, 2),
            }).encode("utf-8"))
        finally:
            _running -= 1

    def _run_subprocess(self, cmd, stdin_data):
        """Run treatnote.py synchronously with a timeout."""
        import subprocess

        timeout = 180  # 3 minutes max

        try:
            proc = subprocess.run(
                cmd,
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=SCRIPT_DIR,
            )
            return {
                "returncode": proc.returncode,
                "stdout": proc.stdout or "",
                "stderr": proc.stderr or "",
            }
        except subprocess.TimeoutExpired:
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": f"Timeout after {timeout}s",
            }


def main():
    if not os.path.isfile(TREATNOTE_PY):
        log("ERROR", f"treatnote.py not found at {TREATNOTE_PY}")
        sys.exit(1)

    if not RPA_SECRET:
        log("WARN", "RPA_SECRET not set — server is running WITHOUT authentication!")

    server = HTTPServer(("0.0.0.0", PORT), RPAHandler)
    log("INFO", f"RPA Server listening on 0.0.0.0:{PORT}")
    log("INFO", f"Script: {TREATNOTE_PY}")
    log("INFO", f"Max concurrent: {MAX_CONCURRENT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("INFO", "Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
