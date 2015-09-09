/*
Code to handle refreshing StyleSheets and images. This code was inspired by the following project:
https://github.com/livereload/livereload-js

Special thanks to the authors of livereload-js!
*/

var curUniqueId = 0;
var browserRefreshUrlParam;
var request = require('browser-request');
var urlRegExp = /url\(\s*"([^\)]*)"\s*\)|url\(\s*'([^\)]*)'\s*\)|url\(([^\)]*)\)/;
var CSSRule = window.CSSRule;
var nodeUrl = require('url');

var log;

if (typeof console === 'undefined') {
    log = function() {};
} else {
    log = function(message) {
        message = '[browser-refresh] ' + message;
        console.log.apply(console, arguments);
    };
}

function isLocalUrl(url) {
    var parsed = nodeUrl.parse(url);
    var hostname = parsed.hostname;

    if (hostname.indexOf('localhost') !== -1) {
        return true;
    }

    if (hostname.indexOf('127.') !== -1) {
        return true;
    }

    var port = parsed.port;

    if (port != null) {
        return true;
    }

    return false;
}

function nextBrowserRefreshUrlParam() {
    browserRefreshUrlParam = 'browserRefresh' + (curUniqueId++);
}

nextBrowserRefreshUrlParam();

function prepareRefresh(callback) {
    nextBrowserRefreshUrlParam();

    // Re-request the same page from the server to trigger a re-optimization of
    // the page. This is done because the RaptorJS Optimizer lazily optimizes
    // a page on the first request.
    request(document.location.toString(), function(er, response, body) {
        // We don't care about the response, but we are now ready to
        // refresh the page styles or images.
        callback();
    });
}

function generateCacheBustUrl(oldUrl) {
    var hashIndex = oldUrl.lastIndexOf('#');
    var hash;
    var newUrl = oldUrl;

    if (hashIndex !== -1) {
        hash = oldUrl.substring(hashIndex);
        newUrl = newUrl.substring(0, hashIndex);
    }

    // debugger;

    newUrl = newUrl.replace(/[?&]browserRefresh\d+/, '');

    var queryIndex = newUrl.indexOf('?');

    if (queryIndex === -1) {
        newUrl += '?' + browserRefreshUrlParam;
    } else {
        // First remove the old URL param
        if (queryIndex === newUrl.length - 1) {
            newUrl += browserRefreshUrlParam;
        } else {
            newUrl += '&' + browserRefreshUrlParam;
        }
    }

    if (hash) {
        newUrl += hash;
    }

    return newUrl;
}

function onLinkLoaded(link, callback) {
    var retries = 20;
    var complete = false;

    function cleanup() {
        link.onload = null;
        link.onreadystatechange = null;
        link.onerror = null;
    }

    function isLoaded() {
        var sheets = document.styleSheets;
        for (var idx = 0, len = sheets.length; idx < len; idx++) {
            if (sheets[idx].href === link.href) {
                return true;
            }
        }
        return false;
    }

    function success() {
        if (complete === false) {
            complete = true;
            cleanup();
            //Let the loader module know that the resource has included successfully
            callback();
        }
    }

    function pollSuccess() {
        if (complete === false) {
            if (!isLoaded() && (retries--)) {
                return window.setTimeout(pollSuccess,10);
            }
            success();
        }
    }

    function error(err) {

        if (complete === false) {
            complete = true;
            cleanup();
            //Let the loader module know that the resource was failed to be included
            callback(err || 'unknown error');
        }
    }

    if (navigator.appName === 'Microsoft Internet Explorer') {
        link.onload = success;
        link.onreadystatechange = function() {
            var readyState = this.readyState;
            if ('loaded' === readyState || 'complete' === readyState) {
                success();
            }
        };
    } else {
        //For non-IE browsers we don't get the "onload" and "onreadystatechange" events...
        pollSuccess();
    }

    link.onerror = error;
}

