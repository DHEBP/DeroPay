#!/usr/bin/env python3
"""DeroPay wallet entrypoint.

First run: auto-create a merchant wallet, write its 25-word recovery seed to
a mounted backup file, then serve the wallet RPC. Subsequent runs just open
the existing wallet and serve.

dero-wallet-cli reads its create-time prompts (password, seed language, menu)
from the controlling terminal, not stdin, so piping input does nothing. We
drive it under a real PTY and respond to each prompt as it appears.

Security: an auto-created wallet is protected by (a) binding this RPC to the
internal Docker network only and (b) --rpc-login. Set WALLET_PASSWORD to also
encrypt the wallet file at rest (honored here, unlike a bare --password flag).
"""
import os
import pty
import re
import select
import sys
import time

WALLET_FILE = os.environ.get("WALLET_FILE", "/wallet/merchant.db")
WALLET_PASSWORD = os.environ.get("WALLET_PASSWORD", "")
DAEMON_ADDRESS = os.environ.get("DAEMON_ADDRESS", "daemon:10102")
RPC_BIND = os.environ.get("RPC_BIND", "0.0.0.0:10103")
WALLET_RPC_LOGIN = os.environ.get("WALLET_RPC_LOGIN", "")
SEED_FILE = os.path.join(os.path.dirname(WALLET_FILE) or ".", "SEED-BACKUP.txt")
WALLET_CLI = "./dero-wallet-cli"


def create_wallet():
    """Generate a new wallet under a PTY and return its 25-word seed."""
    steps = [
        (re.compile(r"Enter password"), WALLET_PASSWORD + "\n"),
        (re.compile(r"Confirm password"), WALLET_PASSWORD + "\n"),
        (re.compile(r"Language list"), "0\n"),   # English
        (re.compile(r"enter a choice"), "0\n"),  # menu: 0 = Exit Wallet (saves)
    ]
    cmd = [WALLET_CLI, "--generate-new-wallet",
           "--wallet-file=" + WALLET_FILE,
           "--password=" + WALLET_PASSWORD, "--offline"]

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(cmd[0], cmd)

    buf, captured, i = "", "", 0
    deadline = time.time() + 60
    while time.time() < deadline:
        r, _, _ = select.select([fd], [], [], 5)
        if not r:
            if i >= len(steps):
                break
            continue
        try:
            data = os.read(fd, 4096)
        except OSError:
            break
        if not data:
            break
        chunk = data.decode("utf-8", "ignore")
        captured += chunk
        buf += chunk
        while i < len(steps) and steps[i][0].search(buf):
            os.write(fd, steps[i][1].encode())
            buf = ""
            i += 1
            time.sleep(0.3)
    try:
        os.waitpid(pid, 0)
    except OSError:
        pass

    clean = re.sub(r"\x1b\[[0-9;]*m", "", captured).replace("\r", "")
    m = re.search(r"25 words.*?\n(.+)", clean, re.S)
    seed = m.group(1).strip().splitlines()[0].strip() if m else ""
    return seed


def write_seed(seed):
    old = os.umask(0o077)
    try:
        with open(SEED_FILE, "w") as f:
            f.write(
                "DeroPay merchant wallet - RECOVERY SEED\n"
                "=======================================\n\n"
                + seed + "\n\n"
                "!! BACK THIS UP NOW, OFFLINE, THEN DELETE THIS FILE. !!\n"
                "These 25 words ARE your money. Anyone with them controls the\n"
                "wallet. Losing them means losing every payment ever received.\n"
            )
    finally:
        os.umask(old)


def main():
    if not os.path.exists(WALLET_FILE):
        print("=" * 58, flush=True)
        print(" No wallet found at %s - creating one..." % WALLET_FILE, flush=True)
        print("=" * 58, flush=True)
        seed = create_wallet()
        if not seed or not os.path.exists(WALLET_FILE):
            sys.stderr.write(
                "FATAL: wallet creation failed or the recovery seed could not "
                "be captured. Refusing to start with an unbacked-up wallet.\n")
            sys.exit(1)
        write_seed(seed)
        print("\n  RECOVERY SEED (also written to %s):\n" % SEED_FILE, flush=True)
        print("    " + seed + "\n", flush=True)
        print("  >> BACK THIS UP OFFLINE NOW. It will not be shown again. <<\n",
              flush=True)

    argv = [WALLET_CLI,
            "--wallet-file=" + WALLET_FILE,
            "--password=" + WALLET_PASSWORD,
            "--rpc-server",
            "--rpc-bind=" + RPC_BIND,
            "--daemon-address=" + DAEMON_ADDRESS]
    if WALLET_RPC_LOGIN:
        argv.append("--rpc-login=" + WALLET_RPC_LOGIN)
    print("Starting wallet RPC on %s (daemon: %s)..." % (RPC_BIND, DAEMON_ADDRESS),
          flush=True)
    os.execvp(argv[0], argv)


if __name__ == "__main__":
    main()
