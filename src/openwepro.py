#!/usr/bin/env python3

try:
    import asyncio
except ImportError:
    raise ImportError('At least Python 3.4 is required')
try:
    import aiohttp
except ImportError:
    raise ImportError('Please install python-aiohttp')

import weproserver

if __name__ == '__main__':
    weproserver.start()
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        pass
