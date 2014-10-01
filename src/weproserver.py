# This file is part of OpenWepro project, and is released under GPL 3 license.
# You can obtain full source code along with license text at https://github.com/m13253/openwepro

import asyncio
import base64
import configparser
import logging
import re
import time
import urllib.parse
import urllib.request
import uuid
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
        url = message.path
        if url.startswith(self.path_prefix):
            url = url[len(self.path_prefix):]
        else:
            return (yield from self.send_404(message, payload, url))
        if not url or url == '/':
            return (yield from self.send_homepage(message, payload))
        elif url == '/about/empty.js':
            return (yield from self.send_empty_js(message, payload))
        elif url.startswith('/about/openwepro.js?'):
            return (yield from self.send_js(message, payload))
        target_url = self.parse_url(url, False)
        if target_url is None:
            return (yield from self.send_404(message, payload, url))
        else:
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
        response.add_header('Cache-Control', 'max-age=600')
        response.add_header('Content-Type', 'text/javascript; charset=utf-8')
        response.add_header('Content-Length', str(len(self.clientjs)))
        response.send_headers()
        response.write(self.clientjs)
        yield from response.write_eof()

    @asyncio.coroutine
    def send_empty_js(self, message, payload):
        response = aiohttp.Response(self.writer, 200, http_version=message.version)
        response.add_header('Cache-Control', 'max-age=604800')
        response.add_header('Content-Type', 'text/javascript; charset=utf-8')
        response.add_header('Content-Length', '6')
        response.send_headers()
        response.write(b'void 0')
        yield from response.write_eof()

    @asyncio.coroutine
    @asyncio.coroutine
    def do_http_proxy(self, message, payload, url):
        self.log_proxy.info(url)
        request_headers = [(k, v) for k, v in message.headers.items() if k.upper() not in {'ACCEPT-ENCODING', 'AUTHORIZATION', 'HOST', 'ORIGIN', 'REFERER', 'X-FORWARDED-FOR', 'X-REAL-IP'}]
        if 'Referer' in message.headers:
            request_headers.append(('Referer', self.parse_url(message.headers.get('Referer'))))
        if 'X-Forwarded-For' in message.headers:
            x_forwarded_for = list(map(str.strip, message.headers.get('X-Forwarded-For', '').split(',')))
        else:
            x_forwarded_for = list()
        if 'X-Real-IP' in message.headers:
            x_forwarded_for.append(message.headers.get('X-Real-IP'))
        else:
            x_forwarded_for.append(str(self.writer.get_extra_info('peername')[0]))
        request_headers.append(('X-Forwarded-For', ', '.join(x_forwarded_for)))
        request_headers.append(('Via', 'OpenWepro (like Glype, +https://github.com/m13253/openwepro)'))
        request = yield from aiohttp.client.request(message.method, url, data=(yield from payload.read()), headers=request_headers, allow_redirects=False, version=message.version, connector=self.upstream_connector)
        content_type = request.headers.get('Content-Type', '').split(';', 1)[0]

        response = aiohttp.Response(self.writer, request.status, http_version=request.version)
        response.SERVER_SOFTWARE = request.headers.get('Server', response.SERVER_SOFTWARE)
        response.add_headers(*[(k, v) for k, v in request.headers.items() if k.upper() not in {'ACCESS-CONTROL-ALLOW-ORIGIN', 'CONTENT-ENCODING', 'CONTENT-SECURITY-POLICY', 'CONTENT-SECURITY-POLICY-REPORT-ONLY', 'CONTENT-LENGTH', 'LOCATION', 'P3P', 'SET-COOKIE', 'STRICT-TRANSPORT-SECURITY', 'TRANSFER-ENCODING', 'X-WEBKIT-CSP', 'X-CONTENT-SECURITY-POLICY'}])
        if 'Location' in request.headers:
            response.add_header('Location', self.convert_url(request.headers['Location'], url))
        if 'Content-Encoding' not in request.headers and 'Content-Length' in request.headers and content_type not in {'text/html', 'text/css'}:
            response.add_header('Content-Length', request.headers['Content-Length'])
        response.add_header('Content-Security-Policy', "default-src data: 'self' 'unsafe-inline' 'unsafe-eval'")
        for cookie_item in request.headers.getall('Set-Cookie', ()):
            for cookie_converted in self.convert_cookie(cookie_item, url):
                response.add_header('Set-Cookie', cookie_converted)
        response.send_headers()
        if content_type == 'text/css':
            css_conv_matcher = re.compile('(.*?[\\s:,])url\\s*\\(\\s*(["\']?)(.*?)\\2\\s*\\)(.*)$', re.IGNORECASE | re.DOTALL)
            css_conv_left = ''
            while True:
                data = yield from request.content.read(1024)
                if not data:
                    if css_conv_left:
                        response.write(css_conv_left.encode('iso-8859-1'))
                    break
                css_conv_left += data.decode('iso-8859-1')
                while True:
                    css_conv_match = css_conv_matcher.match(css_conv_left)
                    if not css_conv_match:
                        break
                    css_conv_match = css_conv_match.groups()
                    response.write(('%surl(%s%s%s)' % (css_conv_match[0], css_conv_match[1], self.convert_url(css_conv_match[2], url), css_conv_match[1])).encode('iso-8859-1', 'replace'))
                    css_conv_left = css_conv_match[3]
        elif content_type == 'text/html':
            data = yield from request.content.read(4096)
            html_head = re.compile('<head(?:\\s+[^ >]+(?:|="[^"]*"|=[^ >]*))*\\s*>', re.IGNORECASE)
            html_head_match = html_head.search(data.decode('iso-8859-1'))
            if html_head_match:
                html_head_split = html_head_match.span()[1]
                if html_head_split:
                    response.write(data[:html_head_split])
            response.write(('\r\n<!-- OpenWepro --><script language="javascript" src="%s/about/openwepro.js?v=%s"></script><!-- /OpenWepro -->\r\n' % (self.path_prefix, self.instance_id)).encode('utf-8', 'replace'))
            if html_head_match and html_head_split != len(data):
                response.write(data[html_head_split:])
            while True:
                data = yield from request.content.read(1024)
                if not data:
                    break
                response.write(data)
        else:
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


    def parse_url(self, url, ignore_error=True):
        url_matcher = re.compile('/(.*?)/(.*?)/:(?:/(.*))?$')
        url_parsed = url_matcher.match(url)
        if not url_parsed:
            return url if ignore_error else None
        url_parsed = url_parsed.groups()
        if url_parsed[0] in {'http', 'https'}:
            return '%s://%s/%s' % (url_parsed[0], '.'.join(reversed(url_parsed[1].split('/'))), url_parsed[2] or '')


    def convert_url(self, target, base=None):
        url = target if base is None else urllib.parse.urljoin(base, target)
        conv_url_matcher = re.compile('(https?)://(.*?)(?:/(.*))?$')
        conv_url_match = conv_url_matcher.match(url)
        if not conv_url_match: return target
        conv_url_match = conv_url_match.groups()
        return '%s/%s/%s/:/%s' % (self.path_prefix, conv_url_match[0], '/'.join(reversed(conv_url_match[1].split('.'))), conv_url_match[2] or '')


    def convert_cookie(self, cookie, url):
        domain = urllib.parse.urlsplit(url).netloc
        if not domain:
            return (cookie,)
        if '; ' in cookie:
            cookie_value, cookie_args = cookie.split('; ', 1)
            cookie_args = cookie_args.split('; ')
            conv_args = []
            path = ''
            secure = False
            for cookie_arg in cookie_args:
                cookie_arg_split = cookie_arg.split('=', 1)
                argname = cookie_arg_split[0].lower()
                if argname == 'secure':
                    secure = True
                elif argname == 'domain' and len(cookie_arg_split) > 1:
                    domain = cookie_arg_split[1]
                elif argname == 'path' and len(cookie_arg_split) > 1:
                    path = cookie_arg_split[1].strip('/')
                else:
                    conv_args.append(cookie_arg)
            if domain.startswith('.'):
                conv_path = domain.lstrip('.').split('.')
                conv_path.reverse()
                conv_path = '/'.join(conv_path)
            else:
                conv_path = domain.split('.')
                conv_path.reverse()
                conv_path = ('%s/:/%s' % ('/'.join(conv_path), path)).rstrip('/')
            if secure:
                return ('%s; %s' % (cookie_value, '; '.join(['path=%s/http/%s' % (self.path_prefix, conv_path)] + conv_args)),)
            else:
                return ('%s; %s' % (cookie_value, '; '.join(['path=%s/http/%s' % (self.path_prefix, conv_path)] + conv_args)),
                        '%s; %s' % (cookie_value, '; '.join(['path=%s/https/%s' % (self.path_prefix, conv_path)] + conv_args)))
        else:
            domain = domain.split('.')
            domain.reverse()
            return ('%s; path=%s/http/%s/:' % (cookie, self.path_prefix, '/'.join(domain)),
                    '%s; path=%s/https/%s/:' % (cookie, self.path_prefix, '/'.join(domain)))


def start():
    HttpRequestHandler.instance_id = str(uuid.uuid4())
    HttpRequestHandler.config = configparser.ConfigParser()
    HttpRequestHandler.config.read('../config.ini')
    HttpRequestHandler.path_prefix = HttpRequestHandler.config.get('basic', 'path_prefix', fallback='').strip('/')
    if HttpRequestHandler.path_prefix:
        HttpRequestHandler.path_prefix = '/' + HttpRequestHandler.path_prefix
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
