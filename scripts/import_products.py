import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TABLE_URL = f"{SUPABASE_URL}/rest/v1/products"

def request(method, url, payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=minimal")
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.status, response.read().decode("utf-8", errors="replace")

def main():
    path = Path("data/product_candidates.json")
    if not path.exists():
        print(f"入力ファイルがありません: {path}")
        sys.exit(1)

    candidates = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(candidates, list):
        raise ValueError("product_candidates.json は商品オブジェクトの配列にしてください。")

    added = skipped = 0
    for item in candidates:
        if not isinstance(item, dict) or not item.get("name") or not item.get("source_url"):
            print("商品名または source_url がないためスキップしました。")
            skipped += 1
            continue

        source_url = item["source_url"].strip()
        query = urllib.parse.urlencode({"select": "id", "source_url": f"eq.{source_url}", "limit": "1"})
        _, existing = request("GET", f"{TABLE_URL}?{query}")
        if json.loads(existing):
            print(f"重複のためスキップ: {item['name']}")
            skipped += 1
            continue

        row = {
            "name": item["name"].strip(),
            "maker": item.get("maker", "キタンクラブ"),
            "price": item.get("price"),
            "category": item.get("category"),
            "release_date": item.get("release_date"),
            "release_month": item.get("release_month"),
            "description": item.get("description"),
            "image_url": item.get("image_url"),
            "image_source": item.get("image_source"),
            "source_url": source_url,
            "source_checked_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
        }
        row = {key: value for key, value in row.items() if value is not None}
        request("POST", TABLE_URL, row)
        print(f"確認待ちに登録: {item['name']}")
        added += 1

    print(f"完了: 登録 {added} 件 / スキップ {skipped} 件")

if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        print(f"Supabase API エラー ({error.code}): {detail}")
        sys.exit(1)
    except Exception as error:
        print(f"エラー: {error}")
        sys.exit(1)
