var EventEmitter = require('events').EventEmitter;
var child_process = require('child_process');
var extend = require('raptor-util').extend;

function Launcher(config) {
    Launcher.$super.call(this);
    this.childProcess = null;
    this.config = config;
    this.logger = config.logger;
}

Launcher.prototype = {
    fork: function() {
        var env = extend({}, process.env);
        env.BROWSER_REFRESH_PORT = this.config.port.toString();
        this.childProcess = child_process.fork(this.config.script, this.config.args, {
            cwd: process.cwd(),
            env: env
        });

        this.emit('start', {
            childProcess: this.childProcess
        });

        this.logger.status('App started (pid: ' + this.childProcess.pid + ')');
    },

    restart: function() {
        if (this.childProcess) {
            if (this.childProcess.connected) {
                this.logger.status('Restarting app...');
                this.childProcess.once('exit', function() {
                    this.fork();
                }.bind(this));
                this.childProcess.kill();    
            }
        } else {
            this.fork();
        }
    },

    start: function() {
        this.restart();
    },
};

require('raptor-util').inherit(Launcher, EventEmitter);

module.exports = Launcher;