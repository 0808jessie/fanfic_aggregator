from __future__ import annotations
from scrapers.penana_scraper import PenanaScraper


def test_penana_static_cloudflare_asset_reference_is_not_a_challenge():
    html = '<script src="https://cdnjs.cloudflare.com/ajax/libs/app.js"></script><div class="newXbox p0 storydata"></div>'

    assert PenanaScraper._is_verification_page(html) is False


def test_penana_challenge_platform_is_still_reported_as_blocked():
    html = '<div id="cf-chl-widget"><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></div>'

    assert PenanaScraper._is_verification_page(html) is True
    assert PenanaScraper._is_blocked_challenge_html(html) is True


def test_penana_document_with_story_cards_is_not_blocked_even_if_it_has_a_challenge_marker():
    html = '''
      <script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>
      <div class="newXbox p0 storydata"><div class="hiddenInfo"><a class="newBookTitle" href="/story/123">公開作品</a></div></div>
    '''

    assert PenanaScraper._is_blocked_challenge_html(html) is False
