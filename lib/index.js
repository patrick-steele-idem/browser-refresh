require('raptor-polyfill/string/startsWith');

var Launcher = require('./Launcher');
var ignoringWatcher = require('ignoring-watcher');
var Server = require('./Server');
var Logger = require('./Logger');

var DEFAULT_PORT = 0;

var fs = require('fs');
var nodePath = require('path');
var cwd = process.cwd();
var Minimatch = require('minimatch').Minimatch;
var jsonminify = require("jsonminify");

var eventMessages = {
    add: 'File has been added: $path',
    addDir: 'Directory has been added: $path',
    change: 'File has been changed: $path',
    unlink: 'File has been removed: $path',
    unlinkDir: 'Directory has been removed: $path'
};

var DEFAULT_IGNORES = [
    'node_modules/',
    'static/',
    '.cache/',
    '.*',
    '*.marko.js',
    '*.dust.js',
    '*.coffee.js'
];

exports.Launcher = Launcher;

var mmOptions = {
    matchBase: true,
    dot: true,
    flipNegate: true
};

exports.start = function(config) {
    config = config || {};



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

    var port = config.port = config.port || DEFAULT_PORT;

    var logger = new Logger();
    config.logger = logger;

    var launcher = new Launcher(config);

    var specialReload = [];

    launcher.on('start', function (eventArgs) {
        var childProcess = eventArgs.childProcess;
        childProcess.on('message', function(eventArgs) {
            var modifiedEvent;

            if (typeof eventArgs === 'object') {

                if (eventArgs.type === 'browser-refresh.specialReload') {
                    var patterns = eventArgs.patterns || eventArgs.pattern;
                    modifiedEvent = eventArgs.modifiedEvent;
                    var options = eventArgs.options;

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
                                }
                            };
                        });

                        specialReload.push({
                            test: function(arg) {
                                for (var i=0; i<matchRules.length; i++) {
                                    if (matchRules[i].test(arg)) {
                                        return true;
                                    }
                                }
                                return false;
                            },
                            modifiedEvent: modifiedEvent,
                            options: options
                        });
                    }
                } else if (eventArgs.type === 'browser-refresh.removeSpecialReload') {

                    modifiedEvent = eventArgs.modifiedEvent;

                    specialReload = specialReload.filter(function(currentSpecialReload) {
                        return currentSpecialReload.modifiedEvent !== modifiedEvent;
                    });
                } else if (eventArgs.type === 'browser-refresh.refreshImages') {
                    server.refreshImages();
                } else if (eventArgs.type === 'browser-refresh.refreshStyles') {
                    server.refreshStyles();
                } else if (eventArgs.type === 'browser-refresh.refreshPage') {
                    server.refreshPage();
                }
            }
        });
    });

    var server = new Server({
        launcher: launcher,
        port: port,
        logger: logger,
        delay: config.delay,
        sslCert: config.sslCert,
        sslKey: config.sslKey
    });

    var watcher = ignoringWatcher.createWatcher({
        ignorePatterns: config.ignore || config.ignorePatterns,
        ignoreFile: config.ignoreFile,
        dirs: config.watch,
        selectIgnoreFile: [
            nodePath.join(cwd, '.browser-refresh-ignore'),
            nodePath.join(cwd, '.gitignore')
        ],
        defaultIgnorePatterns: DEFAULT_IGNORES,
        usePolling: config.usePolling
    });

    watcher
        .on('ready', function(eventArgs) {
            eventArgs.dirs.forEach(function(dir) {
                logger.info('Watching: ' + dir);
            });

            eventArgs.ignorePatterns.forEach(function(pattern) {
                logger.info('Ignore rule: ' + pattern);
            });
        })
        .on('modified', function(eventArgs) {
            var event = eventArgs.event;
            var path = eventArgs.path;
            var baseDir = eventArgs.baseDir;

            logger.status((eventMessages[event] || eventMessages.change)
                .replace(/\$path/, nodePath.relative(baseDir, path)));

            var relativePath = path;

            if (relativePath.startsWith(baseDir)) {
                relativePath = relativePath.substring(baseDir.length);
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
            var autoRefresh = null;

            if (launcher.isStarted()) {
                // Apply handle special reloaders if the child process is actually running...
                for (var i=0; i<specialReload.length; i++) {
                    if (specialReload[i].test(specialReloadArg)) {
                        var modifiedEvent = specialReload[i].modifiedEvent;
                        var options = specialReload[i].options;

                        special = true;
                        if (modifiedEvent) {
                            replyEvents.push(modifiedEvent);
                        }

                        if (options && options.autoRefresh != null) {
                            if (autoRefresh == null) {
                                autoRefresh = options.autoRefresh;
                            }
                        }
                    }
                }
            }

            if (special) {
                logger.info('Special reload: ' + relativePath);
                launcher.emitModified(path, replyEvents);

                if (autoRefresh !== false) {
                    setTimeout(function() {
                        server.refreshPage();
                    }, 10);
                }
            } else {
                launcher.restart();
            }
        })
        .startWatching();

    server.start(function(err) {
        launcher.start(server.getPort());
    });

    return launcher;
};