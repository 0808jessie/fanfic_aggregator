from datetime import datetime

from scrapers.pixiv_scraper import PixivScraper


PIXIV_NOVEL_HTML = """
<article data-type="novel">
  <a href="/novel/show.php?id=123456">鬼滅之刃：雪夜短篇</a>
  <a href="/users/9988">測試作者</a>
  <p class="summary">這是一段公開的小說摘要。</p>
  <a href="/tags/鬼滅之刃">鬼滅之刃</a>
  <a href="/tags/義忍">義忍</a>
  <time datetime="2026-08-16T00:00:00+00:00">2026-08-16</time>
</article>
"""


def test_pixiv_adapter_emits_frontend_compatible_contract():
    items = PixivScraper().parse_results(PIXIV_NOVEL_HTML, "鬼滅")

    assert len(items) == 1
    item = items[0]
    payload = item.model_dump()
    assert payload["id"] == "pixiv:https://www.pixiv.net/novel/show.php?id=123456"
    assert payload["title"] == "鬼滅之刃：雪夜短篇"
    assert payload["author"] == "測試作者"
    assert payload["url"] == "https://www.pixiv.net/novel/show.php?id=123456"
    assert payload["summary"] == "這是一段公開的小說摘要。"
    assert payload["platform"] == "pixiv"
    assert payload["source"] == "pixiv"
    assert payload["tags"] == ["鬼滅之刃", "義忍"]
    assert payload["updated_at"] == "2026-08-16T00:00:00+00:00"
    assert isinstance(item.scraped_at, datetime)


def test_pixiv_ajax_payload_maps_real_public_card_fields():
    payload = {
        "error": False,
        "body": {
            "novel": {
                "total": 42,
                "data": [{
                    "id": "28877340",
                    "title": "月明かりの下で",
                    "userName": "DOUKAZAlover23",
                    "description": "公開小說摘要",
                    "tags": [{"tag": "鬼滅の刃"}, {"tag": "冨岡義勇"}],
                    "url": "https://i.pximg.net/c/600x600/novel-cover-master/img/example.jpg",
                    "wordCount": 12345,
                    "updateDate": "2026-08-16T05:05:31+09:00",
                    "language": "ja",
                }],
            },
        },
    }

    items, total = PixivScraper().parse_ajax_results(payload, "鬼滅")

    assert total == 42
    assert len(items) == 1
    item = items[0].model_dump()
    assert item["title"] == "月明かりの下で"
    assert item["author"] == "DOUKAZAlover23"
    assert item["url"] == "https://www.pixiv.net/novel/show.php?id=28877340"
    assert item["tags"] == ["鬼滅の刃", "冨岡義勇"]
    assert item["source"] == "pixiv"
