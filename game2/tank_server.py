"""NNY出品 · 浩源 · 浪尖儿社区 — Python compatibility launcher.
Requires Node.js 20+. Run python tank_server.py or node server.js.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

def main():
    node = shutil.which('node')
    if not node:
        print('需要 Node.js 20 或更新版本，请从 https://nodejs.org 安装后重试。')
        return 1
    try:
        return subprocess.call([node, str(Path(__file__).with_name('server.js'))], env=os.environ)
    except KeyboardInterrupt:
        return 0

if __name__ == '__main__':
    sys.exit(main())
