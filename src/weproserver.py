import asyncio
import logging
import urllib.parse
import urllib.request
import aiohttp
import aiohttp.client
import aiohttp.connector
import aiohttp.multidict
import aiohttp.server


class HttpRequestHandler(aiohttp.server.ServerHttpProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        http_proxy = urllib.request.getproxies().get('http')
        if http_proxy:
            self.upstream_connector = aiohttp.connector.ProxyConnector(proxy=http_proxy)
        else:
            self.upstream_connector = aiohttp.connector.TCPConnector()

    @asyncio.coroutine
    def handle_request(self, message, payload):
        url = message.path.lstrip('/')
        if not url:
            return (yield from self.homepage(message, payload))
        else:
            urlsplit = urllib.parse.urlsplit(url)
            if not urlsplit.scheme:
                return (yield from self.add_protocol(message, payload, url))
            elif urlsplit.scheme == 'file':
                if url == 'file:/openwepro.js':
                    return (yield from self.send_js(message, payload))
            elif urlsplit.scheme == 'http' or urlsplit.scheme == 'https':
                return (yield from self.do_proxy(message, payload, url))
        return (yield from self.send_404(message, payload, url))

    @asyncio.coroutine
    def homepage(self, message, payload):
        responseHtml = b'<h1>It works!</h1>'
        response = aiohttp.Response(
            self.writer, 200, http_version=message.version
        )
        response.add_header('Content-Type', 'text/html; charset=utf-8')
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
        response.add_header('Content-Type', 'text/javascript; charset=utf-8')
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
        request_headers = [(k, v) for k, v in message.headers.items() if k.upper() not in {'ACCEPT-ENCODING', 'HOST', 'X-FORWARDED-FOR'}]
        if 'X-Forwarded-For' in message.headers:
            x_forwarded_for = list(map(str.strip, message.headers.get('X-Forwarded-For', '').split(',')))
        else:
            x_forwarded_for = list()
        if 'X-Real-IP' in message.headers:
            x_forwarded_for.append(message.headers.get('X-Real-IP'))
        else:
            x_forwarded_for.append(str(self.writer.get_extra_info('peername')[0]))
        request_headers.append(('X-Forwarded-For', ', '.join(x_forwarded_for)))
        request = yield from aiohttp.client.request(message.method, url, data=(yield from payload.read()), headers=request_headers, version=message.version, connector=self.upstream_connector)

        response = aiohttp.Response(
            self.writer, request.status, http_version=request.version
        )
        response.SERVER_SOFTWARE = request.headers.get('Server', response.SERVER_SOFTWARE)
        response.add_headers(*[(k, v) for k, v in request.headers.items() if k.upper() not in {'CONTENT-ENCODING', 'P3P', 'STRICT-TRANSPORT-SECURITY'}])
        response.send_headers()
        if request.headers.get('Content-Type', '').split(';', 1)[0] == 'text/html':
            response.write(b'<script language="javascript" src="/file:///openwepro.js"></script><!-- OpenWepro -->\r\n')
        while True:
            data = yield from request.content.read(1024)
            if not data:
                break
            response.write(data)
        yield from response.write_eof()

    @asyncio.coroutine
    def send_404(self, message, payload, url):
        responseHtml = b'<h1>Error 404: Not Found</h1>'
        response = aiohttp.Response(
            self.writer, 404, http_version=message.version
        )
        response.add_header('Content-Type', 'text/html; charset=utf-8')
        response.add_header('Content-Length', str(len(responseHtml)))
        response.send_headers()
        response.write(responseHtml)
        yield from response.write_eof()


def start():
    loop = asyncio.get_event_loop()
    loop.run_until_complete(
        loop.create_server(
            lambda: HttpRequestHandler(debug=True, keep_alive=60),
            '127.0.0.1', 8080
        )
    )
