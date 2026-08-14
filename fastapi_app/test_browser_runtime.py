from fastapi_app.scrapers.browser_runtime import BLOCKED_RESOURCE_TYPES, configure_fast_page


class _FakeRequest:
    def __init__(self, resource_type: str):
        self.resource_type = resource_type


class _FakeRoute:
    def __init__(self, resource_type: str):
        self.request = _FakeRequest(resource_type)
        self.aborted = False
        self.continued = False

    def abort(self):
        self.aborted = True

    def continue_(self):
        self.continued = True


class _FakePage:
    def __init__(self):
        self.handler = None

    def route(self, _pattern, handler):
        self.handler = handler


def test_fast_page_interception_blocks_presentation_assets_but_keeps_documents_and_fetches():
    page = _FakePage()
    configure_fast_page(page)

    image_route = _FakeRoute("image")
    document_route = _FakeRoute("document")
    xhr_route = _FakeRoute("xhr")
    page.handler(image_route)
    page.handler(document_route)
    page.handler(xhr_route)

    assert "image" in BLOCKED_RESOURCE_TYPES
    assert image_route.aborted is True
    assert document_route.continued is True
    assert xhr_route.continued is True
