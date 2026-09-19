from pathlib import Path
import re

p = Path('index.html')
html = p.read_text(encoding='utf-8')
css = re.search(r'<style>([\s\S]*?)</style>', html).group(1)
js = re.search(r'<script>([\s\S]*?)</script>', html).group(1)
Path('styles.css').write_text(css, encoding='utf-8')
Path('game.js').write_text(js, encoding='utf-8')
html = re.sub(r'<style>[\s\S]*?</style>', '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="flight-deck.css">', html)
html = re.sub(r'<script>[\s\S]*?</script>', '<script src="systems.js"></script>\n<script src="game.js"></script>', html)
p.write_text(html, encoding='utf-8')
