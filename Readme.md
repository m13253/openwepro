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

It is preferred to set up a cache, for example Squid or Varnish, before OpenWepro. Use `export http_proxy=http://127.0.0.1:3128` in prior to starting OpenWepro to tell OpenWepro use Squid as upstream.

You can also use ZiProxy to compress the web page for a slow network connection along with OpenWepro.

License
-------

OpenWepro is a free and open source software released under GPL 3 license. You can also set up one and share it among your friends!

You could obtain a copy of GPL 3 license text at <https://www.gnu.org/licenses/gpl-3.0.html>.

Notes
-----

- OpenWepro is not perfect. Not every web page can be displayed correctly.
- Never connect to untrusted servers, because the server has the ability to modify your data even with HTTPS encryption.
- Never try to access confidential data with OpenWepro.
- Several security features, such as Cross Site Scripting Protection, can not work with OpenWepro. Be careful on your own or your accounts might be compromised.
- OpenWepro can not and will not keep you anonymous or protect your privacy. By default, OpenWepro does not hide your IP address.
- Sometimes links do not work, try right-clicking to open them in new windows. That is because OpenWepro does not and will not support PJAX, a technology that enables faster page loading.
- Your country/region may disallow you from using a proxy. OpenWepro can not prevent you from breaking the law. So please check your local law before using OpenWepro.
- Hopefully OpenWepro is useful to you. However OpenWepro comes with absolutely no warranty to the extent permitted by applicable law. If OpenWepro causes any damage, please be at your own risk.
