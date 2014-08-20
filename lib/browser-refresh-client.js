(function() {
    var define = null;

    /*CLIENT_SRC*/

    var socket = window.io.connect('http://localhost:PORT');
    socket.on('refresh', function (data) {
        location.reload();
    });
}()); 