var EventEmitter = require('events').EventEmitter;
var DEFAULT_DELAY = 500;
var express = require('express');
var nodePath = require('path');
var clientSrcRaw = require('fs').readFileSync(nodePath.join(__dirname, 'client.js'), { encoding: 'utf8' });

function Server(config) {
    this.readyEvent = config.readyEvent || 'online';
    this.refreshDelay = config.refreshDelay || DEFAULT_DELAY;
    this.port = config.port;
    this.launcher = config.launcher;
    this.logger = config.logger;
}

Server.prototype = {
    start: function() {

        var port = this.port;
        var logger = this.logger;

        var clientSrc = clientSrcRaw.replace(/PORT/g, port);

        var app = express();
        var server = app.listen(port);
        app.get('/browser-refresh.js', function(req, res) {
            res.header('content-type', 'application/x-javascript');
            res.end(clientSrc);
        });

        var io = require('socket.io').listen(server, { log: false });

        var readyEvent = this.readyEvent;
        var delay = this.refreshDelay;

        var socketEvents = new EventEmitter();

        io.sockets.on('connection', function (socket) {

            function refreshListener(eventArgs) {
                socket.emit('refresh', eventArgs);
            }

            socketEvents.on('refresh', refreshListener);
            
            socket.on('disconnect', function () {
                socketEvents.removeListener('refresh', refreshListener);
            });
        });

        this.launcher.on('start', function (eventArgs) {
            var refreshed  = false;

            function refresh() {
                if (refreshed) {
                    return;
                }

                refreshed = true;
                socketEvents.emit('refresh', {});
            }

            var childProcess;

            if (eventArgs) {
                childProcess = eventArgs.childProcess;
            }

            var timeoutId = setTimeout(function() {
                refresh();
                logger.status('Waited ' + delay + 'ms without receiving "' + readyEvent + '" from child process. Page refresh triggered over WebSockets connection.');
            }, delay);

            if (childProcess) {
                childProcess.once('message', function(message) {
                    if (message === readyEvent) {
                        clearTimeout(timeoutId);
                        refresh();
                        logger.status('Server is ready. Page refresh triggered over WebSockets connection.');
                    }
                });
            }
        });
    },
};

module.exports = Server;