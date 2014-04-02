var Launcher = require('./Launcher');
var Watcher = require('./Watcher');
var Server = require('./Server');
var Logger = require('./Logger');

var DEFAULT_PORT = 8999;

var fs = require('fs');
var nodePath = require('path');
var cwd = process.cwd();
var Minimatch = require('minimatch').Minimatch;

exports.Launcher = Launcher;

var mmOptions = {
    matchBase: true,
    dot: true,
    flipNegate: true
};

exports.start = function(config) {
    config = config || {};

    var port = config.port = config.port || DEFAULT_PORT;

    var configPath = config.config || 'browser-refresh.json';
    if (fs.existsSync(configPath)) {
        var configFromFile = require(configPath);
        for (var k in configFromFile) {
            if (configFromFile.hasOwnProperty(k) && !config.hasOwnProperty(k)) {
                config[k] = configFromFile[k];
            }
        }
    }

    var ignoreFile = nodePath.join(cwd, '.browser-refresh-ignore');
    if (!fs.existsSync(ignoreFile)) {
        ignoreFile = nodePath.join(cwd, '.gitignore');
        if (!fs.existsSync(ignoreFile)) {
            ignoreFile = null;
        }
    }

    var ignoreRules = [];

    if (ignoreFile) {
        ignoreRules = fs.readFileSync(ignoreFile, {encoding: 'utf8'}).split(/\s*\r?\n\s*/);
    } else {
        ignoreRules = ['/node_modules', '.*', '*.rhtml.js'];
    }

    ignoreRules = ignoreRules.filter(function (s) {
        s = s.trim();
        return s && !s.match(/^#/);
    });

    var logger = new Logger();
    config.logger = logger;
    
    ignoreRules = ignoreRules.map(function (pattern) {
        logger.info('Ignore rule: ' + pattern);
        return new Minimatch(pattern, mmOptions);
    });

    var launcher = new Launcher(config);
    launcher.start();

    new Watcher({
            ignoreRules: ignoreRules,
            logger: logger
        })
        .on('modified', function(eventArgs) {
            // console.log('Modified: ', eventArgs);
            launcher.restart();
        })
        .start();


    var server = new Server({
        launcher: launcher,
        port: port,
        logger: logger
    });

    server.start();

    return launcher;
};