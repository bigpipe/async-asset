'use strict';

/**
 * Representation of one single file that will be loaded.
 *
 * @constructor
 * @param {String} url The file URL.
 * @param {Function} fn Optional callback.
 * @api private
 */
function File(url, fn) {
  if (!(this instanceof File)) return new File(url, fn);

  this.readyState = File.LOADING;
  this.start = +new Date();
  this.callbacks = [];
  this.dependent = 0;
  this.cleanup = [];
  this.url = url;

  if ('function' === typeof fn) {
    this.add(fn);
  }
}

//
// The different readyStates for our File class.
//
File.DEAD     = -1;
File.LOADING  = 0;
File.LOADED   = 1;

/**
 * Added cleanup hook.
 *
 * @param {Function} fn Clean up callback
 * @api public
 */
File.prototype.unload = function unload(fn) {
  this.cleanup.push(fn);
  return this;
};

/**
 * Add a new dependent.
 *
 * @param {Function} fn Completion callback.
 * @returns {Boolean} Callback successfully added or queued.
 * @api private
 */
File.prototype.add = function add(fn) {
  if (File.LOADING === this.readyState) {
    this.callbacks.push(fn);
  } else if (File.LOADED === this.readyState) {
    fn();
  } else {
    return false;
  }

  this.dependent++;
  return true;
};

/**
 * Remove a dependent. If all dependent's are removed we will automatically
 * destroy the loaded file from the environment.
 *
 * @returns {
 * @api private
 */
File.prototype.remove = function remove() {
  if (0 === --this.dependent) {
    this.destroy();
    return true;
  }

  return false;
};

/**
 * Execute the callbacks.
 *
 * @param {Error} err Optional error.
 * @api public
 */
File.prototype.exec = function exec(err) {
  this.readyState = File.LOADED;

  if (!this.callbacks.length) return this;
  for (var i = 0; i < this.callbacks.length; i++) {
    this.callbacks[i].apply(this.callbacks[i], arguments);
  }

  this.callbacks.length = 0;
  if (err) this.destroy();

  return this;
};

/**
 * Destroy the file.
 *
 * @api public
 */
File.prototype.destroy = function destroy() {
  this.exec(new Error('Resource has been destroyed before it was loaded'));

  if (this.cleanup.length) for (var i = 0; i < this.cleanup.length; i++) {
    this.cleanup[i]();
  }

  this.readyState = File.DEAD;
  this.cleanup.length = this.dependent = 0;

  return this;
};

/**
 * Asynchronously load JavaScript and Stylesheets.
 *
 * Options:
 *
 * - document: Document where elements should be created from.
 * - prefix: Prefix for the id that we use to poll for stylesheet completion.
 * - timeout: Load timeout.
 * - onload: Stylesheet onload supported.
 *
 * @constructor
 * @param {HTMLElement} root The root element we should append to.
 * @param {Object} options Configuration.
 * @api public
 */
function AsyncAsset(root, options) {
  if (!(this instanceof AsyncAsset)) return new AsyncAsset(root, options);
  options = options || {};

  this.document = 'document' in options ? options.document : document;
  this.prefix = 'prefix' in options ? options.prefix : 'pagelet_';
  this.timeout = 'timeout' in options ? options.timeout : 30000;
  this.onload = 'onload' in options ? options.onload : null;
  this.root = root || this.document.head || this.document.body;

  this.sheets = [];   // List of active stylesheets.
  this.files = {};    // List of loaded or loading files.
  this.meta = {};     // List of meta elements for polling.

  if (null === this.onload) {
    this.feature();
  }
}

/**
 * Remove a asset.
 *
 * @param {String} url URL we need to load.
 * @returns {AsyncAsset}
 * @api public
 */
AsyncAsset.prototype.remove = function remove(url) {
  var file = this.files[url];

  if (!file) return this;

  //
  // If we are fully removed, just nuke the reference.
  //
  if (file.remove()) {
    delete this.files[url];
  }

  return this;
};

/**
 * Load a new asset.
 *
 * @param {String} url URL we need to load.
 * @param {Function} fn Completion callback.
 * @returns {AsyncAsset}
 * @api public
 */
AsyncAsset.prototype.add = function add(url, fn) {
  if (this.progress(url, fn)) return this;
  if ('js' === this.type(url)) return this.script(url, fn);
  if ('css' === this.type(url)) return this.style(url, fn);

  throw new Error('Unsupported file type');
};

/**
 * Check if the given URL has already loaded or is currently in progress of
 * being loaded.
 *
 * @param {String} url URL that needs to be loaded.
 * @returns {Boolean} The loading is already in progress.
 * @api private
 */
