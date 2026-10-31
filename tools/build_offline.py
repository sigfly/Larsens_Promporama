"""Build a standalone HTML file from the editable source and original media."""
from pathlib import Path
import base64
import mimetypes
import re

ROOT = Path(__file__).resolve().parents[1]

def embed_asset(match):
    path = match.group(0)
    payload = (ROOT / path.removeprefix('../')).read_bytes()
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    return 'data:' + mime + ';base64,' + base64.b64encode(payload).decode('ascii')

def build():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'styles/scene.css').read_text(encoding='utf-8')
    css = re.sub(r'(?:\.\./)?assets/[\w/.-]+', embed_asset, css)
    html = html.replace('<link rel="stylesheet" href="styles/scene.css">', '<style>\n' + css + '\n</style>')
    for name in ('media', 'scene'):
        js = (ROOT / f'scripts/{name}.js').read_text(encoding='utf-8')
        js = re.sub(r'assets/[\w/.-]+', embed_asset, js)
        js = js.replace('</script', '<\\/script')
        html = html.replace(f'<script src="scripts/{name}.js"></script>', '<script>\n' + js + '\n</script>')
    output = ROOT / 'offline.html'
    output.write_text(html, encoding='utf-8')
    print(f'Built {output.name} ({output.stat().st_size:,} bytes)')

if __name__ == '__main__':
    build()
