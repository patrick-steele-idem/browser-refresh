(function() {
    var connected = false;
    function connect() {
        if (connected) return;
        connected = true;
        var socket = window.io.connect('http://localhost:PORT');
        socket.on('refresh', function (data) {
            location.reload();
        });
    }

    if (window.io) {
        connect();
    } else {
        var head = document.getElementsByTagName('head')[0];
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.onreadystatechange= function () {
            if (this.readyState == 'complete' || this.readyState == 'loaded') connect();
        };
        script.onload = connect;

        script.src = 'http://localhost:PORT/socket.io/socket.io.js';
        head.appendChild(script);
    }
}()); 