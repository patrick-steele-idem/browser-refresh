var Launcher = require('./Launcher');
var Watcher = require('./Watcher');
var Server = require('./Server');
var Logger = require('./Logger');

var DEFAULT_PORT = 8999;

var fs = require('fs');
var nodePath = require('path');
var cwd = process.cwd();
var Minimatch = require('minimatch').Minimatch;
var jsonminify = require("jsonminify");

exports.Launcher = Launcher;

var mmOptions = {
    matchBase: true,
    dot: true,
    flipNegate: true
};

exports.start = function(config) {
    config = config || {};

    var port = config.port = config.port || DEFAULT_PORT;

    var configPath = config.config || '.browser-refresh';
    if (typeof configPath === 'string') {
        configPath = nodePath.resolve(process.cwd(), configPath);

        if (fs.existsSync(configPath)) {
            var json = jsonminify(fs.readFileSync(configPath, 'utf8'));
            var configFromFile = JSON.parse(json);
            for (var k in configFromFile) {
                if (configFromFile.hasOwnProperty(k) && !config.hasOwnProperty(k)) {
                    config[k] = configFromFile[k];
                }
            }
        }
    }

    var ignoreRules = [];

    if (config.ignore) {
        if (Array.isArray(config.ignore)) {
            ignoreRules = ignoreRules.concat(config.ignore);
        } else {
            ignoreRules = ignoreRules.concat(config.ignore.split(' '));
        }
    } else {
        var ignoreFile = nodePath.join(cwd, '.browser-refresh-ignore');
        if (!fs.existsSync(ignoreFile)) {
            ignoreFile = nodePath.join(cwd, '.gitignore');
            if (!fs.existsSync(ignoreFile)) {
                ignoreFile = null;
            }
        }

        if (ignoreFile) {
            ignoreRules = fs.readFileSync(ignoreFile, {encoding: 'utf8'}).split(/\s*\r?\n\s*/);
        } else {
            ignoreRules = ['/node_modules', '.*', '*.marko.js', '*.dust.js', '*.coffee.js', '/static'];
        }

        ignoreRules = ignoreRules.filter(function (s) {
            s = s.trim();
            return s && !s.match(/^#/);
        });
    }

    var logger = new Logger();
    config.logger = logger;

    ignoreRules = ignoreRules.map(function (pattern) {
        logger.info('Ignore rule: ' + pattern);
        return new Minimatch(pattern, mmOptions);
    });

    var launcher = new Launcher(config);

    var specialReload = [];

    launcher.on('start', function (eventArgs) {
        var childProcess = eventArgs.childProcess;
        childProcess.on('message', function(eventArgs) {
            if (typeof eventArgs === 'object' && eventArgs.type === 'browser-refresh.specialReload') {
                var patterns = eventArgs.patterns || eventArgs.pattern;
                var modifiedEvent = eventArgs.modifiedEvent;

                var matchRules;

                if (typeof patterns === 'string') {
                    patterns = patterns.split(/\s+/);
                }

                if (patterns && patterns.length) {
                    matchRules = patterns.map(function(pattern) {
                        var minimatch = new Minimatch(pattern, mmOptions);

                        return {
                            test: function(arg) {
                                var relativePath = arg.relativePath;
                                var match = minimatch.match(relativePath);
                                if (!match && arg.isDirectory) {
                                    match = minimatch.match(relativePath + '/');
                                }

                                return match;
                            },
                            modifiedEvent: modifiedEvent
                        };
                    });

                    specialReload = specialReload.concat(matchRules);
                }
            }
        });
    });

    launcher.start();

    var server = new Server({
        launcher: launcher,
        port: port,
        logger: logger,
        delay: config.delay
    });

    var watchList = config.watch || [process.cwd()];
    watchList.forEach(function(dir) {
        logger.info('Watching: ' + dir);
        new Watcher({
                ignoreRules: ignoreRules,
                logger: logger,
                dir: dir
            })
            .on('modified', function(eventArgs) {
                var path = eventArgs.path;
                var relativePath = path;

                if (relativePath.startsWith(dir)) {
                    relativePath = relativePath.substring(dir.length);
                }

                relativePath = relativePath.replace(/\\/g, '/');

                var stat;
                var isDirectory = false;

                try {
                    stat = fs.statSync(path);
                    isDirectory = stat.isDirectory();
                } catch(e) {}

                var specialReloadArg = {
                    path: path,
                    relativePath: relativePath,
                    isDirectory: isDirectory
                };

                var special = false;

                var replyEvents = [];

                for (var i=0; i<specialReload.length; i++) {
                    var specialReloadRule = specialReload[i];
                    if (specialReloadRule.test(specialReloadArg)) {
                        special = true;
                        if (specialReloadRule.modifiedEvent) {
                            replyEvents.push(specialReloadRule.modifiedEvent);
                        }
                    }
                }

                if (special) {
                    logger.info('Special reload: ' + nodePath.relative(dir, path));
                    launcher.emitModified(path, replyEvents);

                    setTimeout(function() {
                        server.emitRefresh();
                    }, 10);
                } else {
                    launcher.restart();
                }
            })
            .start();
    });



    server.start();

    return launcher;
};