(function(window) {
"use strict";

var urlPrefix = "";
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
            var oldSetAttribute = el.setAttribute;
            el.setAttribute = function(attr, value) {
                if(attr === "action" || attr === "href" || attr === "src")
                    return oldSetAttribute.call(el, attr, convertURL(value));
                else
                    return oldSetAttribute.call(el, attr, value);
            };
            injectNodeProperty(el, "action");
            injectNodeProperty(el, "href");
            injectNodeProperty(el, "src");
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
    });
});
var observerConfig = { childList: true, attributes: true, subtree: true };
observer.observe(document.documentElement, observerConfig);

var oldXMLHttpRequest = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
    oldXMLHttpRequest.call(this);
    var oldOpen = this.open;
    this.open = function(method, url, async, user, password) {
        return oldOpen.call(this, method, convertURL(url), async, user, password);
    }
};

var oldCreateElement = document.createElement;
document.createElement = function(tagName) {
    return injectNode(oldCreateElement.call(document, tagName));
};

}(this));
