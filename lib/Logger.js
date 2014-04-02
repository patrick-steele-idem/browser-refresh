require('colors');

var colorMappings = {
    log: null,
    info: 'yellow',
    status: 'green',
    detail: 'yellow',
    fail: 'red',
    error: 'red'
};

function Logger() {
}

Logger.prototype = {
    _log: function(type, message) {
        message = '[browser-refresh] ' + message;

        var color = colorMappings[type];
        if (color) {
            message = message[color];
        }

        console.log(message);
    },
    status: function(message) {
        this._log('status', message);
    },
    info: function(message) {
        this._log('info', message);
    }
};

module.exports = Logger;