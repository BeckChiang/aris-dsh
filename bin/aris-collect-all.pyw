#!/usr/bin/env python
# ARIS mailbox collect-all - windowless launcher for Task Scheduler.
# pythonw.exe runs this with no console; the node child is spawned with
# CREATE_NO_WINDOW so it does not flash a window either.
# Manual alternative: bin/aris-collect-all.cmd (shows output).
import os, subprocess, sys, time, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOG = os.path.join(ROOT, '.dsh', 'logs', 'aris-collect.log')
DEFAULT_MB = os.path.join(os.environ.get('USERPROFILE', ''), 'aris-mailbox')


def find_node():
    p = shutil.which('node')
    if p:
        return p
    cand = os.path.join(os.environ.get('USERPROFILE', ''), '.dsh', 'dsh-runtimes',
                        'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe')
    if os.path.exists(cand):
        return cand
    cand2 = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'DeepSeek Harness',
                         'resources', 'app.asar.unpacked', 'node.exe')
    return cand2 if os.path.exists(cand2) else None


def log(text):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'a', encoding='utf-8', errors='replace') as f:
        f.write(text)


def main():
    mb = os.environ.get('ARIS_MAILBOX') or DEFAULT_MB
    node = find_node()
    stamp = time.strftime('%Y-%m-%d %H:%M:%S')
    if not node:
        log('[%s] node not found, skip collect\n' % stamp)
        return 2
    log('[%s] collect-all "%s"\n' % (stamp, mb))
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    try:
        r = subprocess.run([node, os.path.join(HERE, 'aris-review.mjs'), '--collect-all', '--mailbox', mb],
                           cwd=ROOT, capture_output=True, text=True, encoding='utf-8',
                           errors='replace', creationflags=flags, timeout=300)
        log(r.stdout or '')
        if r.stderr:
            log(r.stderr)
        log('[%s] exit=%d\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), r.returncode))
        return 0 if r.returncode == 0 else 2
    except Exception as e:
        log('[%s] error: %s\n' % (stamp, e))
        return 2


if __name__ == '__main__':
    sys.exit(main())
