var nodePath = require('path');

var argv = process.argv.slice(2);
var args;
var script;

if (argv.length) {
    args = argv.slice(1);
    script = argv[0];
} else {
    var pkg = require(nodePath.join(process.cwd(), 'package.json'));
    args = [];
    script = pkg.main || 'index.js';
}

script = nodePath.resolve(process.cwd(), script);

require('../lib/index').start({
    script: script,
    args: args
});