import asyncio
import base64
import configparser
import logging
import re
import time
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
        if self.auth_passwd:
            auth_secret = message.headers.get('AUTHORIZATION')
            if not auth_secret or auth_secret[:6].upper() != 'BASIC ' or auth_secret[6:] not in self.auth_passwd:
                response = aiohttp.Response(self.writer, 401, http_version=message.version)
                response.SERVER_SOFTWARE = 'HTTPd'
                response.add_header('WWW-Authenticate', 'Basic realm="%s"' % self.auth_realm)
                response.add_header('Content-Length', '0')
                response.send_headers()
                yield from response.write_eof()
                return
        url = message.path.lstrip('/')
        if url.startswith(self.path_prefix):
            url = url[len(self.path_prefix):]
        else:
            return (yield from self.send_404(message, payload, url))
        print((url, self.path_prefix))
        if not url or url == '/':
            return (yield from self.send_homepage(message, payload))
        elif url == '/about/openwepro.js':
            return (yield from self.send_js(message, payload))
        url_matcher = re.compile('/(.*?)/(.*?)/:(?:/(.*))?$')
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
        response = aiohttp.Response(self.writer, 200, http_version=message.version)
        response.add_header('Content-Type', 'text/html; charset=utf-8')
        response.add_header('Content-Length', str(len(self.clienthtml)))
        response.send_headers()
        response.write(self.clienthtml)
        yield from response.write_eof()

    @asyncio.coroutine
    def send_js(self, message, payload):
        response = aiohttp.Response(self.writer, 200, http_version=message.version)
        response.add_header('Content-Type', 'text/javascript; charset=utf-8')
        response.add_header('Content-Length', str(len(self.clientjs)))
        response.send_headers()
        response.write(self.clientjs)
        yield from response.write_eof()

    @asyncio.coroutine
    def do_http_proxy(self, message, payload, url):
        self.log_proxy.info(url)
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

        response = aiohttp.Response(self.writer, request.status, http_version=request.version)
        response.SERVER_SOFTWARE = request.headers.get('Server', response.SERVER_SOFTWARE)
        response.add_headers(*[(k, v) for k, v in request.headers.items() if k.upper() not in {'CONTENT-ENCODING', 'CONTENT-SECURITY-POLICY', 'CONTENT-SECURITY-POLICY-REPORT-ONLY', 'CONTENT-LENGTH', 'LOCATION', 'P3P', 'SET-COOKIE', 'STRICT-TRANSPORT-SECURITY', 'TRANSFER-ENCODING', 'X-WEBKIT-CSP', 'X-CONTENT-SECURITY-POLICY'}])
        if 'Content-Encoding' not in request.headers and 'Content-Length' in request.headers and content_type not in {'text/html', 'text/css'}:
            response.add_header('Content-Length', request.headers['Content-Length'])
        response.add_header('Content-Security-Policy', "default-src data: 'self' 'unsafe-inline' 'unsafe-eval'")
        response.send_headers()
        if content_type == 'text/css':
            while True:
                data = yield from request.content.read(1024)
                if not data:
                    break
                print(data)
                response.write(data)
        else:
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
        response = aiohttp.Response(self.writer, 404, http_version=message.version)
        response.add_header('Content-Type', 'text/html; charset=utf-8')
        response.add_header('Content-Length', str(len(responseHtml)))
        response.send_headers()
        response.write(responseHtml)
        yield from response.write_eof()


def start():
    HttpRequestHandler.config = configparser.ConfigParser()
    HttpRequestHandler.config.read('../config.ini')
    HttpRequestHandler.path_prefix = HttpRequestHandler.config.get('basic', 'path_prefix', fallback='').strip('/')
    HttpRequestHandler.auth_realm = HttpRequestHandler.config.get('basic', 'auth_realm', fallback='OpenWepro').replace('"', "'")
    HttpRequestHandler.auth_passwd = set()
    if 'password' in HttpRequestHandler.config:
        for username, password in HttpRequestHandler.config['password'].items():
            HttpRequestHandler.auth_passwd.add(base64.b64encode(('%s:%s' % (username, password)).encode('utf-8', 'replace')).decode('iso-8859-1'))

    log_handler = logging.StreamHandler()
    log_handler.setFormatter(logging.Formatter('%(asctime)s: %(message)s'))
    log_handler.setLevel(logging.INFO)
    HttpRequestHandler.log_proxy = logging.getLogger('openwepro.proxy')
    HttpRequestHandler.log_proxy.setLevel(logging.INFO)
    HttpRequestHandler.log_proxy.addHandler(log_handler)

    http_proxy = urllib.request.getproxies().get('http')
    if http_proxy:
        HttpRequestHandler.upstream_connector = aiohttp.connector.ProxyConnector(proxy=http_proxy)
    else:
        HttpRequestHandler.upstream_connector = aiohttp.connector.TCPConnector()
    with open('weproclient.html', 'rb') as f:
        HttpRequestHandler.clienthtml = f.read().replace(b'@path_prefix@', HttpRequestHandler.path_prefix.encode('utf-8', 'replace'))
    with open('weproclient.js', 'rb') as f:
        HttpRequestHandler.clientjs = f.read().replace(b'@path_prefix@', HttpRequestHandler.path_prefix.encode('utf-8', 'replace'))

    loop = asyncio.get_event_loop()
    loop.run_until_complete(
        loop.create_server(
            lambda: HttpRequestHandler(debug=True, keep_alive=60),
            HttpRequestHandler.config.get('basic', 'listen_address', fallback='127.0.0.1'),
            HttpRequestHandler.config.getint('basic', 'listen_port', fallback=8080),
        )
    )
