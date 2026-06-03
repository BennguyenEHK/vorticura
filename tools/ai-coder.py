#!/usr/bin/env python3
"""
AI Coder CLI - Ollama backend
Usage:
  # Single-agent edit — file path auto-detected from prompt, result auto-written back
  py tools/ai-coder.py -p "add error handling to lib/data-loader.ts" --agents 1

  # Explicit targets (overrides auto-detection)
  py tools/ai-coder.py -p "add error handling" --targets lib/data-loader.ts --agents 1

  # Multi-file feature — agent outputs === FILE: path === blocks
  py tools/ai-coder.py -p "add a caching layer across lib/cache.ts and lib/db/queries.ts"

  # Multi-agent parallel generation — results arbitrated, saved to tools/output/
  py tools/ai-coder.py -p "redesign the RFQ parser" \
      --targets lib/actions/quotation.ts --agents 4 \
      --model qwen2.5-coder:32b-instruct

  # Dry-run plan — print step-by-step plan, confirm before executing
  py tools/ai-coder.py -p "refactor lib/actions/quotation.ts" --plan

  # Delete files — delete/remove/erase keywords trigger deletion flow
  py tools/ai-coder.py -p "delete lib/old-module.ts and lib/legacy.ts"
  py tools/ai-coder.py -p "remove this file" --targets lib/old-module.ts

  # Skip all confirmation prompts (CI / orchestration)
  py tools/ai-coder.py -p "..." --targets lib/foo.ts --yes

  # Shut down the Ollama server
  py tools/ai-coder.py --close

Behaviour:
  Auto-targets : when --targets is omitted, file paths are extracted from the prompt
                 and validated against disk — only existing files are used.
  Auto-apply   : 1 agent + 1 file target -> result is written back automatically.
  Multi-file   : >1 file targets or no targets -> agent uses === FILE: path === blocks.
  Arbitration  : >1 agents -> a judge call selects the best output before writing.
  Post-validate: after writing .ts/.tsx runs `npx tsc --noEmit`; .py runs py_compile.
  Session log  : every run appended to tools/output/.session.json (last 50 kept).

Prerequisites:
  pip install requests
  ollama serve
  ollama pull deepseek-coder:6.7b-instruct

Environment:
  OLLAMA_HOST  Override Ollama base URL (default: http://localhost:11434)
"""

import os
import re
import sys
import argparse
import json
import time
import shutil
import tempfile
import subprocess
try:
    import requests
except Exception:
    import urllib.request
    import urllib.error

    class _Response:
        def __init__(self, resp, body_bytes):
            self._resp = resp
            self._body = body_bytes

        def raise_for_status(self):
            code = self._resp.getcode()
            if code >= 400:
                raise requests.exceptions.HTTPError(f'Status: {code}')

        def json(self):
            import json as _json
            try:
                return _json.loads(self._body.decode('utf-8'))
            except Exception:
                return {}

        def text(self):
            return self._body.decode('utf-8', errors='replace')

    class _Exceptions:
        class RequestException(Exception):
            pass
        class ConnectionError(RequestException):
            pass
        class Timeout(RequestException):
            pass
        class HTTPError(RequestException):
            pass

    def _req(method, url, json=None, timeout=None, **kwargs):
        data = None
        headers = {'Content-Type': 'application/json'} if json is not None else {}
        if json is not None:
            import json as _json
            data = _json.dumps(json).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                return _Response(resp, body)
        except urllib.error.URLError as e:
            if isinstance(e.reason, TimeoutError):
                raise _Exceptions.Timeout(e)
            raise _Exceptions.ConnectionError(e)
        except Exception as e:
            raise _Exceptions.RequestException(e)

    class _RequestsModule:
        exceptions = _Exceptions

        @staticmethod
        def post(url, json=None, timeout=None, **kwargs):
            return _req('POST', url, json=json, timeout=timeout, **kwargs)

        @staticmethod
        def get(url, timeout=None, **kwargs):
            return _req('GET', url, timeout=timeout, **kwargs)

    requests = _RequestsModule()

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional

