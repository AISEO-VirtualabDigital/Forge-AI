#!/usr/bin/env python3
"""
push_to_github.py
=================
Automated deployment engine for the Forge AI Next.js project.

What it does (in order):
  1. Reads your GitHub Personal Access Token (PAT) from the FORGE_GITHUB_TOKEN
     environment variable (or an inline --token argument).
  2. Calls the GitHub REST API to create a NEW PRIVATE repository named
     "Forge-AI" on your account (POST /user/repos).
     - If the repo already exists (422), logs an informational warning and
       proceeds to push to it (idempotent).
     - Any other API error is logged and the script exits non-zero.
  3. Initializes git locally in the current directory (if not already a
     repo), renames the primary branch to 'main', stages all files (respecting
     .gitignore), commits them as "Initial commit: Forge AI v1.0 Core
     Architecture", links the remote origin, and force-pushes to main.

Requirements:
  - Python 3.8+
  - `requests` library  (pip install requests)
  - `git` on PATH
  - A GitHub PAT with the `repo` scope (classic token) OR with the
    `Contents: Read and write` + `Administration: Read and write` fine-grained
    permissions.

Usage:
  # Option A: environment variable (recommended — never in shell history)
  export FORGE_GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
  python3 push_to_github.py

  # Option B: inline argument (less safe — token may appear in shell history)
  python3 push_to_github.py --token ghp_xxxxxxxxxxxxxxxxxxxx

  # Optional: custom repo name or description
  python3 push_to_github.py --repo-name Forge-AI --description "Forge AI builder"

Exit codes:
  0  → success (repo created or already existed + code pushed)
  1  → fatal error (missing token, git not found, API failure, push rejected)
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from typing import Optional

try:
    import requests
except ImportError:
    sys.stderr.write(
        "ERROR: the 'requests' library is required.\n"
        "Install it with:  pip install requests\n"
    )
    sys.exit(1)


# --------------------------------------------------------------------------- #
# Configuration                                                               #
# --------------------------------------------------------------------------- #

GITHUB_API = "https://api.github.com"
DEFAULT_REPO_NAME = "Forge-AI"
DEFAULT_DESCRIPTION = (
    "Forge AI — a lightweight, AI-powered website builder with drag & drop, "
    "hybrid editing, custom code mode, and a full SEO toolkit. "
    "Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + @dnd-kit + Prisma."
)
COMMIT_MESSAGE = "Initial commit: Forge AI v1.0 Core Architecture"


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def log(msg: str, *, level: str = "INFO") -> None:
    """Single-line structured log to stderr."""
    print(f"[{level}] {msg}", file=sys.stderr, flush=True)


def run_git(args: list[str], *, check: bool = True, capture: bool = True) -> str:
    """
    Run a git command in the current directory.
    Returns stdout (stripped) when capture=True. Raises SystemExit on failure
    unless check=False, in which case it returns the stderr/stdout mix.
    """
    cmd = ["git"] + args
    log(f"$ {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
    )
    if check and result.returncode != 0:
        log(f"git command failed (exit {result.returncode})", level="ERROR")
        if result.stderr:
            sys.stderr.write(result.stderr)
        raise SystemExit(1)
    return (result.stdout or "").strip() if capture else ""


def github_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


# --------------------------------------------------------------------------- #
# Step 1: create the repo via GitHub REST API                                 #
# --------------------------------------------------------------------------- #

def get_authenticated_user(token: str) -> dict:
    """GET /user — verifies the token + fetches the account login."""
    res = requests.get(f"{GITHUB_API}/user", headers=github_headers(token), timeout=15)
    if res.status_code != 200:
        log(f"Token validation failed: HTTP {res.status_code} {res.text[:200]}", level="ERROR")
        raise SystemExit(1)
    return res.json()


def create_repository(
    token: str,
    repo_name: str,
    description: str,
) -> tuple[str, str]:
    """
    Create a new PRIVATE repository via POST /user/repos.
    Returns (clone_url_html, remote_url_https) — the URL to push to.
    If the repo already exists, returns its existing clone URL (idempotent).
    """
    payload = {
        "name": repo_name,
        "description": description,
        "private": True,
        "auto_init": False,   # we'll init git locally and push our own history
        "has_issues": True,
        "has_projects": True,
        "has_wiki": False,
    }
    res = requests.post(
        f"{GITHUB_API}/user/repos",
        headers=github_headers(token),
        json=payload,
        timeout=20,
    )

    if res.status_code == 201:
        data = res.json()
        log(f"Created new private repository: {data['full_name']}")
        return data["html_url"], data["clone_url"]

    if res.status_code == 422:
        # Repo already exists — fetch its clone URL and proceed.
        log(f"Repository '{repo_name}' already exists — proceeding to push.", level="WARN")
        owner = get_authenticated_user(token)["login"]
        # Fetch the existing repo to get its clone_url.
        res2 = requests.get(
            f"{GITHUB_API}/repos/{owner}/{repo_name}",
            headers=github_headers(token),
            timeout=15,
        )
        if res2.status_code == 200:
            data = res2.json()
            return data["html_url"], data["clone_url"]
        log(f"Could not fetch existing repo details: {res2.status_code}", level="ERROR")
        raise SystemExit(1)

    # Any other error.
    log(
        f"GitHub API error creating repo: HTTP {res.status_code} — {res.text[:300]}",
        level="ERROR",
    )
    raise SystemExit(1)


# --------------------------------------------------------------------------- #
# Step 2: local git init + commit + push                                     #
# --------------------------------------------------------------------------- #

def is_git_repo() -> bool:
    return run_git(["rev-parse", "--is-inside-work-tree"], check=False) == "true"


def init_local_repo() -> None:
    """git init + rename primary branch to main."""
    if is_git_repo():
        log("Directory is already a git repository — skipping init.")
        return
    run_git(["init", "-b", "main"])


def stage_and_commit() -> None:
    """Stage everything (respecting .gitignore) and commit."""
    # Ensure git knows the user identity for this commit.
    # (Vercel/sandbox environments sometimes lack global config.)
    run_git(["config", "user.email", "forge-ai@users.noreply.github.com"], check=False)
    run_git(["config", "user.name", "Forge AI Deploy Bot"], check=False)

    run_git(["add", "-A"])
    # Verify there's something to commit.
    status = run_git(["status", "--porcelain"])
    if not status:
        log("Nothing to commit — working tree clean. Skipping commit.")
        return

    run_git(["commit", "-m", COMMIT_MESSAGE, "--allow-empty=false"])


def set_remote_and_push(remote_url: str, token: str) -> None:
    """
    Link the remote origin (replacing any existing one) and force-push main.
    The remote URL embeds the token so the push authenticates without
    prompting for credentials. The token is stripped from the URL we log.
    """
    # Build an authenticated URL: https://<token>@github.com/owner/Forge-AI.git
    # The clone_url from the API looks like: https://github.com/owner/Forge-AI.git
    authed_url = remote_url.replace("https://", f"https://x-access-token:{token}@")

    # Replace any existing origin.
    run_git(["remote", "remove", "origin"], check=False)
    run_git(["remote", "add", "origin", authed_url])

    # Log the safe (un-tokenized) URL for auditability.
    safe_url = remote_url  # without the embedded token
    log(f"Remote origin set to: {safe_url}")

    # Force-push so we overwrite any placeholder content GitHub may have added
    # (e.g. if auto_init had been true). Our local main is the source of truth.
    log("Pushing to origin main (force)…")
    run_git(["push", "-u", "origin", "main", "--force"])

    # Scrub the token from the remote URL in local config so it doesn't
    # persist in .git/config after the push.
    run_git(["remote", "set-url", "origin", safe_url])
    log("Token scrubbed from .git/config remote URL.")


# --------------------------------------------------------------------------- #
# Main                                                                        #
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a private GitHub repo for Forge AI and push the codebase.",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("FORGE_GITHUB_TOKEN"),
        help="GitHub PAT. Defaults to the FORGE_GITHUB_TOKEN env var.",
    )
    parser.add_argument(
        "--repo-name",
        default=DEFAULT_REPO_NAME,
        help=f"Repository name (default: {DEFAULT_REPO_NAME})",
    )
    parser.add_argument(
        "--description",
        default=DEFAULT_DESCRIPTION,
        help="Repository description.",
    )
    args = parser.parse_args()

    token: Optional[str] = args.token
    if not token:
        sys.stderr.write(
            "ERROR: no GitHub token provided.\n"
            "Set the FORGE_GITHUB_TOKEN environment variable or pass --token.\n"
            "Example:\n"
            "  export FORGE_GITHUB_TOKEN='ghp_xxxxxxxx'\n"
            "  python3 push_to_github.py\n"
        )
        sys.exit(1)

    # 0. Sanity-check that git is installed.
    try:
        run_git(["--version"])
    except SystemExit:
        log("git is not installed or not on PATH.", level="ERROR")
        raise

    # 1. Verify the token + fetch the account login.
    user = get_authenticated_user(token)
    log(f"Authenticated as GitHub user: {user['login']}")

    # 2. Create the (private) repository.
    html_url, clone_url = create_repository(token, args.repo_name, args.description)
    log(f"Repository ready: {html_url}")

    # 3. Init git locally (if needed) + commit.
    init_local_repo()
    stage_and_commit()

    # 4. Link remote + force-push to main.
    set_remote_and_push(clone_url, token)

    log("✓ Done. Forge AI v1.0 has been pushed to GitHub.")
    log(f"  Repository: {html_url}")
    log("  Next step: import this repo into Vercel and set DATABASE_URL + any")
    log("  other secrets in the Vercel project settings.")


if __name__ == "__main__":
    main()
