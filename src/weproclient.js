/*!
  This file is part of OpenWepro project, and is released under GPL 3 license.
  You can obtain full source code along with license text at https://github.com/m13253/openwepro
*/
(function(window) {
"use strict";

var OpenWeproError = function(what) {
    return Error("[OpenWepro] " + what);
};

var urlPrefix = "@path_prefix@";
var urlMatcher = new RegExp("^/(.*?)/(.*?)/:(?:/(.*))?$");
var urlParsed = urlMatcher.exec(location.pathname.substr(urlPrefix.length));
if(!urlParsed)
    throw OpenWeproError("can not parse URL: " + location.pathname);
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
    return oldXMLHttpRequestOpen.call(this, method, convertURL(url), async !== false);
};

var attrToInject = ["action", "crossorigin", "href", "src", "style", "value"];
var oldGetAttribute = Element.prototype.getAttribute;
var oldHasAttribute = Element.prototype.hasAttribute;
var oldSetAttribute = Element.prototype.setAttribute;
var oldRemoveAttribute = Element.prototype.removeAttribute;
var documentWritePoint = null; /* document.write */
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
        throw Error("can not write read-only property _OpenWeproAttributes");
    }
});
Element.prototype.getAttribute = function(attr) {
    return this._OpenWeproAttributes["attr_" + attr] || oldGetAttribute.call(this, attr);
};
Element.prototype.hasAttribute = function(attr) {
    return "attr_" + attr in this._OpenWeproAttributes || oldHasAttribute.call(this, attr);
};
Element.prototype.setAttribute = function(attr, value) {
    /* console.log(this.nodeName.toLowerCase() + "." + attr + " = " + value); */
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
                var oldDocumentWritePoint = documentWritePoint;
                documentWritePoint = el;
                if(!el.hasAttribute("defer") && xhr.status === 200)
                    try {
                        window.eval("/* " + value.replace('*/', '%2a/') + " */\n" + xhr.responseText);
                    } catch(e) {
                        if(e.message && e.stack)
                            console.error(e.message + "\n\n" + e.stack);
                        else
                            console.error(e);
                    }
                else
                    oldSetAttribute.call(el, attr, convertURL(value));
                documentWritePoint = oldDocumentWritePoint;
            });
            xhr.addEventListener("error", function() {
                var oldDocumentWritePoint = documentWritePoint;
                documentWritePoint = el;
                oldSetAttribute.call(el, attr, convertURL(value));
                documentWritePoint = oldDocumentWritePoint;
            });
            xhr.send(null);
        } else
            oldSetAttribute.call(this, attr, convertURL(value));
    } else if(attr === "value" && this.nodeName === "PARAM" && this.name === "movie") { /* Adobe Flash */
        this._OpenWeproAttributes["attr_value"] = value;
        oldSetAttribute.call(this, attr, convertURL(value));
    } else
        return oldSetAttribute.call(this, attr, value);
    return value;
};
Element.prototype.removeAttribute = function(attr) {
    delete this._OpenWeproAttributes["attr_" + attr];
    oldRemoveAttribute.call(this, attr);
};

function updateElementAttribute(el, attr) {
    if(attr !== "value" || (el.nodeName === "PARAM" && el.name === "movie")) {
        if(el._OpenWeproAttributes && !("attr_" + attr in el._OpenWeproAttributes) && el.hasAttribute && el.hasAttribute(attr))
            el.setAttribute(attr, el.getAttribute(attr));
        if(attr !== "style")
            return Object.defineProperty(el, attr, {
                configurable: true,
                enumerable: true,
                get: function() { return this.hasAttribute(attr) ? this.getAttribute(attr) : undefined; },
                set: function(value) { this.setAttribute(attr, value); return value; }
            });
    }
    return el;
}

function updateElementAttributes(el) {
    if(el._OpenWeproAttributes)
        attrToInject.forEach(function(attr) {
            updateElementAttribute(el, attr);
        });
    return el;
}

function injectNode(el) {
    updateElementAttributes(el);
    if(el.nodeName === "STYLE" && el.textContent.substr(0, 15) !== "/* OpenWepro */")
        el.textContent = convertCSS(el.textContent);
    return el;
}

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
if(MutationObserver) {
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
} else
    console.warn("[OpenWepro] can not set up MutationObserver");

var oldCreateElement = Document.prototype.createElement;
Document.prototype.createElement = function(tagName) {
    return injectNode(oldCreateElement.call(this, tagName));
};

var oldWorker = window.Worker;
window.Worker = function(url) {
    /* Thank you, http://stackoverflow.com/a/13839919/2557927 */
    var unbind = Function.bind.bind(Function.bind);
    return new (unbind(oldWorker, null).call(null, url));
}
window.Worker.__proto__ = oldWorker.__proto__;

var oldCookie = document.cookie;
try {
    Object.defineProperty(document, "cookie", {
        configurable: false,
        get: function() {
            return oldCookie;
        }, set: function(value) {
            console.warn("[OpenWepro] document.cookie has not been unimplemented yet: " + value);
            return value;
        }
    });
} catch(e) {
    if(e.message && e.stack)
        console.error(e.message + "\n\n" + e.stack);
    else
        console.error(e);
    console.warn("[OpenWepro] can not inject document.cookie");
}
var oldDomain = document.domain;
try {
    Object.defineProperty(document, "domain", {
        configurable: false,
        get: function() {
            return oldDomain;
        }, set: function(value) {
            console.warn("[OpenWepro] document.domain has not been unimplemented yet: " + value);
            return value;
        }
    });
} catch(e) {
    if(e.message && e.stack)
        console.error(e.message + "\n\n" + e.stack);
    else
        console.error(e);
    console.warn("[OpenWepro] can not inject document.domain");
}

document.write = function(markup) {
    if(documentWritePoint) {
        var documentWriteParent = documentWritePoint.parentNode;
        var documentWriteReference = documentWritePoint.nextSibling;
    } else {
        var documentWriteParent = document.body || document.head || document.documentElement;
        var documentWriteReference = null;
    }
    var tmp = document.createElement('body');
    tmp.innerHTML = markup;
    var frag = document.createDocumentFragment();
    var child;
    while((child = tmp.firstChild))
        frag.appendChild(child);
    documentWriteParent.insertBefore(frag, documentWriteReference);
};
document.writeln = function(markup) {
    return document.write(markup + "\n");
};

}(this));
