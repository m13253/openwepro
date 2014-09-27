import asyncio
import logging
import re
import urllib.parse
import urllib.request
import aiohttp
import aiohttp.client
import aiohttp.connector
import aiohttp.multidict
import aiohttp.server


class HttpRequestHandler(aiohttp.server.ServerHttpProtocol):
    @asyncio.coroutine
    def handle_request(self, message, payload):
        url = message.path.lstrip('/')
        if not url:
            return (yield from self.send_homepage(message, payload))
        elif url == 'about/openwepro.js':
            return (yield from self.send_js(message, payload))
        url_matcher = re.compile('(.*?)/(.*?)/:(?:/(.*))?$')
        url_parsed = url_matcher.match(url)
        if not url_parsed:
            return (yield from self.send_404(message, payload, url))
        url_parsed = url_parsed.groups()
        if url_parsed[0] in {'http', 'https'}:
            target_url = '%s://%s/%s' % (url_parsed[0], '.'.join(reversed(url_parsed[1].split('/'))), url_parsed[2] or '')
            return (yield from self.do_http_proxy(message, payload, target_url))
        return (yield from self.send_404(message, payload, url))

    @asyncio.coroutine
    def send_homepage(self, message, payload):
        response = aiohttp.Response(
            self.writer, 200, http_version=message.version
        )
        response.add_header('Content-Type', 'text/html; charset=utf-8')
        response.add_header('Content-Length', str(len(self.clienthtml)))
        response.send_headers()
        response.write(self.clienthtml)
        yield from response.write_eof()

    @asyncio.coroutine
    def send_js(self, message, payload):
        response = aiohttp.Response(
            self.writer, 200, http_version=message.version
        )
        response.add_header('Content-Type', 'text/javascript; charset=utf-8')
        response.add_header('Content-Length', str(len(self.clientjs)))
        response.send_headers()
        response.write(self.clientjs)
        yield from response.write_eof()

    @asyncio.coroutine
    def do_http_proxy(self, message, payload, url):
        request_headers = [(k, v) for k, v in message.headers.items() if k.upper() not in {'ACCEPT-ENCODING', 'HOST', 'REFERER', 'X-FORWARDED-FOR', 'X-REAL-IP'}]
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
        content_type = request.headers.get('Content-Type', '').split(';', 1)[0]

        response = aiohttp.Response(
            self.writer, request.status, http_version=request.version
        )
        response.SERVER_SOFTWARE = request.headers.get('Server', response.SERVER_SOFTWARE)
        response.add_headers(*[(k, v) for k, v in request.headers.items() if k.upper() not in {'CONTENT-ENCODING', 'CONTENT-SECURITY-POLICY', 'CONTENT-LENGTH', 'LOCATION', 'P3P', 'SET-COOKIE', 'STRICT-TRANSPORT-SECURITY', 'TRANSFER-ENCODING', 'X-WEBKIT-CSP', 'X-CONTENT-SECURITY-POLICY'}])
        if 'Content-Encoding' not in request.headers and 'Content-Length' in request.headers and content_type not in {'text/html', 'text/css'}:
            response.add_header('Content-Length', request.headers['Content-Length'])
        response.add_header('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval'")
        response.send_headers()
        if content_type == 'text/html':
            response.write(b'<script language="javascript" src="/about/openwepro.js"></script><!-- OpenWepro -->\r\n')

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
    http_proxy = urllib.request.getproxies().get('http')
    if http_proxy:
        HttpRequestHandler.upstream_connector = aiohttp.connector.ProxyConnector(proxy=http_proxy)
    else:
        HttpRequestHandler.upstream_connector = aiohttp.connector.TCPConnector()
    with open('weproclient.html', 'rb') as f:
        HttpRequestHandler.clienthtml = f.read()
    with open('weproclient.js', 'rb') as f:
        HttpRequestHandler.clientjs = f.read()

    loop = asyncio.get_event_loop()
    loop.run_until_complete(
        loop.create_server(
            lambda: HttpRequestHandler(debug=True, keep_alive=60),
            '127.0.0.1', 8080
        )
    )
