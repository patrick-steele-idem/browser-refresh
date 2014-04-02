var port = process.env.BROWSER_REFRESH_PORT;
var enabled = !!port;
var html;

if (enabled) {
    html = '<script src="http://localhost:' + port + '/browser-refresh.js"></script>';
}

exports.render = function(input, context) {
    if (enabled && input.enabled !== false) {
        context.write(html);
    }
};