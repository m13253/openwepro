/*!
  This file is part of OpenWepro project, and is released under GPL 3 license.
  You can obtain full source code along with license text at https://github.com/m13253/openwepro
*/
(function(window) {
"use strict";

var weproAuth = @auth@;
var weproUser = undefined;
var weproPass = undefined;
if(weproAuth && weproAuth.substr(0, 6).toUpperCase() === 'BASIC ') {
    var user_pass = atob(weproAuth.substr(6));
    var delim = user_pass.indexOf(':');
    if(delim !== -1) {
        weproUser = user_pass.substr(0, delim);
        weproPass = user_pass.substr(delim+1);
    }
}

var urlPrefix = "@path_prefix@";
var urlMatcher = new RegExp("^/(.*?)/(.*?)/:(?:/(.*))?$");
var urlParsed = urlMatcher.exec(location.pathname.substr(urlPrefix.length));
if(!urlParsed)
    throw "Can not parse URL: " + location.pathname;
var targetURL = urlParsed[1] + "://" + urlParsed[2].split("/").reverse().join(".") + "/" + (urlParsed[3] || "");

if(weproUser && weproPass) /* I think it is a browser bug, fix it. */
    urlPrefix = "//" + encodeURIComponent(weproUser) + ":" + encodeURIComponent(weproPass) + "@" + location.host + urlPrefix;

function convertURL(url) {
    if(url.substr(0, 2) == "//") { // Protocol relative URL
        var convURLMatcher = new RegExp("^//(.*?)(?:/(.*))?$");
        var convURLParsed = convURLMatcher.exec(url);
        if(!convURLParsed) return url;
        return urlPrefix + "/" + urlParsed[1] + "/" + convURLParsed[1].split(".").reverse().join("/") + "/:/" + (convURLParsed[2] || "");
    } else if(url.substr(0, 1) == "/") // Relative URL
        return urlPrefix + "/" + urlParsed[1] + "/" + urlParsed[2] + "/:" + url;
    else {
        var convURLMatcher = new RegExp("^(https?)://(.*?)(?:/(.*))?$");
        var convURLParsed = convURLMatcher.exec(url);
        if(!convURLParsed) return url;
        return urlPrefix + "/" + convURLParsed[1] + "/" + convURLParsed[2].split(".").reverse().join("/") + "/:/" + (convURLParsed[3] || "");
    }
}

function convertCSS(text) {
    var convMatcher = new RegExp("^([\\S\\s]*?[\\s:,])url\\s*\\(\\s*([\"']?)(.*?)\\2\\s*\\)([\\S\\s]*)$", "i");
    var converted = ["/* OpenWepro */\n"];
    var matched;
    while(matched = convMatcher.exec(text)) {
        converted.push(matched[1] + "url(" + matched[2] + convertURL(matched[3]) + matched[2] + ")");
        text = matched[4];
    }
    converted.push(text);
    return converted.join("");
}

var oldXMLHttpRequestOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    return oldXMLHttpRequestOpen.call(this, method, convertURL(url), async, weproUser, weproPass);
};
if(weproAuth) {
    var oldXMLHttpRequestSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(data) {
        this.setRequestHeader("Authorization", weproAuth);
        return oldXMLHttpRequestSend.call(this, data);
    };
}

function injectNode(el) {
    function injectNodeProperty(el, prop) {
        if(el.hasAttribute(prop))
            el.setAttribute(prop, el.getAttribute(prop));
        Object.defineProperty(el, prop, {
            configurable: true,
            enumerable: true,
            get: function() { return el.getAttribute(prop); },
            set: function(value) { el.setAttribute(prop, value); return value; }
        });
    }
    if(!el._OpenWeproInjected) {
        Object.defineProperty(el, "_OpenWeproInjected", {
            configurable: false,
            enumerable: false,
            value: true,
            writable: false
        });
        if(el.setAttribute) {
            var oldGetAttribute = el.getAttribute;
            var oldSetAttribute = el.setAttribute;
            var oldRemoveAttribute = el.removeAttribute;
            var oldAttributes = new Object();
            el.getAttribute = function(attr) {
                return oldAttributes["attr_" + attr] || oldGetAttribute.call(el, attr);
            };
            el.setAttribute = function(attr, value) {
                if(attr === "action" || attr === "href" || attr === "src" || (el.nodeName === "PARAM" && el.name === "movie" && attr === "value")) {
                    oldAttributes["attr_" + attr] = value;
                    if(el.nodeName === "SCRIPT" && !el.hasAttribute("async")) {
                        var xhr = new window.XMLHttpRequest();
                        xhr.open("GET", value, false);
                        xhr.send(null);
                        if(!el.hasAttribute("defer") && xhr.status === 200) {
                            window.eval(xhr.responseText);
                            oldSetAttribute.call(el, attr, urlPrefix + "/about/empty.js");
                        } else
                            oldSetAttribute.call(el, attr, convertURL(value));
                    } else
                        oldSetAttribute.call(el, attr, convertURL(value));
                    return value;
                } else
                    return oldSetAttribute.call(el, attr, value);
            };
            el.removeAttribute = function(attr) {
                delete oldAttributes["attr_" + attr];
                oldRemoveAttribute.call(el, attr);
            };
            injectNodeProperty(el, "action");
            injectNodeProperty(el, "href");
            injectNodeProperty(el, "src");
            injectNodeProperty(el, "value");
        }
        if(el.nodeName === "STYLE" && el.innerHTML.substr(0, 15) !== "/* OpenWepro */")
            el.innerHTML = convertCSS(el.innerHTML);
        if(el.hasAttribute && el.hasAttribute("style")) {
            var currentStyle = el.getAttribute("style");
            if(currentStyle && currentStyle.substr(0, 15) !== "/* OpenWepro */")
                el.setAttribute("style", convertCSS(currentStyle));
        }
    }
    return el;
}

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if(mutation.addedNodes)
            for(var i = 0; i < mutation.addedNodes.length; i++)
                injectNode(mutation.addedNodes[i]);
        if(mutation.type === "characterData") {
            if(mutation.target.parentNode.nodeName === "STYLE" && mutation.target.data.substr(0, 15) !== "/* OpenWepro */")
                mutation.target.data = convertCSS(mutation.target.data);
        } else if(mutation.type === "attributes") {
            if(mutation.attributeName === "style") {
                var currentStyle = mutation.target.getAttribute("style");
                if(currentStyle && currentStyle.substr(0, 15) !== "/* OpenWepro */")
                    mutation.target.setAttribute("style", convertCSS(currentStyle));
            }
        }
    });
});
var observerConfig = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
    attributeFilter: ["action", "href", "src", "style"]
};
observer.observe(document.documentElement, observerConfig);

var oldCreateElement = document.createElement;
document.createElement = function(tagName) {
    return injectNode(oldCreateElement.call(document, tagName));
};

var oldImage = window.Image;
window.Image = function() {
    /* Thank you, http://stackoverflow.com/a/13839919/2557927 */
    var unbind = Function.bind.bind(Function.bind);
    return injectNode(new (unbind(oldImage, null).call(null)));
}
window.Image.__proto__ = oldImage.__proto__;

var oldWorker = window.Worker;
window.Worker = function(url) {
    var unbind = Function.bind.bind(Function.bind);
    return new (unbind(oldWorker, null).call(null, url));
}
window.Worker.__proto__ = oldWorker.__proto__;

var oldCookie = document.cookie;
Object.defineProperty(document, "cookie", { get: function() { return oldCookie; }, set: function() {} });
var oldDomain = document.domain;
Object.defineProperty(document, "domain", { get: function() { return oldDomain; }, set: function() {} });

}(this));
