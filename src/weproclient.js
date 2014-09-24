(function(window) {
"use strict";

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        console.log(mutation);
    });
});
var observerConfig = { childList: true, attributes: true, subtree: true };
observer.observe(document.documentElement, config);

}(this));
