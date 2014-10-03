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
XMLHttpRequest.prototype.open = function(method, url, async) {
    return oldXMLHttpRequestOpen.call(this, method, convertURL(url), async);
};

var attrToInject = ["action", "crossorigin", "href", "src", "style", "value"];
var oldGetAttribute = Element.prototype.getAttribute;
var oldHasAttribute = Element.prototype.hasAttribute;
var oldSetAttribute = Element.prototype.setAttribute;
var oldRemoveAttribute = Element.prototype.removeAttribute;
Object.defineProperty(Element.prototype, "_OpenWeproAttributes", {
    configurable: false,
    enumerable: false,
    get: function() {
        if(!this.__OpenWeproAttributes)
            Object.defineProperty(this, "__OpenWeproAttributes", {
                configurable: false,
                enumerable: false,
                value: new Object()
            });
        return this.__OpenWeproAttributes;
    },
    set: function(value) {
        throw "Can not write read-only property _OpenWeproAttributes";
    }
});
Element.prototype.getAttribute = function(attr) {
    return this._OpenWeproAttributes["attr_" + attr] || oldGetAttribute.call(this, attr);
};
Element.prototype.hasAttribute = function(attr) {
    return "attr_" + attr in this._OpenWeproAttributes || oldHasAttribute.call(this, attr);
};
Element.prototype.setAttribute = function(attr, value) {
    if(attr === "crossorigin") {
        if(value === "anonymous") {
            this._OpenWeproAttributes["attr_crossorigin"] = value;
            oldRemoveAttribute.call(this, attr);
        } else
            oldSetAttribute.call(this, attr, value);
    } else if(attr === "style") {
        this._OpenWeproAttributes["attr_style"] = value;
        oldSetAttribute.call(this, attr, convertCSS(value));
    } else if(attr === "action" || attr === "href" || attr === "src") {
        this._OpenWeproAttributes["attr_" + attr] = value;
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
    } else if(attr === "value") {
        this._OpenWeproAttributes["attr_" + attr] = value;
        oldSetAttribute.call(this, attr, this.nodeName === "PARAM" && this.name === "movie" ? convertURL(value) : value);
    } else
        return oldSetAttribute.call(this, attr, value);
    return value;
};
Element.prototype.removeAttribute = function(attr) {
    delete this._OpenWeproAttributes["attr_" + attr];
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
attrToInject.forEach(injectElementProperty);

function updateElementAttribute(el, attr) {
    console.log("Update: " + el.nodeName + "." + attr);
    if(el._OpenWeproAttributes && !("attr_" + attr in el._OpenWeproAttributes) && el.hasAttribute && el.hasAttribute(attr))
        el.setAttribute(attr, el.getAttribute(attr));
}

function updateElementAttributes(el) {
    if(el._OpenWeproAttributes)
        attrToInject.forEach(function(attr) {
            updateElementAttribute(el, attr);
        });
}

function injectNode(el) {
    updateElementAttributes(el);
    if(el.nodeName === "STYLE" && el.innerHTML.substr(0, 15) !== "/* OpenWepro */")
        el.innerHTML = convertCSS(el.innerHTML);
    return el;
}

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if(mutation.type === "childList")
            for(var i = 0; i < mutation.addedNodes.length; i++)
                injectNode(mutation.addedNodes[i]);
        else if(mutation.type === "attributes")
            updateElementAttribute(mutation.target, mutation.attributeName);
        else if(mutation.type === "characterData")
            if(mutation.target.parentNode.nodeName === "STYLE" && mutation.target.data.substr(0, 15) !== "/* OpenWepro */")
                mutation.target.data = convertCSS(mutation.target.data);
    });
});
var observerConfig = {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
    attributeFilter: attrToInject
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
