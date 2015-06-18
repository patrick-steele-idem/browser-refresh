var refresher = require('./refresher');

var io = window.browserRefreshIO;

var socket = io.connect('http://localhost:' + window.browserRefreshPort);
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