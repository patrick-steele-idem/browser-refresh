browser-refresh
===============
This module improves productivity by enabling instant web page refreshes anytime a front-end resource is modified on the server. This module utilizes the very efficient [chokidar](https://github.com/paulmillr/chokidar) module for watching for changes to the file system. Web sockets are used to communicate with the browser. Minimal application code changes are required to benefit from this module.

# Overview

Like nodemon, this module provides a drop-in replacement for the `node` command.

Compared to [nodemon](https://github.com/remy/nodemon), the browser-refresh has the following benefits:

* It starts as a web sockets server and provides a web sockets client
* It sets an environment variable for the spawned child process to let it know that it was launched using `browser-refresh`
* Instead of configuring which directories/files to watch, you instead configure which directories/files to _not_ watch using an optional `.browser-refresh-ignore` file (same format as `.gitignore` and `.npmignore`). Default ignores:

    ```
    /node_modules
    .*
    *.rhtml.js
    *.dust.js
    *.coffee.js
    ```

* There is an optional taglib for [Raptor Templates](https://github.com/raptorjs3/raptor-templates) and [Dust](https://github.com/linkedin/dustjs) that injects the `browser-refresh` [client](https://github.com/patrick-steele-idem/browser-refresh/blob/master/lib/browser-refresh-client.js) if the application was launched using `browser-refresh`. Please see: [browser-refresh-taglib](https://github.com/patrick-steele-idem/browser-refresh-taglib)
* The `browser-refresh` process waits for the child process to tell it that it is ready to start serving traffic so that the web browser page is not refreshed too soon. This is done by the child process using `process.sendMessage('online')`

# Installation

First, install the global command line interface for the `browser-refresh` module:

```bash
npm install browser-refresh -g
```

Add the following code snippet to the appropriate location based on when your application is ready to start serving traffic:

```javascript
if (process.send) {
    process.send('online');
}
```

For example:

```javascript
app.listen(port, function() {
    console.log('Listening on port %d', port);

    if (process.send) {
        process.send('online');
    }
});
```

Then, in your project install the taglib to be used with either [Raptor Templates](https://github.com/raptorjs3/raptor-templates) or [Dust](https://github.com/linkedin/dustjs):

```bash
npm install browser-refresh-taglib --save
```

Finally, update your page template based on the templating language that you are using:

_For Raptor Templates:_

```html
<!doctype html>
<html>
    <head>
        ...
    </head>
    <body>
        ...

        <browser-refresh enabled="true" />
    </body>
</html>
```

_For Dust:_

```html
<!doctype html>
<html>
    <head>
        ...
    </head>
    <body>
        ...

        {@browser-refresh enabled="true" /}
    </body>
</html>
```

If you are using, Dust, you will also need to add the following code to enable the provided Dust helper:

```javascript
var dust = require('dustjs-linkedin');
require('browser-refresh-taglib/dust').registerHelpers(dust);
```

# Usage

Once you have installed `browser-refresh` using the directions provided above, you can then start your application as normal, except replace `node` with `browser-refresh`. For example:

```bash
# Old: node server.js
# New:
browser-refresh server.js
```

If the `main` property is configured correctly in your application's `package.json` then you can simply start your application using the following command:

```bash
browser-refresh
```

The `browser-refresh` command will pass all command line arguments to the child process. Therefore, you can pass any number of arguments to your application:

```bash
browser-refresh server.js --foo --bar
```

After launching your application using the `browser-refresh` command, you can then load any web page as normal. If the `<browser-refresh>` tag (or `{@browser-refresh/}` helper) were used then any time a resoure is modified then the application will be restarted and, then, when the server is ready a message will be sent to all of the connected browsers via a web socket connection to trigger a reload of the same web page.

# Other Considerations

This module does _not_ try to be clever when refreshing a page. A full page reload is always used whenever any type of file is modified on the server. This ensures that the page state will always be correct and avoids frustrating edge cases.

# Maintainers

* Patrick Steele-Idem ([Github: @patrick-steele-idem](http://github.com/patrick-steele-idem)) ([Twitter: @psteeleidem](http://twitter.com/psteeleidem))

# Contribute

Pull requests, bug reports and feature requests welcome.

# License

ISC