# ── Constants ──────────────────────────────────────────────────────────────────
ROLES        = ['Implementer', 'Refactorer', 'Tester', 'Documenter', 'Optimizer']
TEMPERATURES = [0.2, 0.5, 0.7, 0.35, 0.55]

MAX_FILE_CHARS  = 20_000   # per file (raised from 6 000; uses head+tail truncation)
MAX_DIR_FILES   = 30       # max files read when a directory is a target
MAX_TOTAL_CHARS = 80_000   # hard cap across all injected file content

OLLAMA_BASE  = os.environ.get('OLLAMA_HOST', 'http://localhost:11434').rstrip('/')
_REPO_ROOT   = os.path.abspath(os.getcwd())
SESSION_FILE = os.path.join(os.path.dirname(__file__), 'output', '.session.json')

SKIP_DIRS = {
    '.git', 'node_modules', '__pycache__', '.next', 'dist', 'build',
    '.turbo', 'coverage', '.nyc_output', 'out', '.venv', 'venv',
}
SRC_EXTS = {
    '.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.css', '.scss',
    '.md', '.yaml', '.yml', '.toml', '.env.example',
}


# ── CLI ────────────────────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description='AI Coder CLI (Ollama backend)')
    p.add_argument('--prompt', '-p', default=None, help='Coding task description')
    p.add_argument('--close', action='store_true', help='Shut down the background Ollama server and exit')
    p.add_argument('--agents', '-a', type=int, default=1, help='Number of parallel agents (default 1)')
    p.add_argument('--model', '-m', default='deepseek-coder:6.7b-instruct', help='Ollama model tag')
    p.add_argument('--max-tokens', type=int, default=1024, dest='max_tokens')
    p.add_argument('--targets', type=str,
                   help='Comma-separated files/folders (optional — auto-extracted from prompt when omitted)')
    p.add_argument('--query', '-q', action='store_true', default=False,
                   help='Read-only: run model and print output — no file writes')
    p.add_argument('--delete', action='store_true', default=False,
                   help='Delete the resolved target files (requires --targets or paths in prompt)')
    p.add_argument('--plan', action='store_true', default=False,
                   help='Generate and print an execution plan, then confirm before running')
    p.add_argument('--yes', '-y', action='store_true',
                   help='Skip all confirmation prompts (for automation)')
    p.add_argument('--no-save', dest='save', action='store_false',
                   help='Do not write agent outputs to tools/output/')
    p.add_argument('--no-validate', dest='validate', action='store_false',
                   help='Skip post-apply tsc / py_compile validation')
    p.set_defaults(save=True, validate=True)
    return p.parse_args()


# ── Target resolution ──────────────────────────────────────────────────────────
_PATH_RE = re.compile(
    r'(?:^|[\s\'"`(,])(\./|\.\.\/|[a-zA-Z][\w\-]*/)([\w\-./\\]+\.\w{1,8})'
)

def auto_extract_targets(prompt: str) -> List[str]:
    """Extract file-like tokens from prompt; keep only those that exist on disk."""
    candidates: List[str] = []
    for m in _PATH_RE.finditer(prompt):
        candidates.append((m.group(1) + m.group(2)).strip())
    # also catch bare tokens like "lib/foo.ts" without a leading separator
    for token in re.split(r'[\s,`\'"()]+', prompt):
        if re.match(r'^[\w.\-/\\]+\.\w{1,8}$', token) and token not in candidates:
            candidates.append(token)
    existing = [p for p in candidates if os.path.exists(p)]
    return list(dict.fromkeys(existing))  # deduplicate, preserve order


