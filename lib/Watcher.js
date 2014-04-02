var chokidar = require('chokidar');
var EventEmitter = require('events').EventEmitter;
var fs = require('fs');

require('raptor-ecma/es6');

var events = {
    add: 'File "$path" has been added',
    addDir: 'Directory "$path" has been added',
    change: 'File "$path" has been changed',
    unlink: 'File "$path" has been removed',
    unlinkDir: 'Directory "$path" has been removed'
};


function Watcher(config) {
    Watcher.$super.call(this);
    
    this.logger = config.logger;

    var dir = this.dir = config.dir || process.cwd();

    var ignoreRules = config.ignoreRules || [];
    var ignoreRulesLength = ignoreRules.length;

    if (!ignoreRulesLength) {
        this.ignored = function(path) {
            return false; // Everything is included
        };
    } else {
        this.ignored = function(path, stat) {
            if (!stat) {
                return false;
            }

            if (path.startsWith(dir)) {
                path = path.substring(dir.length);
            }

            path = path.replace(/\\/g, '/');

            var ignore = false;

            for (var i=0; i<ignoreRulesLength; i++) {
                var rule = ignoreRules[i];
                
                var match = rule.match(path);
                
                if (!match && stat && stat.isDirectory()) {
                    try {
                        stat = fs.statSync(path);
                    } catch(e) {}

                    if (stat && stat.isDirectory()) {
                        match = rule.match(path + '/');
                    }    
                }
                

                if (match) {
                    if (rule.negate) {
                        ignore = false;
                    } else {
                        ignore = true;
                    }
                }
            }

            return ignore;
        };
    }
    
}

Watcher.prototype = {
    start: function() {
        var _this = this;
        var logger = this.logger;
        var dir = this.dir;

        var watcher = chokidar.watch(
            this.dir || process.cwd(),
            {
                ignored: this.ignored,
                persistent: true,
                ignoreInitial: true
            });
        
        Object.keys(events).forEach(function(event) {
            watcher.on(event, function(path) {
                if (path.startsWith(dir)) {
                    path = path.substring(dir.length);
                }

                logger.status(events[event].replace(/\$path/, path));
                _this.emit('modified', {
                    type: event,
                    path: path
                });
            });
        });

    }
};

require('raptor-util').inherit(Watcher, EventEmitter);

module.exports = Watcher;