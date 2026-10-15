"""Assembles index.html from src/app.html, the two engine files and data/data.json."""
import json, pathlib, datetime
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / 'data/data.json').read_text())
t = (root / 'src/app.html').read_text()
t = t.replace('<script>/*DATA*/</script>', '<script>window.LEAGUE_DATA=' + json.dumps(d, separators=(',', ':')).replace('</', '<\\/') + ';</script>')
t = t.replace('<script>/*ENGINE*/</script>', '<script>' + (root / 'src/engine.js').read_text() + '</script>')
t = t.replace('<script>/*ENGINE2*/</script>', '<script>' + (root / 'src/engine2.js').read_text() + '</script>')
(root / 'index.html').write_text(t)
print('wrote index.html', len(t) // 1024, 'KB')