AsyncAsset.prototype.progress = function progress(url, fn) {
  if (!(url in this.files)) return false;
  return this.files[url].add(fn);
};

/**
 * Trigger the callbacks for a given URL.
 *
 * @param {String} url URL that has been loaded.
 * @param {Error} err Optional error argument when shit fails.
 * @api private
 */
AsyncAsset.prototype.callback = function callback(url, err) {
  var file = this.files[url]
    , meta = this.meta[url];

  if (!file) return;

  file.exec(err);

  if (err) delete this.files[url];
  if (meta) {
    meta.parentNode.removeChild(meta);
    delete this.meta[url];
  }
};

/**
 * Determine the file type for a given URL.
 *
 * @param {String} url File URL.
 * @returns {String} The extension of the URL.
 * @api private
 */
AsyncAsset.prototype.type = function type(url) {
  return url.split('.').pop().toLowerCase();
};

/**
 * Load a new script with a source.
 *
 * @param {String} url The script file that needs to be loaded in to the page.
 * @param {Function} fn The completion callback.
 * @returns {AsyncAsset}
 * @api private
 */
AsyncAsset.prototype.script = function scripts(url, fn) {
  var script = this.document.createElement('script')
    , file = this.files[url] = new File(url, fn)
    , async = this;

  //
  // Add an unload handler which removes the DOM node from the root element.
  //
  file.unload(function unload() {
    script.onerror = script.onload = script.onreadystatechange = null;
    if (script.parentNode) script.parentNode.removeChild(script);
  });

  //
  // Required for FireFox 3.6 / Opera async loading. Normally browsers would
  // load the script async without this flag because we're using createElement
  // but these browsers need explicit flags.
  //
  script.async = true;

  //
  // onerror is not triggered by all browsers, but should give us a clean
  // indication of failures so it doesn't matter if you're browser supports it
  // or not, we still want to listen for it.
  //
  script.onerror = function onerror() {
    script.onerror = script.onload = script.onreadystatechange = null;
    async.callback(url, new Error('Failed to load the script.'));
  };

  //
  // All "latest" browser seem to support the onload event for detecting full
  // script loading. Internet Explorer 11 no longer needs to use the
  // onreadystatechange method for completion indication.
  //
  script.onload = function onload() {
    script.onerror = script.onload = script.onreadystatechange = null;
    async.callback(url);
  };

  //
  // Fall-back for older IE versions, they do not support the onload event on the
  // script tag and we need to check the script readyState to see if it's
  // successfully loaded.
  //
  script.onreadystatechange = function onreadystatechange() {
    if (this.readyState in { loaded: 1, complete: 1 }) {
      script.onerror = script.onload = script.onreadystatechange = null;
      async.callback(url);
    }
  };

  //
  // The src needs to be set after the element has been added to the document.
  // If I remember correctly it had to do something with an IE8 bug.
  //
  this.root.appendChild(script);
  script.src = url;

  return this;
};

/**
 * Load CSS files by using @import statements.
 *
 * @param {String} url URL to load.
 * @param {Function} fn Completion callback.
 * @returns {AsyncAsset}
 * @api private
 */
AsyncAsset.prototype.style = function style(url, fn) {
  if (!this.document.styleSheet) return this.link(url, fn);

  var file = this.file[url] = new File(url, fn)
    , sheet, i = 0;

  //
  // Internet Explorer can only have 31 style tags on a single page. One single
  // style tag is also limited to 31 @import statements so this gives us room to
  // have 961 style sheets totally. So we should queue style sheets. This
  // limitation has been removed in Internet Explorer 10.
  //
  // @see http://john.albin.net/ie-css-limits/two-style-test.html
  // @see http://support.microsoft.com/kb/262161
  // @see http://blogs.msdn.com/b/ieinternals/archive/2011/05/14/internet-explorer-stylesheet-rule-selector-import-sheet-limit-maximum.aspx
  //
  for (; i < this.sheets.length; i++) {
    if (this.sheets[i].imports.length < 31) {
      sheet = this.sheets[i];
      break;
    }
  }

  //
  // We didn't find suitable style Sheet to add another @import statement,
  // create a new one so we can leverage that instead.
  //
  // @TODO we should probably check the amount of `document.styleSheets.length`
  //       to check if we're allowed to add more style sheets.
  //
  if (!sheet) {
    sheet = this.document.createStyleSheet();
    this.sheets.push(sheet);
  }

  //
  // Remove the import from the stylesheet.
  //
  file.unload(function unload() {
    sheet.removeImport(i);
  });

  sheet.addImport(url);
  return this.setInterval(url);
};

/**
 * Load CSS by adding link tags on to the page.
 *
 * @param {String} url URL to load.
 * @param {Function} fn Completion callback.
 * @returns {AsyncAsset}
 * @api private
 */
