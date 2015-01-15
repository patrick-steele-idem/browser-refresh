var EventEmitter = require('events').EventEmitter;
var child_process = require('child_process');
var extend = require('raptor-util').extend;
var assert = require('assert');

function Launcher(config) {
    Launcher.$super.call(this);
    this.childProcess = null;
    this.config = config;
    this.logger = config.logger;
    this.state = 'stopped';
    this.port = null;
}

Launcher.prototype = {
    emitModified: function(path, replyEvents) {
        var childProcess = this.childProcess;

        if (childProcess && childProcess.send) {

            if (replyEvents && replyEvents.length) {
                replyEvents.forEach(function(replyEvent) {
                    childProcess.send({
                        type: replyEvent,
                        path: path
                    });
                });
            }

            childProcess.send({
                type: 'browser-refresh.fileModified',
                path: path
            });

        }
    },

    fork: function() {
        var port = this.port;
        assert.ok(port, 'Server port not available');
        var env = extend({}, process.env);
        env.BROWSER_REFRESH_PORT = this.port.toString();
        env.BROWSER_REFRESH_URL = 'http://localhost:' + port + '/browser-refresh.js';

        this.childProcess = child_process.fork(this.config.script, this.config.args, {
            cwd: process.cwd(),
            env: env
        });

        this.state = 'started';


        this.emit('start', {
            childProcess: this.childProcess
        });

        this.logger.status('App started (pid: ' + this.childProcess.pid + ')');

        this.childProcess.once('exit', function() {
            if (this.state !== 'killing') {
                console.log('App stopped unexpectedly');
            }

            this.childProcess = null;
        }.bind(this));

        process.on('exit', function() {
            this.kill();
        }.bind(this));
    },

    kill: function() {
        if (this.state === 'killing' || this.state === 'stopped') {
            return;
        }

        if (this.childProcess) {
            if (this.childProcess.connected) {
                this.state = 'killing';
                this.childProcess.kill();
            }
        }
    },

    restart: function() {
        if (this.state === 'killing') {
            return;
        }

        if (this.childProcess) {
            this.logger.status('Restarting app...');
            this.childProcess.once('exit', function() {
                this.state = 'stopped';
                this.fork();
            }.bind(this));

            this.kill();
        } else {
            this.fork();
        }
    },

    start: function(port) {
        this.port = port;
        this.restart();
    }
};

require('raptor-util').inherit(Launcher, EventEmitter);

module.exports = Launcher;