function refreshStyleSheet(link) {
    log('Refreshing StyleSheet: ' + link.href);
    // Instead of just changing the href we are going to insert a new
    // <link> tag with an updated href and then remove the old
    // <link> tag when the new <link> tag is fully loaded. This is done
    // to avoid a flash of unstyled content.
    var clone = link.cloneNode(false);
    clone.href = generateCacheBustUrl(link.href);

    var parentNode = link.parentNode;

    onLinkLoaded(clone, function() {
        if (parentNode) {
            // Now it is okay to remove the old <link> tag
            parentNode.removeChild(link);
        }
    });

    if (parentNode) {
        if (link.nextSibling) {
            parentNode.insertBefore(clone, link.nextSibling);
        } else {
            parentNode.appendChild(clone);
        }
    }

}

function refreshAllStyleSheets() {
    log('Refreshing styles...');

    prepareRefresh(function() {
        var linksNodeList = document.getElementsByTagName('link');
        var links = [];
        var i;

        // Filter and convert the node list to an array. Since we will be
        // modifying the DOM we don't want to operate on the original NodeList
        // that is live
        for (i=0; i<linksNodeList.length; i++) {
            var link = linksNodeList[i];
            if (!link.href) {
                continue;
            }

            if (!link.rel) {
                continue;
            }

            if (!link.rel.match(/^stylesheet$/i)) {
                continue;
            }

            if (!isLocalUrl(link.href)) {
                log('Skipping StyleSheet since not local: ' + link.href);
                continue;
            }


            links.push(link);
        }

        // Now refresh the style sheets
        for (i=0; i<links.length; i++) {
            refreshStyleSheet(links[i]);
        }
    });
}

function reloadImgTags() {
    var images = document.images;
    for (var i=0; i<images.length; i++) {
        var img = images[i];
        if (img.src) {
            log('Refreshing image: ' + img.src);
            img.src = generateCacheBustUrl(img.src);
        }
    }
}

function reloadImagesInStyle(style) {
    var cssText = style.cssText;
    cssText = cssText.replace(urlRegExp, function(match, url1, url2, url3) {
        var url = url1 || url2 || url3;
        var newUrl = generateCacheBustUrl(url.trim());
        log('Refreshing resource in CSS: ' + url);
        return 'url(' + newUrl + ')';
    });
    style.cssText = cssText;
}

function reloadImagesInElStyle() {
    if (document.querySelectorAll) {
        var nodeList = document.querySelectorAll('[style*=background], [style*=border]');
        if (nodeList) {
            for (var i=0; i<nodeList.length; i++) {
                var el = nodeList[i];
                reloadImagesInStyle(el.style);
            }
        }
    }
}

function reloadImagesInStyleSheet(styleSheet) {
    var rules = styleSheet.cssRules;
    if (!rules) {
        return;
    }

    for (var i=0; i<rules.length; i++) {
        var rule = rules[i];
        if (rule.type === CSSRule.STYLE_RULE) {
            reloadImagesInStyle(rule.style);
        } else if (rule.type === CSSRule.IMPORT_RULE) {
            reloadImagesInStyleSheet(rule.styleSheet);
        } else if (rule.type === CSSRule.MEDIA_RULE) {
            reloadImagesInStyleSheet(rule);
        }
    }
}

function reloadImagesInStyleSheets() {
    var styleSheets = document.styleSheets;
    if (styleSheets) {
        for (var i=0; i<styleSheets.length; i++) {
            var styleSheet = styleSheets[i];
            if (styleSheet) {
                reloadImagesInStyleSheet(styleSheet);
            }
        }
    }
}

function refreshAllImages() {
    log('Refreshing images...');

    prepareRefresh(function() {
        reloadImgTags();
        reloadImagesInElStyle();
        reloadImagesInStyleSheets();

        log('All images refreshed');
    });
}

function refreshPage() {
    log('Refreshing page...');
    location.reload();
}

exports.refreshPage = refreshPage;
exports.refreshAllStyleSheets = refreshAllStyleSheets;
exports.refreshAllImages = refreshAllImages;