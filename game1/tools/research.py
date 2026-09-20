import concurrent.futures
import json
import re
import urllib.request
from pathlib import Path

def fetch(appid):
    def get(url):
        with urllib.request.urlopen(url, timeout=25) as response:
            return json.load(response)
    data = get('https://store.steampowered.com/api/appdetails?appids=' + appid)[appid]['data']
    reviews = get('https://store.steampowered.com/appreviews/' + appid + '?json=1&language=all&purchase_type=all&num_per_page=0')['query_summary']
    return {'id': appid, 'name': data['name'], 'reviews': reviews, 'description': re.sub('<[^>]+>', ' ', data['detailed_description'])}

if __name__ == '__main__':
    results = list(concurrent.futures.ThreadPoolExecutor().map(fetch, ['667600', '1634860', '858210']))
    output = json.dumps(results, ensure_ascii=False, indent=2)
    Path('docs').mkdir(exist_ok=True)
    Path('docs/research-snapshot.json').write_text(output, encoding='utf-8')
    print(output)
