var EventEmitter = require('events').EventEmitter;
var DEFAULT_DELAY = 1000;
var express = require('express');
var nodePath = require('path');
var fs = require('fs');
var http = require('http');

function loadClientSrc(port, callback) {
    fs.readFile(nodePath.join(__dirname, 'browser-refresh-client.js'), { encoding: 'utf8' }, function(err, src) {
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
}

Server.prototype = {
    start: function() {
        var _this = this;
        var port = this.port;
        var logger = this.logger;

        var app = express();
        var server = app.listen(port);
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
                loadClientSrc(port, function(err, src) {
                    _this.clientSrc = src;
                    done();
                });
            }

        });

        var io = require('socket.io').listen(server, { log: false });

        var readyEvent = this.readyEvent;
        var delay = this.delay;

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

            if (delay > 0) {
                var timeoutId = setTimeout(function() {
                    refresh();
                    logger.status('Waited ' + delay + 'ms without receiving "' + readyEvent + '" from child process. Page refresh triggered over WebSockets connection.');
                }, delay);
            }

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