AsyncAsset.prototype.link = function links(url, fn) {
  var link = this.document.createElement('link')
    , file = this.files[url] = new File(url, fn)
    , async = this;

  file.unload(function unload() {
    link.onload = link.onerror = null;
    link.parentNode.removeChild(link);
  });

  if (this.onload) {
    link.onload = function onload() {
      link.onload = link.onerror = null;
      async.callback(url);
    };

    link.onerror = function onerror() {
      link.onload = link.onerror = null;
      async.callback(url, new Error('Failed to load the stylesheet'));
    };
  }

  link.href = url;
  link.type = 'text/css';
  link.rel = 'stylesheet';

  this.root.appendChild(link);
  return this.setInterval(url);
};

/**
 * Poll our stylesheets to see if the style's have been applied.
 *
 * @param {String} url URL to check
 * @api private
 */
AsyncAsset.prototype.setInterval = function setIntervals(url) {
  if (url in this.meta) return this;

  //
  // Create a meta tag which we can inject in to the page and give it the id of
  // the prefixed CSS rule so we know when the style sheet is loaded based on the
  // style of this meta element.
  //
  var meta = this.meta[url] = this.document.createElement('meta')
    , async = this;

  meta.id = [
    this.prefix,
    url.split('/').pop().split('.').shift()
  ].join('').toLowerCase();

  this.root.appendChild(meta);

  if (this.setInterval.timer) return this;

  //
  // Start the reaping process.
  //
  this.setInterval.timer = setInterval(function interval() {
    var now = +new Date()
      , url, file, style, meta
      , compute = window.getComputedStyle;

    for (url in async.meta) {
      meta = async.meta[url];
      if (!meta) continue;

      file = async.files[url];
      style = compute ? getComputedStyle(meta) : meta.currentStyle;

      //
      // We assume that CSS added an increased style to the given prefixed CSS
      // tag.
      //
      if (file && style && parseInt(style.height, 10) > 1) {
        file.exec();
      }

      if (
           !file
        || file.readyState === File.DEAD
        || file.readyState === File.LOADED
        || (now - file.start > async.timeout)
      ) {
        if (file) file.exec(new Error('Stylesheet loading has timed out'));
        meta.parentNode.removeChild(meta);
        delete async.meta[url];
      }
    }

    //
    // If we can iterate over the async.meta object there are still objects
    // left that needs to be polled.
    //
    for (url in async.meta) return;

    clearInterval(async.setInterval.timer);
    delete async.setInterval.timer;
  }, 20);

  return this;
};

/**
 * Prefetch resources without executing them. This ensures that the next lookup
 * is primed in the cache when we need them. Of course this is only possible
 * when the server sends the correct caching headers.
 *
 * @param {Array} urls The URLS that need to be cached.
 * @returns {AsyncAsset}
 * @api private
 */
AsyncAsset.prototype.prefetch = function prefetch(urls) {
  //
  // This check is here because I'm lazy, I don't want to add an `isArray` check
  // to the code. So we're just going to flip the logic here. If it's an string
  // transform it to an array.
  //
  if ('string' === typeof urls) urls = [urls];

  var IE = navigator.userAgent.indexOf(' Trident/')
    , img = /\.(jpg|jpeg|png|gif|webp)$/
    , node;

  for (var i = 0, l = urls.length; i < l; i++) {
    if (IE || img.test(urls[i])) {
      new Image().src = urls[i];
      continue;
    }

    node = document.createElement('object');
    node.height = node.width = 0;

    //
    // Position absolute is required because it can still add some minor spacing
    // at the bottom of a page and that will break sticky footer
    // implementations.
    //
    node.style.position = 'absolute';
    document.body.appendChild(node);
  }

  return this;
};

/**
 * Try to detect if this browser supports the onload events on the link tag.
 * It's a known cross browser bug that can affect WebKit, FireFox and Opera.
 * Internet Explorer is the only browser that supports the onload event
 * consistency but it has other bigger issues that prevents us from using this
 * method.
 *
 * @returns {AsyncAsset}
 * @api private
 */
AsyncAsset.prototype.feature = function detect() {
  if (this.feature.detecting) return this;

  this.feature.detecting = true;

  var link = document.createElement('link')
    , async = this;

  link.rel = 'stylesheet';
  link.href = 'data:text/css;base64,';

  link.onload = function loaded() {
    link.parentNode.removeChild(link);

    link.onload = false;
    async.onload = true;
  };

  this.root.appendChild(link);

  return this;
};

//
// Expose the file instance.
//
AsyncAsset.File = File;

//
// Expose the asset loader
//
module.exports = AsyncAsset;
