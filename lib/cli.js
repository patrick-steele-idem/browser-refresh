process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var nodePath = require('path');

var argv = process.argv.slice(2);
var args;
var execArgs;
var script;
var scriptIndex;

if(argv.length) {
    for(var i = 0; i < argv.length; i++) {
        if(argv[i][0] !== '-') {
            scriptIndex = i;
            break;
        }
        if(argv[i] === '-r' || argv[i] === '--require') {
            i++; // these flags take an additional argument. skip it.
        }
    }
}

if(scriptIndex != null) {
    script = argv[scriptIndex];
    execArgs = argv.slice(0, scriptIndex);
    args = argv.slice(scriptIndex+1);
} else {
    var pkg = require(nodePath.join(process.cwd(), 'package.json'));
    script = pkg.main || 'index.js';
    execArgs = argv || [];
    args = [];
}

script = nodePath.resolve(process.cwd(), script);

require('../lib/index').start({
    script: script,
    execArgs: execArgs,
    args: args
});
