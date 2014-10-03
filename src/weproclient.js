/*!
  This file is part of OpenWepro project, and is released under GPL 3 license.
  You can obtain full source code along with license text at https://github.com/m13253/openwepro
*/
(function(window) {
"use strict";

var urlPrefix = "@path_prefix@";
var urlMatcher = new RegExp("^/(.*?)/(.*?)/:(?:/(.*))?$");
var urlParsed = urlMatcher.exec(location.pathname.substr(urlPrefix.length));
if(!urlParsed)
    throw "Can not parse URL: " + location.pathname;
var targetURL = urlParsed[1] + "://" + urlParsed[2].split("/").reverse().join(".") + "/" + (urlParsed[3] || "");

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

var oldXMLHttpRequestOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, async) {
    return oldXMLHttpRequestOpen.call(this, method, convertURL(url), async);
};

var oldGetAttribute = Element.prototype.getAttribute;
var oldHasAttribute = Element.prototype.hasAttribute;
var oldSetAttribute = Element.prototype.setAttribute;
var oldRemoveAttribute = Element.prototype.removeAttribute;
Element.prototype.getAttribute = function(attr) {
    if(this._OpenweproAttributes)
        return this._OpenweproAttributes["attr_" + attr] || oldGetAttribute.call(this, attr);
    else
        return oldGetAttribute.call(this, attr);
};
Element.prototype.hasAttribute = function(attr) {
    return (this._OpenweproAttributes && (("attr_" + attr) in this._OpenweproAttributes)) || oldHasAttribute.call(this, attr);
};
Element.prototype.setAttribute = function(attr, value) {
    if(!this._OpenweproAttributes)
        this._OpenweproAttributes = new Object();
    if(attr === "crossorigin") {
        if(value === "anonymous") {
            this._OpenweproAttributes["attr_crossorigin"] = value;
            oldRemoveAttribute.call(this, attr);
        } else
            oldSetAttribute.call(this, attr, value);
        return value;
    } else if(attr === "action" || attr === "href" || attr === "src" || (this.nodeName === "PARAM" && this.name === "movie" && attr === "value")) {
        this._OpenweproAttributes["attr_" + attr] = value;
        if(this.nodeName === "SCRIPT") {
            oldSetAttribute.call(this, attr, urlPrefix + "/about/empty.js");
            var el = this;
            var xhr = new XMLHttpRequest();
            xhr.open("GET", value, this.hasAttribute("async"));
            xhr.addEventListener("load", function() {
                if(!el.hasAttribute("defer") && xhr.status === 200)
                    window.eval("/* " + value.replace('*/', '%2a/') + " */\n" + xhr.responseText);
                else
                    oldSetAttribute.call(el, attr, convertURL(value));
            });
            xhr.addEventListener("error", function() {
                oldSetAttribute.call(el, attr, convertURL(value));
            });
            xhr.send(null);
        } else
            oldSetAttribute.call(this, attr, convertURL(value));
        return value;
    } else
        return oldSetAttribute.call(this, attr, value);
};
Element.prototype.removeAttribute = function(attr) {
    delete this._OpenweproAttributes["attr_" + attr];
    oldRemoveAttribute.call(this, attr);
};
function injectElementProperty(prop) {
    return Object.defineProperty(Element.prototype, prop, {
        configurable: true,
        enumerable: true,
        get: function() { return this.hasAttribute(prop) ? this.getAttribute(prop) : undefined; },
        set: function(value) { this.setAttribute(prop, value); return value; }
    });
}
var attrToInject = ["action", "crossorigin", "href", "src", "value"];
attrToInject.forEach(injectElementProperty);

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

function injectNode(el) {
    if(!el._OpenWeproInjected) {
        Object.defineProperty(el, "_OpenWeproInjected", {
            configurable: false,
            enumerable: false,
            value: true,
            writable: false
        });
        attrToInject.forEach(function(attr) {
            if(el.hasAttribute && el.hasAttribute(attr))
                el.setAttribute(attr, el.getAttribute(attr));
        });
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

var oldWorker = window.Worker;
window.Worker = function(url) {
    /* Thank you, http://stackoverflow.com/a/13839919/2557927 */
    var unbind = Function.bind.bind(Function.bind);
    return new (unbind(oldWorker, null).call(null, url));
}
window.Worker.__proto__ = oldWorker.__proto__;

var oldCookie = document.cookie;
Object.defineProperty(document, "cookie", { get: function() { return oldCookie; }, set: function() {} });
var oldDomain = document.domain;
Object.defineProperty(document, "domain", { get: function() { return oldDomain; }, set: function() {} });

}(this));
