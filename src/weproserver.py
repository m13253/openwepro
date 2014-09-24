import asyncio
import logging
import aiohttp
import aiohttp.server


class HttpRequestHandler(aiohttp.server.ServerHttpProtocol):
    @asyncio.coroutine
    def handle_request(self, message, payload):
        url = message.path.lstrip('/')
        if not url:
            yield from self.homepage(message, payload)
        elif url == 'file:///openwepro.js':
            yield from self.send_js(message, payload)
        elif not url.startswith('http:') and not url.startswith('https:'):
            yield from self.add_protocol(message, payload, url)
        else:
            yield from self.do_proxy(message, payload, url)

    @asyncio.coroutine
    def homepage(self, message, payload):
        responseHtml = b'<h1>It works!</h1>'
        response = aiohttp.Response(
            self.writer, 200, http_version=message.version
        )
        response.add_header('Content-Type', 'text/html')
        response.add_header('Content-Length', str(len(responseHtml)))
        response.send_headers()
        response.write(responseHtml)
        yield from response.write_eof()

    @asyncio.coroutine
    def send_js(self, message, payload):
        try:
            HttpRequestHandler.clientjs
        except AttributeError:
            with open('weproclient.js', 'rb') as f:
                HttpRequestHandler.clientjs = f.read()
        response = aiohttp.Response(
            self.writer, 200, http_version=message.version
        )
        response.add_header('Content-Type', 'text/javascript')
        response.add_header('Content-Length', str(len(HttpRequestHandler.clientjs)))
        response.send_headers()
        response.write(HttpRequestHandler.clientjs)
        yield from response.write_eof()

    @asyncio.coroutine
    def add_protocol(self, message, payload, url):
        response = aiohttp.Response(
            self.writer, 302, http_version=message.version
        )
        response.add_header('Location', '/http://' + url)
        response.add_header('Content-Length', '0')
        response.send_headers()
        yield from response.write_eof()


    @asyncio.coroutine
    def do_proxy(self, message, payload, url):
        raise NotImplementedError


def start():
    loop = asyncio.get_event_loop()
    loop.run_until_complete(
        loop.create_server(
            lambda: HttpRequestHandler(debug=True, keep_alive=60),
            '127.0.0.1', 8080
        )
    )
