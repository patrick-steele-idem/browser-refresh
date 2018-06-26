var EventEmitter = require('events').EventEmitter;
var DEFAULT_DELAY = 1500;
var express = require('express');
var nodePath = require('path');

var version = require('../package.json').version;
var browserify = require('browserify');
var async = require('async');
var PassThrough = require('stream').PassThrough;
var open = require('opn');
var fs = require('fs');

function loadClientSrc(server, callback) {
    var port = server.server.address().port;

    var socketioClientSrc = '';
    var clientSrc = '';

    var secure = !!server.secure;

    var http = secure ? require('https') : require('http');

    async.parallel([
            function loadSocketIO(callback) {
                http.get((secure ? 'https' : 'http') + '://localhost:' + port + '/socket.io/socket.io.js',
                    function(res) {
                        res.setEncoding('utf8');
                        res.on('data', function (chunk) {
                            socketioClientSrc += chunk;
                        });
                        res.on('error', function(err) {
                            callback(err);
                        });
                        res.on('end', function () {
                            callback();
                        });
                    })
                    .on('error', function(err) {
                        console.error('Error requesting socket.io.js', err);
                        callback(err);
                    });
            },
            function bundleClient(callback) {
                var b = browserify();
                b.add(nodePath.join(__dirname, 'client/index.js'));
                var out = new PassThrough();
                out
                    .on('data', function(data) {
                        clientSrc += data;
                    })
                    .on('error', function(err) {
                        callback(err);
                    })
                    .on('end', function() {
                        callback();
                    });

                b.bundle().pipe(out);
            }
        ],
        function(err) {
            if (err) {
                return callback(err);
            }

            clientSrc = '(function() { var define = null;var oldIO = window.io; delete window.io;\n' +
                socketioClientSrc +
                '\n\nwindow.browserRefreshIO = window.io; window.io = oldIO; window.browserRefreshPort = ' + port + '; window.browserRefreshSecure = ' + secure + ';\n' +
                clientSrc +
                '\n}());\n';

            callback(null, clientSrc);
        });
}

function Server(config) {
    this.readyEvent = config.readyEvent || 'online';
    this.delay = config.delay == null ? DEFAULT_DELAY : config.delay;
    this.sslCert = config.sslCert;
    this.sslKey = config.sslKey;
    this.secure = (config.sslCert && config.sslKey);
    this.port = config.port;
    this.launcher = config.launcher;
    this.logger = config.logger;
    this.clientSrc = null;
    this.socketEvents = new EventEmitter();

    this.shouldRefreshPage = false;
    this.shouldRefreshStyles = false;
    this.shouldRefreshImages = false;
    this.refreshQueued = false;
}

Server.prototype = {
    _doRefresh: function() {
        this.socketEvents.emit('refresh', {
            refreshPage: this.shouldRefreshPage,
            refreshStyles: this.shouldRefreshStyles,
            refreshImages: this.shouldRefreshImages,
        });

        this.logger.status('Refresh triggered', this);

        this.shouldRefreshPage = false;
        this.shouldRefreshStyles = false;
        this.shouldRefreshImages = false;
        this.refreshQueued = false;

    },

    _queueRefresh: function() {
        if (this.refreshQueued) {
            return;
        }

        var _this = this;

        setTimeout(function() {
            _this._doRefresh();
        }, 20);
    },
    refreshPage: function() {
        this.logger.status('Triggering refresh of client pages...');
        this.shouldRefreshPage = true;
        this._queueRefresh();
    },

    refreshStyles: function() {
        this.logger.status('Triggering refresh of client styles...');
        this.shouldRefreshStyles = true;
        this._queueRefresh();
    },

    refreshImages: function() {
        this.logger.status('Triggering refresh of client images...');
        this.shouldRefreshImages = true;
        this._queueRefresh();
    },

    getPort: function() {
        return this.server.address().port;
    },

    start: function(callback) {
        var _this = this;
        var socketEvents = this.socketEvents;
        var port = this.port;
        var logger = this.logger;
        var firstStart = true;

        var app = express();

        var server;

        if (this.secure) {
            var privateKey = fs.readFileSync(this.sslKey);
            var certificate = fs.readFileSync(this.sslCert);

            server = require('https').createServer({
                key: privateKey,
                cert: certificate
            }, app);
        } else {
            server = require('http').createServer(app);
        }

        this.server = server;

        server.listen(port, callback);

        app.get('/browser-refresh.js', function(req, res) {
            if (req.headers.etag) {
                if (version == req.headers.etag) {
                    res.writeHead(304);
                    res.end();
                    return;
                }
            }


            function done(err) {
                if (err) {
                    res.send(err.toString(), 500);
                    return;
                }

                res.setHeader('Content-Type', 'application/javascript');
                res.setHeader('ETag', version);
                res.writeHead(200);
                res.end(_this.clientSrc);
            }

            if (_this.clientSrc) {
                done();
            } else {
                loadClientSrc(_this, function(err, src) {
                    _this.clientSrc = src;
                    done();
                });
            }
        });

        var io = require('socket.io').listen(server, { log: false });

        var readyEvent = this.readyEvent;
        var delay = this.delay;

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

            function refreshPage() {
                if (refreshed) {
                    return;
                }

                refreshed = true;
                _this.refreshPage();
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

                    refreshPage();
                }, delay);
            }

            if (childProcess) {
                var readyListener = function(message) {
                    if(typeof message === 'object') {
                        var url = message.url;
                        message = message.event;
                    }

                    if (message === readyEvent) {

                        if (timeoutId) {
                            clearTimeout(timeoutId);
                        }

                        if (!firstStart) {
                            logger.status('Server is ready. Page refresh triggered over WebSockets connection.');
                            refreshPage();
                        } else if(url) {
                            logger.status('Server is ready. Launching '+url+'. Watching files for changes.');
                            open(url);
                        } else {
                            logger.status('Server is ready. Watching files for changes.');
                        }

                        firstStart = false;

                        childProcess.removeListener('message', readyListener);
                    }
                };

                childProcess.on('message', readyListener);
            }
        });
    }
};

module.exports = Server;
