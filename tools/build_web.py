#!/usr/bin/env python3
"""Gera a versão para a CrazyGames em dist/crazygames/ e o zip dist/vale-ferrado-crazygames.zip.

Diferenças da versão de PC: carrega o SDK da CrazyGames, não tem atualizador nem salvamento em pasta
(o progresso fica no navegador). Uso: python3 tools/build_web.py
"""
import os, re, shutil, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'crazygames')
SDK = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(os.path.join(OUT, 'js'))
shutil.copytree(os.path.join(ROOT, 'lib'), os.path.join(OUT, 'lib'))
shutil.copytree(os.path.join(ROOT, 'js', 'lang'), os.path.join(OUT, 'js', 'lang'))
for f in os.listdir(os.path.join(ROOT, 'js')):
    if f in ('updater.js', 'backup.js', 'web-stubs.js') or os.path.isdir(os.path.join(ROOT, 'js', f)):
        continue
    shutil.copy(os.path.join(ROOT, 'js', f), os.path.join(OUT, 'js', f))
shutil.copy(os.path.join(ROOT, 'js', 'web-stubs.js'), os.path.join(OUT, 'js', 'web-stubs.js'))

html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
html = html.replace('</head>', SDK + '\n</head>', 1)
html = html.replace('<script src="js/updater.js"></script>\n<script src="js/backup.js"></script>', '<script src="js/web-stubs.js"></script>')
assert 'web-stubs.js' in html and 'updater.js' not in html, 'index.html mudou: ajuste o build_web.py'
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)

zpath = os.path.join(ROOT, 'dist', 'vale-ferrado-crazygames.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(OUT):
        for f in files:
            full = os.path.join(base, f)
            z.write(full, os.path.relpath(full, OUT))
size = os.path.getsize(zpath) / 1024 / 1024
print(f'ok: {zpath} ({size:.1f} MB)')
