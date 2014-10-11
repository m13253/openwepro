OpenWepro
=========

## Open source in-page web proxy software

Installation
------------

- Install Python 3.4, Python-aiohttp, Nginx
- Download the [OpenWepro source code](https://github.com/m13253/openwepro/archive/master.tar.gz)
- Edit `config.ini` to satisfy your need
- Install `nginx-vhost.conf` as a virtual host to Nginx. You may need to modify some settings.
- Execute `./openwepro` to start the server.
- Visit the URL you have just set and enjoy the libre Internet.

Notice for service providers
----------------------------

It is required to set up a load balancer, functioning as well as an SSL wrapper, for example Nginx, after OpenWepro.

It is preferred to set up a cache, for example Squid or Varnish, before OpenWepro. Use `export http_proxy=http://127.0.0.1:3128` before starting OpenWepro to tell OpenWepro use Squid as upstream.

You can also use ZiProxy to compress the web page for a slow network connection along with OpenWepro.
