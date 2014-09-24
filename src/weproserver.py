import asyncio
import logging
import aiohttp
import aiohttp.server
import aiohttp.multidict


class HttpRequestHandler(aiohttp.server.ServerHttpProtocol):
    @asyncio.coroutine
    def handle_request(self, message, payload):
        response = aiohttp.Response(
            self.writer, 200, http_version=message.version
        )
        response.add_header('Content-Type', 'text/html')
        response.add_header('Content-Length', '18')
        response.send_headers()
        response.write(b'<h1>It works!</h1>')
        yield from response.write_eof()


def start():
    loop = asyncio.get_event_loop()
    loop.run_until_complete(
        loop.create_server(
            lambda: HttpRequestHandler(debug=True, keep_alive=60),
            '127.0.0.1', 8080
        )
    )