def parse_targets(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    raw = raw.strip()
    if raw.startswith('['):
        try:
            arr = json.loads(raw)
            if isinstance(arr, list):
                return [str(x) for x in arr]
        except Exception:
            pass
    return [t.strip() for t in raw.split(',') if t.strip()]


# ── Path safety ────────────────────────────────────────────────────────────────
def safe_path(path: str) -> Optional[str]:
    """Return absolute path only when it resolves within the repo root."""
    abs_path = os.path.abspath(path)
    if abs_path.startswith(_REPO_ROOT):
        return abs_path
    return None


# ── File reading ───────────────────────────────────────────────────────────────
def read_targets(targets: List[str]) -> str:
    """Read file/directory contents for context injection."""
    if not targets:
        return ''
    chunks: List[str] = []
    total_chars = 0

    for path in targets:
        if total_chars >= MAX_TOTAL_CHARS:
            chunks.append('# [context cap reached — remaining targets omitted]')
            break
        if not os.path.exists(path):
            chunks.append(f'# {path}\n[file not found]')
            continue
        if os.path.isdir(path):
            dir_chunks = _read_dir(path)
            for c in dir_chunks:
                if total_chars >= MAX_TOTAL_CHARS:
                    break
                chunks.append(c)
                total_chars += len(c)
        else:
            c = _read_file(path)
            chunks.append(c)
            total_chars += len(c)

    return '\n\n'.join(chunks)


def _read_dir(root: str) -> List[str]:
    """Recursively read source files under root, skipping build/vendor dirs."""
    collected: List[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fname in sorted(filenames):
            if len(collected) >= MAX_DIR_FILES:
                return collected
            if os.path.splitext(fname)[1].lower() in SRC_EXTS:
                collected.append(_read_file(os.path.join(dirpath, fname)))
    return collected


def _read_file(path: str) -> str:
    """Read a single file; truncate large files keeping head + tail."""
    ext = os.path.splitext(path)[1].lstrip('.')
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        return f'# {path}\n[error reading: {e}]'

    if len(content) <= MAX_FILE_CHARS:
        return f'# {path}\n```{ext}\n{content}\n```'

    half    = MAX_FILE_CHARS // 2
    omitted = len(content) - MAX_FILE_CHARS
    return (
        f'# {path}\n```{ext}\n'
        f'{content[:half]}\n'
        f'... [{omitted} chars omitted — middle of file] ...\n'
        f'{content[-half:]}\n```'
    )


# ── Indent detection ───────────────────────────────────────────────────────────
def detect_indent_style(targets: List[str]) -> str:
    counts: dict = {'tabs': 0, '4': 0, '2': 0}
    for path in targets:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                for line in f:
                    if line.startswith('\t'):
                        counts['tabs'] += 1
                    elif line.startswith('    '):
                        counts['4'] += 1
                    elif line.startswith('  '):
                        counts['2'] += 1
        except Exception:
            continue
    winner = max(counts, key=lambda k: counts[k])
    return 'tabs' if winner == 'tabs' else f'{winner} spaces'


# ── Code extraction ────────────────────────────────────────────────────────────
_FILE_DELIMITER = re.compile(r'={3,}\s*FILE:\s*(.+?)\s*={3,}')


def extract_multi_file(text: str) -> Dict[str, str]:
    """Parse outputs using  === FILE: path ===  section markers."""
    result: Dict[str, str] = {}
    parts = _FILE_DELIMITER.split(text)
    # parts = [preamble, path1, body1, path2, body2, ...]
    it = iter(parts[1:])
    for path, body in zip(it, it):
        blocks = re.findall(r'```(?:\w+)?\n(.*?)```', body, re.DOTALL)
        code = max(blocks, key=len).strip() if blocks else body.strip()
        result[path.strip()] = code
    return result


def extract_code(text: str) -> str:
    """Return the largest fenced code block, or full text when no fences found."""
    blocks = re.findall(r'```(?:\w+)?\n(.*?)```', text, re.DOTALL)
    if blocks:
        return max(blocks, key=len).strip()
    return text.strip()


# ── Atomic file write ──────────────────────────────────────────────────────────
def atomic_write(path: str, content: str) -> bool:
    """Write via temp file + rename to prevent partial writes on crash."""
    abs_path = safe_path(path)
    if abs_path is None:
        print(f'[security] Refusing to write outside repo root: {path}', file=sys.stderr)
        return False
    try:
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(abs_path))
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(content)
            shutil.move(tmp, abs_path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        return True
    except Exception as e:
        print(f'[write] Failed to write {path}: {e}', file=sys.stderr)
        return False


def apply_to_file(path: str, content: str) -> bool:
    lines   = content.splitlines()
    preview = '\n'.join(lines[:25])
    suffix  = f'\n  ... ({len(lines)} total lines)' if len(lines) > 25 else ''
    print(f'\n[apply] Target: {path}')
    print('─' * 60)
    print(preview + suffix)
    print('─' * 60)
    ok = atomic_write(path, content)
    if ok:
        print(f'[apply] Written -> {path}')
    return ok


# ── Post-apply validation ──────────────────────────────────────────────────────
def post_validate(paths: List[str]) -> bool:
    """Run tsc --noEmit for TypeScript files; py_compile for Python files."""
    ts_files = [p for p in paths if os.path.splitext(p)[1] in ('.ts', '.tsx')]
    py_files = [p for p in paths if os.path.splitext(p)[1] == '.py']
    passed   = True

    if ts_files:
        print('[validate] Running npx tsc --noEmit ...')
        r = subprocess.run(
            ['npx', 'tsc', '--noEmit'],
            capture_output=True, text=True,
        )
        if r.returncode == 0:
            print('[validate] tsc passed [OK]')
        else:
            print(f'[validate] tsc errors:\n{(r.stdout + r.stderr).strip()}')
            passed = False

    for pyf in py_files:
        r = subprocess.run(
            [sys.executable, '-m', 'py_compile', pyf],
            capture_output=True, text=True,
        )
        if r.returncode == 0:
            print(f'[validate] {pyf} syntax OK [OK]')
        else:
            print(f'[validate] {pyf} syntax error:\n{r.stderr.strip()}')
            passed = False

    return passed


# ── Session log ────────────────────────────────────────────────────────────────
def log_session(entry: dict):
    try:
        os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
        data: dict = {'runs': []}
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        data['runs'].append(entry)
        data['runs'] = data['runs'][-50:]  # keep last 50 runs
        with open(SESSION_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass  # session log is non-critical; never block the main flow


# ── Prompt construction ────────────────────────────────────────────────────────
ROLE_DESCRIPTIONS = {
    'Implementer': 'Write clean, working implementation code that fulfills the task.',
    'Refactorer':  'Improve code structure, naming clarity, and reduce duplication.',
    'Tester':      'Write comprehensive tests that cover edge cases and failure paths.',
    'Documenter':  'Write clear JSDoc comments, usage examples, and inline explanations.',
    'Optimizer':   'Identify and fix performance bottlenecks; simplify algorithmic complexity.',
}

_MULTI_FILE_RULE = (
    "\n8. For multi-file output use this exact format for each file — no exceptions:\n"
    "   === FILE: relative/path/to/file.ext ===\n"
    "   ```<lang>\n   ...complete file content...\n   ```\n"
    "   No prose between sections. One fenced code block per file."
)


def make_system_prompt(role: str, indent_style: str, multi_file: bool = False) -> str:
    desc = ROLE_DESCRIPTIONS.get(role, 'Assist with code tasks.')
    prompt = (
        f"You are a senior software engineer acting as a {role}. {desc}\n\n"
        "STRICT OUTPUT RULES — violating any of these is an error:\n"
        "1. Return code ONLY. No explanations, no prose, no 'Here is...', no commentary.\n"
        "2. Output the COMPLETE file in exactly ONE fenced code block: ```<lang>\\n...\\n```\n"
        "3. Nothing before the opening fence. Nothing after the closing fence.\n"
        "4. READ the full file content provided. PRESERVE every existing import, function, type, and line.\n"
        "   Only ADD or MODIFY exactly what the task requests — leave everything else byte-for-byte identical.\n"
        "5. Insert new code at the logically correct position (after related functions, after imports, etc.).\n"
        f"6. Use {indent_style} for ALL indentation — never mix styles.\n"
        "7. Default language is TypeScript unless the task specifies otherwise."
    )
    if multi_file:
        prompt += _MULTI_FILE_RULE
    return prompt


def make_user_prompt(task: str, file_context: str, idx: int, total: int, indent_style: str) -> str:
    parts = [f"Task ({idx + 1}/{total}):\n{task}"]
    if file_context:
        parts.append(
            f"\nCurrent file content — READ the entire file before responding, "
            f"then output the COMPLETE updated file with ALL existing code preserved:\n{file_context}"
        )
    parts.append(
        f"\nRespond with ONE fenced code block containing the COMPLETE file. "
        f"Every existing line must be present. New code goes at the correct position. "
        f"Use {indent_style}. Start with ``` immediately — zero text before the fence."
    )
    return '\n'.join(parts)


def make_plan_prompt(task: str, file_context: str) -> str:
    return (
        f"You are a senior software engineer. Produce a concise execution plan for this task:\n\n{task}\n\n"
        + (f"Relevant files:\n{file_context}\n\n" if file_context else '')
        + "Output a numbered list of concrete steps (what file, what change). "
          "Be specific and brief. No code — plan only."
    )


def make_arbitration_prompt(task: str, outputs: List[str]) -> str:
    candidates = '\n\n'.join(
        f'=== CANDIDATE {i + 1} ===\n{o[:3000]}' for i, o in enumerate(outputs)
    )
    return (
        f"Task: {task}\n\n"
        f"You have {len(outputs)} candidate implementations. "
        "Select the BEST one (most correct, cleanest, most complete). "
        "Return ONLY the full code of the winning candidate — no commentary.\n\n"
        + candidates
    )


# ── Ollama ─────────────────────────────────────────────────────────────────────
def call_ollama(model: str, system: str, user: str, max_tokens: int, temperature: float) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": temperature,
            "num_gpu": 99,
        },
    }
    try:
        resp = requests.post(f"{OLLAMA_BASE}/api/chat", json=payload, timeout=300)
        resp.raise_for_status()
        return resp.json().get('message', {}).get('content', '[empty response]')
    except requests.exceptions.ConnectionError:
        return f'[error] Cannot connect to Ollama at {OLLAMA_BASE}. Run: ollama serve'
    except requests.exceptions.Timeout:
        return '[error] Request timed out (>5 min). Try fewer --max-tokens or a smaller model.'
    except Exception as e:
        return f'[error] {e}'


def _ollama_reachable() -> bool:
    # Any HTTP response (including 500) means Ollama is listening.
    # Only a connection error means it is not running.
    try:
        requests.get(f"{OLLAMA_BASE}/api/tags", timeout=3)
        return True
    except Exception:
        return False


def shutdown_ollama():
    if not _ollama_reachable():
        print('[ollama] not running — nothing to stop')
        return
    print('[ollama] stopping...')
    result = subprocess.run(
        ['taskkill', '/F', '/IM', 'ollama.exe'],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        print('[ollama] stopped')
    else:
        print(f'[ollama] taskkill failed: {result.stderr.strip()}')
        print('         You can also close the Ollama console window manually.')


def ensure_ollama_running(model: str):
    # Warn early if OLLAMA_MODELS points to a non-existent path — this causes
    # Ollama to return HTTP 500 on every request even though it is running.
    models_dir = os.environ.get('OLLAMA_MODELS', '')
    if models_dir and not os.path.exists(os.path.splitdrive(models_dir)[0] + os.sep):
        print(f'[warn] OLLAMA_MODELS="{models_dir}" — drive does not exist.')
        print( '       Unset it or point it to a valid path, e.g.:')
        print( '         $env:OLLAMA_MODELS = "D:\\models"   (PowerShell)')
        print( '       Ollama will return HTTP 500 for every request until this is fixed.')

    if _ollama_reachable():
        print('[ollama] already running')
    else:
        print('[ollama] not detected — starting ollama serve in a new window...')
        try:
            subprocess.Popen(
                ['ollama', 'serve'],
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
        except FileNotFoundError:
            print('[error] ollama not found. Install from https://ollama.com/download')
            sys.exit(1)
        for attempt in range(20):
            time.sleep(1)
            if _ollama_reachable():
                print(f'[ollama] ready (took ~{attempt + 1}s)')
                break
        else:
            print('[error] Ollama did not start within 20 s. Check the new console window.')
            sys.exit(1)

    try:
        resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        data = resp.json()
        if 'error' in data:
            print(f'[ollama] server error: {data["error"]}')
            print( '        Requests will fail until the root cause is fixed (see warn above).')
            return
        available = [m['name'] for m in data.get('models', [])]
        base_name = model.split(':')[0]
        if not any(m.startswith(base_name) for m in available):
            print(f"[warn] Model '{model}' not pulled yet.")
            print(f"       Available: {available or '(none)'}")
            print(f"       Run: ollama pull {model}")
    except Exception:
        pass


# ── Output saving ──────────────────────────────────────────────────────────────
def ensure_outdir(path: str):
    os.makedirs(path, exist_ok=True)


def save_output(outdir: str, idx: int, role: str, text: str) -> str:
    ts    = int(time.time() * 1000)
    fname = os.path.join(outdir, f"{ts}_agent_{idx + 1}_{role.lower()}.txt")
    with open(fname, 'w', encoding='utf-8') as f:
        f.write(f"--- Agent {idx + 1} / Role: {role} ---\n")
        f.write(text)
        f.write('\n')
    return fname


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()

    # ── Shut down Ollama ─────────────────────────────────────────────────────
    if args.close:
        shutdown_ollama()
        sys.exit(0)

    if not args.prompt:
        print('[error] --prompt / -p is required (or use --close to stop Ollama)')
        sys.exit(1)

    # ── Resolve targets ──────────────────────────────────────────────────────
    targets = parse_targets(args.targets)
    if not targets:
        targets = auto_extract_targets(args.prompt)
        if targets:
            print(f'[targets] Auto-detected from prompt: {", ".join(targets)}')
        else:
            print('[targets] No file targets found — agent will run without file context')

    # ── Delete flow ──────────────────────────────────────────────────────────
    if args.delete:
        paths_to_delete = [p for p in targets if os.path.isfile(p)]
        if not paths_to_delete:
            print('[delete] No existing files resolved from targets.')
            sys.exit(1)
        print(f'[delete] Files queued for deletion: {", ".join(paths_to_delete)}')
        if not args.yes:
            ans = input('[delete] Permanently delete these files? [y/N] ').strip().lower()
            if ans != 'y':
                print('[delete] Cancelled.')
                sys.exit(0)
        deleted: List[str] = []
        for path in paths_to_delete:
            if safe_path(path) is None:
                print(f'[security] Skipping path outside repo root: {path}')
                continue
            os.remove(path)
            print(f'[delete] Removed -> {path}')
            deleted.append(path)
            parent = os.path.dirname(os.path.abspath(path))
            if os.path.isdir(parent) and not os.listdir(parent):
                os.rmdir(parent)
                print(f'[delete] Removed empty folder -> {parent}')
        log_session({
            'timestamp':     time.strftime('%Y-%m-%dT%H:%M:%S'),
            'action':        'delete',
            'prompt':        args.prompt,
            'files_deleted': deleted,
        })
        sys.exit(0)

    # ── Mode derivation ──────────────────────────────────────────────────────
    agents       = max(1, args.agents)
    file_targets = [t for t in targets if not os.path.isdir(t)]
    _do_apply    = (agents == 1 and len(file_targets) == 1)
    _multi_file  = not _do_apply and (len(file_targets) > 1 or (agents == 1 and not file_targets))

    ensure_ollama_running(args.model)

    file_context = read_targets(targets)
    indent_style = detect_indent_style([t for t in targets if os.path.isfile(t)]) if targets else '2 spaces'

    # ── Plan mode ────────────────────────────────────────────────────────────
    if args.plan:
        print('[plan] Generating execution plan...')
        plan_text = call_ollama(
            args.model,
            'You are a senior software engineer. Output only a concise numbered execution plan.',
            make_plan_prompt(args.prompt, file_context),
            512, 0.1,
        )
        print('\n' + '═' * 60)
        print('EXECUTION PLAN')
        print('═' * 60)
        print(plan_text)
        print('═' * 60 + '\n')
        if not args.yes:
            ans = input('Proceed with execution? [y/N] ').strip().lower()
            if ans != 'y':
                print('[plan] Aborted.')
                sys.exit(0)

    mode_label = (
        'query' if args.query
        else 'auto-apply' if _do_apply
        else 'multi-file' if _multi_file
        else f'{agents} agent(s)'
    )
    print(f'Model : {args.model}  |  mode: {mode_label}  |  max_tokens: {args.max_tokens}  |  indent: {indent_style}')
    if targets:
        print(f'Files : {", ".join(targets)}')

    outdir = os.path.join(os.getcwd(), 'tools', 'output')
    if args.save and not _do_apply:
        ensure_outdir(outdir)

    results: List[Optional[str]] = [None] * agents

    # ── Agent execution ──────────────────────────────────────────────────────
    with ThreadPoolExecutor(max_workers=min(agents, 8)) as executor:
        futures = {}
        for i in range(agents):
            role   = ROLES[i % len(ROLES)]
            temp   = TEMPERATURES[i % len(TEMPERATURES)]
            system = make_system_prompt(role, indent_style, multi_file=_multi_file)
            user   = make_user_prompt(args.prompt, file_context, i, agents, indent_style)
            fut    = executor.submit(call_ollama, args.model, system, user, args.max_tokens, temp)
            futures[fut] = (i, role)

        for fut in as_completed(futures):
            i, role = futures[fut]
            try:
                out = fut.result()
            except Exception as e:
                out = f'Agent {i + 1} failed: {e}'
            results[i] = out

            if _do_apply or _multi_file:
                pass  # write-back handled after the loop
            elif agents == 1:
                print(f'\n{out}\n')
            elif args.save:
                fname = save_output(outdir, i, role, out)
                print(f'  Agent {i + 1} ({role:12s}) -> {fname}')
            else:
                print(f'\n--- Agent {i + 1} ({role}) ---\n{out}\n')

    # ── Arbitration (multi-agent) ────────────────────────────────────────────
    final_output = results[0]
    if agents > 1:
        valid = [r for r in results if r and not r.startswith('[error]')]
        if len(valid) > 1:
            print(f'[arbitrate] Selecting best output from {len(valid)} candidates...')
            final_output = call_ollama(
                args.model,
                'You are a code reviewer. Return ONLY the best complete code implementation — no commentary.',
                make_arbitration_prompt(args.prompt, valid),
                args.max_tokens, 0.1,
            )
            print('[arbitrate] Best candidate selected.')

    # ── Write-back ───────────────────────────────────────────────────────────
    written_files: List[str] = []

    if args.query:
        print(f'\n{final_output}\n')

    elif _do_apply and final_output:
        code = extract_code(final_output)
        if apply_to_file(targets[0], code):
            written_files.append(targets[0])

    elif _multi_file and final_output:
        file_map = extract_multi_file(final_output)
        if file_map:
            for fpath, code in file_map.items():
                if apply_to_file(fpath, code):
                    written_files.append(fpath)
        elif file_targets:
            # fallback: treat as single-file output for the first target
            code = extract_code(final_output)
            if apply_to_file(file_targets[0], code):
                written_files.append(file_targets[0])
        else:
            print(f'\n{final_output}\n')

    # ── Save multi-agent outputs ─────────────────────────────────────────────
    if args.save and agents > 1:
        merged = os.path.join(outdir, f"{int(time.time() * 1000)}_merged.txt")
        try:
            with open(merged, 'w', encoding='utf-8') as mf:
                for i, r in enumerate(results):
                    role = ROLES[i % len(ROLES)]
                    mf.write(f"--- Agent {i + 1} / {role} ---\n")
                    mf.write(r or '')
                    mf.write('\n\n')
                if final_output and final_output != results[0]:
                    mf.write("--- ARBITRATED BEST ---\n")
                    mf.write(final_output)
            print(f'\nMerged output: {merged}')
        except Exception as e:
            print(f'Failed to write merged file: {e}', file=sys.stderr)

    # ── Post-apply validation ────────────────────────────────────────────────
    if written_files and args.validate:
        post_validate(written_files)

    # ── Session log ──────────────────────────────────────────────────────────
    log_session({
        'timestamp':     time.strftime('%Y-%m-%dT%H:%M:%S'),
        'action':        'query' if args.query else 'edit',
        'prompt':        args.prompt,
        'targets':       targets,
        'model':         args.model,
        'agents':        agents,
        'mode':          mode_label,
        'files_written': written_files,
    })


if __name__ == '__main__':
    main()
