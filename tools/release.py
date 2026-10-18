#!/usr/bin/env python3
"""Gera uma nova versão do jogo: atualiza GAME_VERSION em js/data.js e o version.json.
Uso: python3 tools/release.py 1.7.0 "Novidade 1" "Novidade 2" ...
"""
import json, os, re, subprocess, sys, datetime
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
ver, notes = sys.argv[1], sys.argv[2:]
p = 'js/data.js'; s = open(p, encoding='utf-8').read()
s = re.sub(r"const GAME_VERSION = '[^']*';", f"const GAME_VERSION = '{ver}';", s)
open(p, 'w', encoding='utf-8').write(s)
# arquivos que o jogo precisa (tudo que está no git, menos ferramentas)
files = subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split()
for extra in ['version.json']:
    if extra not in files: files.append(extra)
files = sorted(f for f in set(files) if not f.startswith('tools/') and not f.startswith('.'))
data = {'version': ver, 'date': datetime.date.today().isoformat(), 'notes': notes,
        'files': [{'path': f, 'size': os.path.getsize(f) if os.path.exists(f) else 0} for f in files]}
open('version.json', 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('versão', ver, '·', len(files), 'arquivos')
