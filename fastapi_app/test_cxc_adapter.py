from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from scrapers.cxc_scraper import CxCScraper, _PublicSearchUnavailable
from scrapers.index import SCRAPERS, translated_query_for_platform


RENDERED_CXC_RESULTS = """
  <article class="work-card">
    <a href="/@mori/work/giyushino-summer">
      <img src="/media/giyushino-cover.webp" alt="義忍：夏夜短篇" />
      <h3 class="work-title">義忍：夏夜短篇</h3>
    </a>
    <span class="creator">森野</span>
    <span class="tag">小說</span><span class="tag">鬼滅之刃</span>
  </article>
"""


def test_cxc_adapter_parses_verified_public_work_cards():
    scraper = CxCScraper()
    with patch.object(scraper, "_render_public_search_html", return_value=RENDERED_CXC_RESULTS) as render:
        payload = scraper.scrape("義忍")

    assert render.call_args.args == ("義忍 富岡義勇 胡蝶忍",)
    assert "keyword=%E7%BE%A9%E5%BF%8D" in scraper.build_search_url("義忍")
    assert payload["total_works"] == 1
    item = payload["items"][0]
    assert item.platform == "CxC 創利市集"
    assert item.title == "義忍：夏夜短篇"
    assert item.author == "森野"
    assert item.url == "https://cxc.today/@mori/work/giyushino-summer"
    assert item.coverUrl == "https://cxc.today/media/giyushino-cover.webp"
    assert item.tags == "小說, 鬼滅之刃"


def test_cxc_adapter_isolates_unfinished_public_search_without_inventing_results():
    scraper = CxCScraper()
    with patch.object(
        scraper,
        "_render_public_search_html",
        side_effect=_PublicSearchUnavailable("Public search did not finish rendering; skipping cleanly"),
    ):
        payload = scraper.scrape("義忍")

    assert payload["items"] == []
    assert payload["total_works"] == 0
    assert "did not finish rendering" in (scraper.last_warning or "")


def test_cxc_platform_is_registered_and_constrained_to_trusted_work_urls():
    assert "cxc" in SCRAPERS
    assert main.canonical_platforms(["cxc"]) == ["cxc"]
    assert translated_query_for_platform("cxc", "義忍") == "義忍 富岡義勇 胡蝶忍"
    assert CxCScraper.is_real_work_url("https://cxc.today/@mori/work/giyushino-summer")
    assert not CxCScraper.is_real_work_url("https://cxc.today/zh/search?keyword=%E7%BE%A9%E5%BF%8D")
    assert main.is_real_platform_url("https://cxc.today/@mori/work/giyushino-summer", "CxC 創利市集")
    assert not main.is_real_platform_url("https://example.com/@mori/work/giyushino-summer", "CxC 創利市集")
