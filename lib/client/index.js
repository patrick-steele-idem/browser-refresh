var refresher = require('./refresher');

var socket = window.io.connect('http://localhost:' + window.browserRefreshPort);
socket
    .on('refresh', function (data) {
        if (data.refreshPage) {
            refresher.refreshPage();
        } else {
            if (data.refreshStyles) {
                refresher.refreshAllStyleSheets();
            }

            if (data.refreshImages) {
                refresher.refreshAllImages();
            }
        }
    });