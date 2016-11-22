browser-refresh
===============
This module improves productivity by enabling instant web page refreshes anytime a front-end resource is modified on the server. This module supports live reloading of CSS and JavaScript without doing a full page refresh. This module utilizes the very efficient [chokidar](https://github.com/paulmillr/chokidar) module for watching for changes to the file system. Web sockets are used to communicate with the browser.  Minimal application code changes are required to benefit from this module.

# Overview

Like `nodemon`, this module provides a drop-in replacement for the `node` command.

Compared to [nodemon](https://github.com/remy/nodemon), the `browser-refresh` module has the following benefits:

* It starts as a web sockets server and provides a web sockets client
* It sets an environment variable for the spawned child process to let it know that it was launched using `browser-refresh`
* Instead of configuring which directories/files to watch, you instead configure which directories/files to _not_ watch using an optional `.browser-refresh-ignore` file (same format as `.gitignore` and `.npmignore`).
* There is an optional taglib for [Marko](https://github.com/marko-js/marko) and [Dust](https://github.com/linkedin/dustjs) that injects the `browser-refresh` [client](https://github.com/patrick-steele-idem/browser-refresh/blob/master/lib/browser-refresh-client.js) if the application was launched using `browser-refresh`. Please see: [browser-refresh-taglib](https://github.com/patrick-steele-idem/browser-refresh-taglib)
* The `browser-refresh` process waits for the child process to tell it that it is ready to start serving traffic so that the web browser page is not refreshed too soon. This is done by the child process using `process.send('online')`

File patterns to ignore are automatically loaded from the first file that
exists in the following list:

0. `.browser-refresh-ignore` file in the current working directory
1. `.gitignore` file in the current working directory

If no ignore file is found then the following ignore file patterns are used:

```
node_modules/
static/
.cache/
.*
*.marko.js
*.dust.js
*.coffee.js
```

**NOTE:**

Patterns to ignore files with a directory should have `/` at the end.
For example, to ignore `node_modules` directory use `node_modules/`.

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

Alternatively, pass an object that specifies a `url` for `browser-refresh` to launch the first time your app starts:
```javascript
if (process.send) {
    process.send({ event:'online', url:'http://localhost:8080/' });
}
```

Finally, add the following script to your page(s).  Just before the closing `</body>` tag is a good place.

```html
'<script src="{process.env.BROWSER_REFRESH_URL}"></script>'
```

> When `browser-refresh` launches your app a new `BROWSER_REFRESH_URL` environment variable is added with the URL that should be used to include the client-side script. The value of `BROWSER_REFRESH_URL` will be similar to `http://localhost:12345/browser-refresh.js` (the port is random).  You should use whatever means your templating language or UI library provides to add the script to your page(s).

**If you're using [Marko](https://github.com/marko-js/marko),** checkout [`browser-refresh-taglib`](https://github.com/patrick-steele-idem/browser-refresh-taglib) which allows you to simply drop the following tag into your template instead of using the above `<script>` tag:
```html
<browser-refresh/>
```

## Configuration

Some of the features of the `browser-refresh` module can be configured by creating
a `.browser-refresh` JSON configuration file at the root of your project.

### SSL Support

To enable SSL support you must provide values `sslCert` and `sslKey`
in your `.browser-refresh` configuration file.

- `sslCert`: The path to a SSL certificate
- `sslKey`: The path to a SSL key

**Example:**

```json
{
    "sslCert": "server.crt",
    "sslKey": "server.key"
}
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

# Controlling Reloading

By default, this module does _not_ try to be clever when handling a file modification. That is, by default, a full server restart and a full web page refresh are used whenever any type of file is modified on the server. This ensures that the server state and the client-side page state will always be correct and avoids frustrating edge cases. However, the `browser-refresh` module allows for modules to register "special reload" handlers that can short-circuit a full server restart. To disable a full server restart for a particular file pattern, the child process needs to send a message to the `browser-refresh` launcher process using the [browser-refresh-client](https://github.com/patrick-steele-idem/browser-refresh-client) module.

For example, to enable special reloading, the following code can be used:

```javascript
require('browser-refresh-client')
    .enableSpecialReload('*.foo *.bar')
    .onFileModified(function(path) {
        // Handle the modification of either a *.foo file or
        // a *.bar file...
    });
```

Both the [marko](https://github.com/marko-js/marko) and [lasso](https://github.com/lasso-js/lasso) modules provide support for enabling special reload handlers when using the `browser-refresh` module. Example usage:

```javascript
require('marko/browser-refresh').enable();
require('lasso/browser-refresh').enable('*.marko *.css *.less *.styl *.scss *.sass *.png *.jpeg *.jpg *.gif *.webp *.svg');
```

To add your own special reload handlers for the `browser-refresh` module, please use the following code as a guide:

- [marko/browser-refresh/index.js](https://github.com/marko-js/marko/blob/master/browser-refresh/index.js)
- [lasso/browser-refresh/index.js](https://github.com/lasso-js/lasso/blob/master/browser-refresh/index.js)

# Refreshing CSS and Images

For improved developer productivity, this module supports refreshing of CSS and images without doing a full page refresh (similar to LiveReload). This is an opt-in feature that can be enabled using code similar to the following:

```javascript
var patterns = '*.css *.less *.styl *.scss *.sass *.png *.jpeg *.jpg *.gif *.webp *.svg';

require('browser-refresh-client')
    .enableSpecialReload(patterns, { autoRefresh: false })
    .onFileModified(function(path) {
        // Code to handle the file modification goes here.

        // Now trigger a refresh when we are ready:
        if (isImage(path)) {
            browserRefreshClient.refreshImages();
        } else if (isStyle(path)) {
            browserRefreshClient.refreshStyles();
        } else {
            browserRefreshClient.refreshPage();
        }
    });
```

If you are using `require('lasso/browser-refresh').enable(patterns)`, it is doing this for you automatically. Please see: [lasso/browser-refresh/index.js](https://github.com/lasso-js/lasso/blob/master/browser-refresh/index.js)

# Passing arguments to `node`

Any flags (arguments that start with `-`) before the script path will be passed to the node executable:

```
browser-refresh --debug index.js
```

# Maintainers

* Patrick Steele-Idem ([Github: @patrick-steele-idem](http://github.com/patrick-steele-idem)) ([Twitter: @psteeleidem](http://twitter.com/psteeleidem))
* Phillip Gates-Idem ([Github: @philidem](http://github.com/philidem)) ([Twitter: @psteeleidem](http://twitter.com/philidem))

# Contribute

Pull requests, bug reports and feature requests welcome.

# License

ISC
