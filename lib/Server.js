var EventEmitter = require('events').EventEmitter;
var DEFAULT_DELAY = 1500;
var express = require('express');
var nodePath = require('path');
var fs = require('fs');
var http = require('http');

function loadClientSrc(port, callback) {
    fs.readFile(
        nodePath.join(__dirname, 'browser-refresh-client.js'),
        'utf8',
        function(err, src) {
            if (err) {
                return callback(err);
            }

            src = src.replace(/PORT/g, port);

            http.get('http://localhost:' + port + '/socket.io/socket.io.js',
                function(res) {
                    var socketioClientSrc = '';
                    res.setEncoding('utf8');
                    res.on('data', function (chunk) {
                        socketioClientSrc += chunk;
                    });
                    res.on('end', function (chunk) {
                        src = src.replace(/\/\*CLIENT_SRC\*\//, function() {
                            return socketioClientSrc;
                        });
                        callback(null, src);
                    });
                })
                .on('error', function(err) {
                    callback(err);
                });
        });
}

function Server(config) {
    this.readyEvent = config.readyEvent || 'online';
    this.delay = config.delay == null ? DEFAULT_DELAY : config.delay;
    this.port = config.port;
    this.launcher = config.launcher;
    this.logger = config.logger;
    this.clientSrc = null;
    this.socketEvents = new EventEmitter();
}

Server.prototype = {
    emitRefresh: function() {
        this.socketEvents.emit('refresh', {});
    },

    getPort: function() {
        return this.server.address().port;
    },

    start: function(callback) {
        var _this = this;
        var socketEvents = this.socketEvents;
        var port = this.port;
        var logger = this.logger;

        var app = express();
        var server = this.server = app.listen(port, callback);
        app.get('/browser-refresh.js', function(req, res) {
            function done(err) {
                if (err) {
                    res.send(err.toString(), 500);
                    return;
                }
                res.header("cache-control", "public, max-age=31556926"); // 1yr in seconds.
                res.header("expires", new Date(Date.now() + 3.15569e10).toUTCString());  // in ms.
                res.header('content-type', 'application/x-javascript');
                res.end(_this.clientSrc);
            }

            if (_this.clientSrc) {
                done();
            } else {
                loadClientSrc(server.address().port, function(err, src) {
                    _this.clientSrc = src;
                    done();
                });
            }
        });

        var io = require('socket.io').listen(server, { log: false });

        var readyEvent = this.readyEvent;
        var delay = this.delay;
        var firstStart = true;

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
                firstStart = false;
                if (refreshed) {
                    return;
                }

                refreshed = true;
                socketEvents.emit('refresh', {});
            }

            var childProcess;
            var timeoutId;

            if (eventArgs) {
                childProcess = eventArgs.childProcess;
            }

            if (delay > 0) {
                timeoutId = setTimeout(function() {

                    logger.status('Waited ' + delay + 'ms without receiving "' + readyEvent +
                        '" from child process. Page refresh triggered over WebSockets connection.');

                    refresh();
                }, delay);
            }

            if (childProcess) {
                var readyListener = function(message) {
                    if (message === readyEvent) {

                        if (timeoutId) {
                            clearTimeout(timeoutId);
                        }


                        if (firstStart) {
                            logger.status('Server is ready. Watching files for changes.');
                        } else {
                            logger.status('Server is ready. Page refresh triggered over WebSockets connection.');
                        }

                        refresh();

                        childProcess.removeListener('message', readyListener);
                    }
                };

                childProcess.on('message', readyListener);
            }
        });
    }
};

module.exports = Server;