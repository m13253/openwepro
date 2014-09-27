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
        var convURLMatcher = new RegExp("^([^/]*)://(.*?)(?:/(.*))?$");
        var convURLParsed = convURLMatcher.exec(url);
        if(!convURLParsed) return url;
        return urlPrefix + "/" + convURLParsed[1] + "/" + convURLParsed[2].split(".").reverse().join("/") + "/:/" + (convURLParsed[3] || "");
    }
}

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if(mutation.addedNodes)
            for(var i = 0; i < mutation.addedNodes.length; i++) {
                var el = mutation.addedNodes[i];
                if(el.setAttribute) {
                    var oldSetAttribute = el.setAttribute;
                    el.setAttribute = function(attr, value) {
                        if(attr === "href" || attr === "src")
                            return oldSetAttribute.call(el, attr, convertURL(value));
                        else
                            return oldSetAttribute.call(el, attr, value);
                    };
                    if(el.hasAttribute("href"))
                        el.setAttribute("href", el.getAttribute("href"));
                    if(el.hasAttribute("src"))
                        el.setAttribute("src", el.getAttribute("src"));
                    Object.defineProperty(el, "href", {
                        configurable: true,
                        enumerable: true,
                        get: function() { return el.getAttribute("href"); },
                        set: function(value) { el.setAttribute("href", value); return value; }
                    });
                    Object.defineProperty(el, "src", {
                        configurable: true,
                        enumerable: true,
                        get: function() { return el.getAttribute("src"); },
                        set: function(value) { el.setAttribute("src", value); return value; }
                    });
                }
            }
    });
});
var observerConfig = { childList: true, attributes: true, subtree: true };
observer.observe(document.documentElement, observerConfig);

}(this));
