(function(window) {
"use strict";

var urlPrefix = "@path_prefix@";
var urlMatcher = new RegExp("^(.*?)/(.*?)/:(?:/(.*))?$");
var urlParsed = urlMatcher.exec(location.pathname.substr(1));
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
            var oldAttributes = new Object();
            el.getAttribute = function(attr) {
                return oldAttributes[attr] || oldGetAttribute.call(el, attr);
            }
            el.setAttribute = function(attr, value) {
                if(attr === "action" || attr === "href" || attr === "src" || (el.nodeName === "PARAM" && el.name === "movie" && attr === "value")) {
                    var res = oldSetAttribute.call(el, attr, convertURL(value));
                    oldAttributes[attr] = value;
                    return res;
                } else
                    return oldSetAttribute.call(el, attr, value);
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

var oldXMLHttpRequestOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, async) {
    return oldXMLHttpRequestOpen.call(this, method, convertURL(url), async);
};

var oldImage = window.Image;
window.Image = function() {
    /* Thank you, http://stackoverflow.com/a/13839919/2557927 */
    var unbind = Function.bind.bind(Function.bind);
    return injectNode(new (unbind(oldImage, null).call(null)));
}
window.Image.__proto__ = oldImage.__proto__;

var oldCookie = document.cookie;
Object.defineProperty(document, "cookie", { get: function() { return oldCookie; }, set: function() {} });
var oldDomain = document.domain;
Object.defineProperty(document, "domain", { get: function() { return oldDomain; }, set: function() {} });

}(this));
