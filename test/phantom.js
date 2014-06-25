(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
'use strict';

/**
 * Representation of an Assertion failure.
 *
 * Options:
 *
 * - **stack**: Stack trace
 * - **stacktrace**: Display stack traces.
 * - **expectation**: What we expected that would happen.
 *
 * @constructor
 * @param {String} message The reason of failure.
 * @param {Object} options Failure configuration.
 * @api private
 */
function Failure(message, options) {
  if (!(this instanceof Failure)) return new Failure(message, options);

  options = options || {};
  this.message = message || 'Unknown assertation failure occured';

  //
  // Private variables.
  //
  this._stacktrace = 'stacktrace' in options ? options.stacktrace : true;
  this._expectation = 'expectation' in options ? options.expectation : '';
  this._stack = options.stack;

  if (this._expectation) this._expectation = ', assumed '+ this._expectation;
  this.message += this._expectation;

  //
  // The actual message that displays in your console.
  //
  this.stack = this.message + (
    this._stacktrace
    ? '\n'+ options.stack.toString()
    : ''
  );

  Error.call(this, this.message);
}

//
// Old school inheritance hurts my eyes.
//
Failure.prototype = new Error;
Failure.prototype.constructor = Failure;

/**
 * Ensure that we can create JSON representation of this error.
 *
 * @returns {Object}
 * @api private
 */
Failure.prototype.toJSON = function toJSON() {
  return {
    message: this.message,
    stack: this._stacktrace
      ? this._stack.traces
      : []
  };
};

//
// Expose the Failure.
//
module.exports = Failure;

},{}],3:[function(require,module,exports){
'use strict';

var BackTrace = require('backtrace')
  , Failure = require('./failure')
  , pathval = require('pathval')
  , deep = require('deep-eql');

var toString = Object.prototype.toString
  , hasOwn = Object.prototype.hasOwnProperty;

/**
 * Get class information for a given type.
 *
 * @param {Mixed} of Type to check.
 * @returns {String} The name of the type.
 * @api private
 */
function type(of) {
  return toString.call(of).slice(8, -1).toLowerCase();
}

/**
 * Detect the display name of a given function.
 *
 * @param {Mixed} fn Function of class who's name is unknown
 * @api private
 */
function displayName(fn) {
  if (!fn) return 'undefined';

  //
  // WebKit and Safari expose a displayName property which contains the name of
  // the set function.
  //
  if (fn.displayName) return fn.displayName;

  //
  // Check to see if the constructor has a name
  //
  if (
       'object' === typeof fn
    && fn.constructor
    && 'string' === typeof fn.constructor.name
  ) return fn.constructor.name;

  //
  // Not a constructor, but we do have a name prop, use that instead.
  //
  if ('string' === fn.name) return fn.name;

  //
  // toString the given function and attempt to parse it out of it, or determine
  // the class.
  //
  var named = fn.toString();
  return 'function' === type(fn)
    ? named.substring(named.indexOf('(') + 1, named.indexOf(')'))
    : toString.call(fn).slice(8, -1);
}

/**
 * Determine the size of a collection.
 *
 * @param {Mixed} collection The object we want to know the size of.
 * @returns {Number} The size of the collection.
 * @api private
 */
function size(collection) {
  var x, i = 0;

  if ('object' === type(collection)) {
    for (x in collection) {
      if (hasOwn.call(collection, x)) i++;
    }

    return i;
  }

  try { return +collection.length || 0; }
  catch (e) { return 0; }
}

/**
 * Iterate over each item in an array.
 *
 * @param {Array} arr Array to iterate over.
 * @param {Function} fn Callback for each item.
 * @private
 */
function each(arr, fn) {
  for (var i = 0, length = arr.length; i < length; i++) {
    fn(arr[i], i, arr);
  }
}

/**
 * Assert values.
 *
 * Flags:
 *
 * - **falsely**: Assert for a false instead of true.
 * - **deeply**:  Ensure a deep match of the given object.
 * - **stacktrace**: Include stacktrace in the assertion.
 * - **diff**: Attempt to show the difference in object/values so we know why
 *   the assertion failed.
 *
 * @constructor
 * @param {Mixed} value Value we need to assert.
 * @param {Object} flags Assertion flags.
 * @api public
 */
function Assert(value, flags) {
  if (!(this instanceof Assert)) return new Assert(value, flags);
  flags = flags || {};

  this.stacktrace = 'stacktrace' in flags ? flags.stacktrace : Assert.config.includeStack;
  this.diff = 'diff' in flags ? flags.diff : Assert.config.showDiff;

  //
  // These flags are by the alias function so we can generate .not and .deep
  // properties which are basically new Assert instances with these flags set.
  //
  this.falsely = 'falsely' in flags ? flags.falsely : false;
  this.deeply = 'deeply' in flags ? flags.deeply : false;
  this.value = value;

  Assert.assign(this)('to, be, been, is, and, has, have, with, that, at, of, same, does, itself');
  Assert.alias(value, this);
}

/**
 * Attempt to mimic the configuration API of chai.js so it's dead simple to
 * migrate from chai.js to assume.
 *
 * @type {Object}
 * @public
 */
Assert.config = {
  includeStack: true,     // mapped to `stacktrace` as default value.
  showDiff: true          // mapped to `diff` as default value.
};

/**
 * Assign values to a given thing.
 *
 * @param {Mixed} where Where do the new properties need to be assigned on.
 * @returns {Function}
 * @api public
 */
Assert.assign = function assign(where) {
  return function assigns(aliases, value) {
    if ('string' === typeof aliases) {
      if (~aliases.indexOf(',')) aliases = aliases.split(/[\s|\,]+/);
      else aliases = [aliases];
    }

    for (var i = 0, length = aliases.length; i < length; i++) {
      where[aliases[i]] = value || where;
    }

    return where;
  };
};

/**
 * Add aliases to the given constructed asserts. This allows us to chain
 * assertion calls together.
 *
 * @param {Mixed} value Value that we need to assert.
 * @param {Assert} assert The constructed assert instance.
 * @returns {Assert} The given assert instance.
 * @api private
 */
Assert.alias = function alias(value, assert) {
  var assign = Assert.assign(assert)
    , flags, flag, prop;

  for (prop in Assert.aliases) {
    if (!hasOwn.call(Assert.aliases, prop)) continue;

    if (!assert[prop]) {
      flags = {};

      for (flag in Assert.aliases) {
        if (!hasOwn.call(Assert.aliases, flag)) continue;
        flags[flag] = assert[flag];
      }

      //
      // Add some default values to the flags.
      //
      flags.stacktrace = assert.stacktrace;
      flags.diff = assert.diff;
      flags[prop] = true;

      assign(Assert.aliases[prop], new Assert(value, flags));
    } else assign(Assert.aliases);
  }

  return assert;
};

/**
 * List of aliases and properties that need to be created for chaining purposes.
 * Plugins could add extra properties that needed to be chained as well.
 *
 * @type {Object}
 * @public
 */
Assert.aliases = {
  falsely: 'doesnt, not, dont',
  deeply: 'deep'
};

/**
 * API sugar of adding aliased prototypes to the Assert. This makes the code
 * a bit more workable and human readable.
 *
 * @param {String|Array} aliases List of methods.
 * @param {Function} fn Actual assertion function.
 * @returns {Assert}
 * @api public
 */
Assert.add = Assert.assign(Assert.prototype);

/**
 * Asserts if the given value is the correct type. We need to use
 * Object.toString here because there are some implementation bugs the `typeof`
 * operator:
 *
 * - Chrome <= 9: /Regular Expressions/ are evaluated to `function`
 *
 * As well as all common flaws like Arrays being seen as Objects etc. This
 * eliminates all these edge cases.
 *
 * @param {String} of Type of class it should equal
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('a, an', function typecheck(of, msg, stack) {
  var value = type(this.value)
    , expect = value +' to @ be a '+ of;

  return this.test(value === of, msg, expect, stack || new BackTrace());
});

/**
 * Asserts that the value is instanceof the given constructor.
 *
 * @param {Function} constructor Constructur the value should inherit from.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('instanceOf, instanceof, inherits, inherit', function of(constructor, msg, stack) {
  var expect = displayName(this.value) +' to @ be an instanceof '+ displayName(constructor);

  return this.test(this.value instanceof constructor, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value includes the given value.
 *
 * @param {Mixed} val Value to match.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('include, includes, contain, contains', function contain(val, msg, stack) {
  var of = type(this.value)
    , includes = false
    , expect = JSON.stringify(this.value) +' to @ include '+ val;

  switch (of) {
    case 'array':
      for (var i = 0, length = this.value.length; i < length; i++) {
        if (val === this.value[i]) {
          includes = true;
          break;
        }
      }
    break;

    case 'object':
      if (val in this.value) {
        includes = true;
      }
    break;

    case 'string':
      if (~this.value.indexOf(val)) {
        includes = true;
      }
    break;
  }

  return this.test(includes === true, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is truthy.
 *
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('ok, truthy, truly', function ok(msg, stack) {
  var expect = '"'+ this.value +'" to @ be truthy';

  return this.test(Boolean(this.value), msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is `true`.
 *
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('true', function ok(msg, stack) {
  var expect = this.value +' to @ equal (===) true';

  return this.test(this.value === true, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is `true`.
 *
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('false', function nope(msg, stack) {
  var expect = this.value +' to @ equal (===) false';

  return this.test(this.value === false, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is falsey.
 *
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('falsely, falsey', function nope(msg, stack) {
  var expect = '"'+ this.value +'" to @ be falsely';

  return this.test(Boolean(this.value) === false, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value exists.
 *
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('exists, exist', function exists(msg, stack) {
  var expect = '"'+ this.value +'" to @ exist';

  return this.test(this.value != null, msg, expect, stack || new BackTrace());
});

/**
 * Asserts that the value's length is the given value.
 *
 * @param {Number} value Size of the value.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('length, lengthOf, size', function length(value, msg, stack) {
  var expect = type(this.value) +' to @ have a length of '+ value;

  return this.test(size(this.value) === +value, msg, expect, stack || new BackTrace());
});

/**
 * Asserts that the value's length is 0 or doesn't contain any enumerable keys.
 *
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('empty', function empty(msg, stack) {
  var expect = type(this.value) +' to @ be empty';

  return this.test(size(this.value) === 0, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is greater than the specified value.
 *
 * @param {Number} value The greater than value.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('above, gt, greater, greaterThan', function above(value, msg, stack) {
  var amount = type(this.value) !== 'number' ? size(this.value) : this.value
    , expect = amount +' to @ be greater than '+ value;

  return this.test(amount > value, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is equal or greater than the specified value.
 *
 * @param {Number} value The specified value.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('least, gte', function least(value, msg, stack) {
  var amount = type(this.value) !== 'number' ? size(this.value) : this.value
    , expect = amount +' to @ be greater or equal to '+ value;

  return this.test(amount >= value, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is below the specified value.
 *
 * @param {Number} value The specified value.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('below, lt, less, lessThan', function below(value, msg, stack) {
  var amount = type(this.value) !== 'number' ? size(this.value) : this.value
    , expect = amount +' to @ be less than '+ value;

  return this.test(amount < value, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value is below or equal to the specified value.
 *
 * @param {Number} value The specified value.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('most, lte', function most(value, msg, stack) {
  var amount = type(this.value) !== 'number' ? size(this.value) : this.value
    , expect = amount +' to @ be less or equal to '+ value;

  return this.test(amount <= value, msg, expect, stack || new BackTrace());
});

/**
 * Assert that that value is within the given range.
 *
 * @param {Number} start Lower bound.
 * @param {Number} finish Upper bound.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('within, between', function within(start, finish, msg, stack) {
  var amount = type(this.value) !== 'number' ? size(this.value) : this.value
    , expect = amount +' to @ be greater or equal to '+ start +' and @ be less or equal to'+ finish;

  return this.test(amount >= start && amount <= finish, msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value has an own property with the given prop.
 *
 * @param {String} prop Property name.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('hasOwn, own, ownProperty, haveOwnProperty', function has(prop, msg, stack) {
  var expect = 'object @ to have own property '+ prop;

  return this.test(hasOwn.call(this.value, prop), msg, expect,  stack || new BackTrace());
});

/**
 * Asserts that the value matches a regular expression.
 *
 * @param {RegExp} regex Regular expression to match against.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('match, test', function test(regex, msg, stack) {
  var expect = this.value +' to @ match '+ regex;

  return this.test(!!regex.exec(this.value), msg, expect, stack || new BackTrace());
});

/**
 * Assert that the value equals a given thing.
 *
 * @param {Mixed} thing Thing it should equal.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('equal, equals, eq', function equal(thing, msg, stack) {
  var expect = this.value +' to @ equal (===) '+ thing;

  stack = stack || new BackTrace();

  if (!this.deeply) return this.test( this.value === thing, msg, expect, stack);

  return this.eql(thing, msg, stack);
});

/**
 * Assert that the value **deeply** equals a given thing.
 *
 * @param {Mixed} thing Thing it should equal.
 * @param {String} msg Reason of failure.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api public
 */
Assert.add('eql, eqls', function eqls(thing, msg, stack) {
  var expect = this.value +' to deeply equal '+ thing;

  return this.test(deep(this.value, thing), msg, expect, stack || new BackTrace());
});

/**
 * Validate the assertion.
 *
 * @param {Boolean} passed Didn't the test pass or fail.
 * @param {String} msg Custom message provided by users.
 * @param {String} expectation What the assertion expected.
 * @param {BackTrace} stack Optional Backtrace instance for proper stacktraces.
 * @returns {Assert}
 * @api private
 */
Assert.add('test', function test(passed, msg, expectation, stack) {
  if (this.falsely) passed = !passed;
  if (passed) return this;

  if (expectation instanceof BackTrace) {
    stack = expectation;
    expectation = undefined;
  }

  if (expectation && expectation.indexOf('@')) {
    if (this.falsely) expectation = expectation.replace(/\@\s/g, 'not');
    else expectation = expectation.replace(/\@\s/g, '');
  }

  throw new Failure(msg, {
    stack: (stack || []).slice(4),
    stacktrace: this.stacktrace,
    expectation: expectation
  });
});

//
// Create type checks for all build-in JavaScript classes.
//
each(('new String,new Number,new Array,new Date,new Error,new RegExp,new Boolean,'
  + 'new Float32Array,new Float64Array,new Int16Array,new Int32Array,new Int8Array,'
  + 'new Uint16Array,new Uint32Array,new Uint8Array,new Uint8ClampedArray,'
  + 'new ParallelArray,new Map,new Set,new WeakMap,new WeakSet,'
  + 'new DataView(new ArrayBuffer(1)),new ArrayBuffer(1),new Promise(function(){}),'
  + 'new Blob,arguments,null,undefined,new Buffer(1)').split(','), function iterate(code) {
  var name, arg;

  //
  // Not all of these constructors are supported in the browser, we're going to
  // compile dedicated functions that returns a new instance of the given
  // constructor. If it's not supported the code will throw and we will simply
  // return.
  //
  try { arg = (new Function('return '+ code))(); }
  catch (e) { return; }

  name = type(arg);

  Assert.add(name, function typecheck(msg, stack) {
    var of = type(this.value)
      , expect = of +' to @ be an '+ name;

    return this.test(of === name, msg, expect, stack || new BackTrace());
  });
});

//
// Introduce an alternate API:
//
// ```js
// var i = require('assume');
//
// i.assume.that('foo').equals('bar');
// i.sincerely.hope.that('foo').equals('bar');
// i.expect.that('foo').equals('bar');
// ```
//
Assert.hope = { that: Assert };
Assert.assign(Assert)('sincerely, expect');
Assert.assign(Assert)('assume, expect', Assert.hope);

//
// Expose the module.
//
module.exports = Assert;

},{"./failure":2,"backtrace":4,"deep-eql":6,"pathval":10}],4:[function(require,module,exports){
'use strict';

var stacktrace = require('stacktrace-js');

/**
 * Representation of a stack trace.
 *
 * Options:
 *
 * - **guess**: Guess the names of anonymous functions.
 *
 * @constructor
 * @param {Array} trace Array of traces.
 * @param {Object} err
 * @api private
 */
function Stack(trace, options) {
  if (!(this instanceof Stack)) return new Stack(trace, options);

  if ('object' === typeof trace && !trace.length) {
    options = trace;
    trace = null;
  }

  options = options || {};
  options.guess = 'guess' in options ? options.guess : true;

  if (!trace) {
    var imp = new stacktrace.implementation()
      , traced = imp.run(options.error || options.err || options.e);

    trace = options.guess ? imp.guessAnonymousFunctions(traced) : traced;
  }

  this.traces = this.parse(trace);
}

/**
 * Create a normalised but human readable stack trace.
 *
 * @returns {String}
 * @api private
 */
Stack.prototype.toString = function toString() {
  var traces = [];

  for (var i = 0, length = this.traces.length; i < length; i++) {
    var trace = this.traces[i]
      , location = [];

    if (trace.file) location.push(trace.file);
    if (trace.line) location.push(trace.line);
    if (trace.column) location.push(trace.column);

    traces.push(
      '    at '+ trace.name +' ('+ location.join(':') +')'
    );
  }

  return traces.join('\n\r');
};

/**
 * Parse the stack trace array and transform it to an Object.
 *
 * @param {Array} trace Array of stack fragments
 * @returns {Array} Human readable objects
 * @api private
 */
Stack.prototype.parse = function parse(trace) {
  var stack = [];

  for (var i = 0, length = trace.length; i < length; i++) {
    var location = trace[i].split(':')
      , script = location[0].split('@');

    stack.push({
      column: location[2],
      line: location[1],
      name: script[0],
      file: script[1]
    });
  }

  return stack;
};

/**
 * Slice items from the stack trace.
 *
 * @param {Number} start The start of the trace.
 * @param {Number} finihs The end of the trace removal
 * @returns {Stack}
 * @api public
 */
Stack.prototype.slice = function slice(start, finish) {
  this.traces = this.traces.slice(start, finish);

  return this;
};

/**
 * Return the stack trace information for when our stack gets JSON.stringified.
 *
 * @returns {Array}
 * @api private
 */
Stack.prototype.toJSON = function toJSON() {
  return this.traces;
};

//
// Expose the module
//
module.exports = Stack;

},{"stacktrace-js":5}],5:[function(require,module,exports){
// Domain Public by Eric Wendelin http://eriwen.com/ (2008)
//                  Luke Smith http://lucassmith.name/ (2008)
//                  Loic Dachary <loic@dachary.org> (2008)
//                  Johan Euphrosine <proppy@aminche.com> (2008)
//                  Oyvind Sean Kinsey http://kinsey.no/blog (2010)
//                  Victor Homyakov <victor-homyakov@users.sourceforge.net> (2010)
/*global module, exports, define, ActiveXObject*/
(function(global, factory) {
    if (typeof exports === 'object') {
        // Node
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser globals
        global.printStackTrace = factory();
    }
}(this, function() {
    /**
     * Main function giving a function stack trace with a forced or passed in Error
     *
     * @cfg {Error} e The error to create a stacktrace from (optional)
     * @cfg {Boolean} guess If we should try to resolve the names of anonymous functions
     * @return {Array} of Strings with functions, lines, files, and arguments where possible
     */
    function printStackTrace(options) {
        options = options || {guess: true};
        var ex = options.e || null, guess = !!options.guess;
        var p = new printStackTrace.implementation(), result = p.run(ex);
        return (guess) ? p.guessAnonymousFunctions(result) : result;
    }

    printStackTrace.implementation = function() {
    };

    printStackTrace.implementation.prototype = {
        /**
         * @param {Error} [ex] The error to create a stacktrace from (optional)
         * @param {String} [mode] Forced mode (optional, mostly for unit tests)
         */
        run: function(ex, mode) {
            ex = ex || this.createException();
            mode = mode || this.mode(ex);
            if (mode === 'other') {
                return this.other(arguments.callee);
            } else {
                return this[mode](ex);
            }
        },

        createException: function() {
            try {
                this.undef();
            } catch (e) {
                return e;
            }
        },

        /**
         * Mode could differ for different exception, e.g.
         * exceptions in Chrome may or may not have arguments or stack.
         *
         * @return {String} mode of operation for the exception
         */
        mode: function(e) {
            if (e['arguments'] && e.stack) {
                return 'chrome';
            }

            if (e.stack && e.sourceURL) {
                return 'safari';
            }

            if (e.stack && e.number) {
                return 'ie';
            }

            if (e.stack && e.fileName) {
                return 'firefox';
            }

            if (e.message && e['opera#sourceloc']) {
                // e.message.indexOf("Backtrace:") > -1 -> opera9
                // 'opera#sourceloc' in e -> opera9, opera10a
                // !e.stacktrace -> opera9
                if (!e.stacktrace) {
                    return 'opera9'; // use e.message
                }
                if (e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
                    // e.message may have more stack entries than e.stacktrace
                    return 'opera9'; // use e.message
                }
                return 'opera10a'; // use e.stacktrace
            }

            if (e.message && e.stack && e.stacktrace) {
                // e.stacktrace && e.stack -> opera10b
                if (e.stacktrace.indexOf("called from line") < 0) {
                    return 'opera10b'; // use e.stacktrace, format differs from 'opera10a'
                }
                // e.stacktrace && e.stack -> opera11
                return 'opera11'; // use e.stacktrace, format differs from 'opera10a', 'opera10b'
            }

            if (e.stack && !e.fileName) {
                // Chrome 27 does not have e.arguments as earlier versions,
                // but still does not have e.fileName as Firefox
                return 'chrome';
            }

            return 'other';
        },

        /**
         * Given a context, function name, and callback function, overwrite it so that it calls
         * printStackTrace() first with a callback and then runs the rest of the body.
         *
         * @param {Object} context of execution (e.g. window)
         * @param {String} functionName to instrument
         * @param {Function} callback function to call with a stack trace on invocation
         */
        instrumentFunction: function(context, functionName, callback) {
            context = context || window;
            var original = context[functionName];
            context[functionName] = function instrumented() {
                callback.call(this, printStackTrace().slice(4));
                return context[functionName]._instrumented.apply(this, arguments);
            };
            context[functionName]._instrumented = original;
        },

        /**
         * Given a context and function name of a function that has been
         * instrumented, revert the function to it's original (non-instrumented)
         * state.
         *
         * @param {Object} context of execution (e.g. window)
         * @param {String} functionName to de-instrument
         */
        deinstrumentFunction: function(context, functionName) {
            if (context[functionName].constructor === Function &&
                context[functionName]._instrumented &&
                context[functionName]._instrumented.constructor === Function) {
                context[functionName] = context[functionName]._instrumented;
            }
        },

        /**
         * Given an Error object, return a formatted Array based on Chrome's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        chrome: function(e) {
            return (e.stack + '\n')
                .replace(/^[\s\S]+?\s+at\s+/, ' at ') // remove message
                .replace(/^\s+(at eval )?at\s+/gm, '') // remove 'at' and indentation
                .replace(/^([^\(]+?)([\n$])/gm, '{anonymous}() ($1)$2')
                .replace(/^Object.<anonymous>\s*\(([^\)]+)\)/gm, '{anonymous}() ($1)')
                .replace(/^(.+) \((.+)\)$/gm, '$1@$2')
                .split('\n')
                .slice(0, -1);
        },

        /**
         * Given an Error object, return a formatted Array based on Safari's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        safari: function(e) {
            return e.stack.replace(/\[native code\]\n/m, '')
                .replace(/^(?=\w+Error\:).*$\n/m, '')
                .replace(/^@/gm, '{anonymous}()@')
                .split('\n');
        },

        /**
         * Given an Error object, return a formatted Array based on IE's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        ie: function(e) {
            return e.stack
                .replace(/^\s*at\s+(.*)$/gm, '$1')
                .replace(/^Anonymous function\s+/gm, '{anonymous}() ')
                .replace(/^(.+)\s+\((.+)\)$/gm, '$1@$2')
                .split('\n')
                .slice(1);
        },

        /**
         * Given an Error object, return a formatted Array based on Firefox's stack string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        firefox: function(e) {
            return e.stack.replace(/(?:\n@:0)?\s+$/m, '')
                .replace(/^(?:\((\S*)\))?@/gm, '{anonymous}($1)@')
                .split('\n');
        },

        opera11: function(e) {
            var ANON = '{anonymous}', lineRE = /^.*line (\d+), column (\d+)(?: in (.+))? in (\S+):$/;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var location = match[4] + ':' + match[1] + ':' + match[2];
                    var fnName = match[3] || "global code";
                    fnName = fnName.replace(/<anonymous function: (\S+)>/, "$1").replace(/<anonymous function>/, ANON);
                    result.push(fnName + '@' + location + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        opera10b: function(e) {
            // "<anonymous function: run>([arguments not available])@file://localhost/G:/js/stacktrace.js:27\n" +
            // "printStackTrace([arguments not available])@file://localhost/G:/js/stacktrace.js:18\n" +
            // "@file://localhost/G:/js/test/functional/testcase1.html:15"
            var lineRE = /^(.*)@(.+):(\d+)$/;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i++) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var fnName = match[1] ? (match[1] + '()') : "global code";
                    result.push(fnName + '@' + match[2] + ':' + match[3]);
                }
            }

            return result;
        },

        /**
         * Given an Error object, return a formatted Array based on Opera 10's stacktrace string.
         *
         * @param e - Error object to inspect
         * @return Array<String> of function calls, files and line numbers
         */
        opera10a: function(e) {
            // "  Line 27 of linked script file://localhost/G:/js/stacktrace.js\n"
            // "  Line 11 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html: In function foo\n"
            var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
            var lines = e.stacktrace.split('\n'), result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    var fnName = match[3] || ANON;
                    result.push(fnName + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        // Opera 7.x-9.2x only!
        opera9: function(e) {
            // "  Line 43 of linked script file://localhost/G:/js/stacktrace.js\n"
            // "  Line 7 of inline#1 script in file://localhost/G:/js/test/functional/testcase1.html\n"
            var ANON = '{anonymous}', lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
            var lines = e.message.split('\n'), result = [];

            for (var i = 2, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(ANON + '()@' + match[2] + ':' + match[1] + ' -- ' + lines[i + 1].replace(/^\s+/, ''));
                }
            }

            return result;
        },

        // Safari 5-, IE 9-, and others
        other: function(curr) {
            var ANON = '{anonymous}', fnRE = /function(?:\s+([\w$]+))?\s*\(/, stack = [], fn, args, maxStackSize = 10;
            var slice = Array.prototype.slice;
            while (curr && stack.length < maxStackSize) {
                fn = fnRE.test(curr.toString()) ? RegExp.$1 || ANON : ANON;
                try {
                    args = slice.call(curr['arguments'] || []);
                } catch (e) {
                    args = ['Cannot access arguments: ' + e];
                }
                stack[stack.length] = fn + '(' + this.stringifyArguments(args) + ')';
                try {
                    curr = curr.caller;
                } catch (e) {
                    stack[stack.length] = 'Cannot access caller: ' + e;
                    break;
                }
            }
            return stack;
        },

        /**
         * Given arguments array as a String, substituting type names for non-string types.
         *
         * @param {Arguments,Array} args
         * @return {String} stringified arguments
         */
        stringifyArguments: function(args) {
            var result = [];
            var slice = Array.prototype.slice;
            for (var i = 0; i < args.length; ++i) {
                var arg = args[i];
                if (arg === undefined) {
                    result[i] = 'undefined';
                } else if (arg === null) {
                    result[i] = 'null';
                } else if (arg.constructor) {
                    // TODO constructor comparison does not work for iframes
                    if (arg.constructor === Array) {
                        if (arg.length < 3) {
                            result[i] = '[' + this.stringifyArguments(arg) + ']';
                        } else {
                            result[i] = '[' + this.stringifyArguments(slice.call(arg, 0, 1)) + '...' + this.stringifyArguments(slice.call(arg, -1)) + ']';
                        }
                    } else if (arg.constructor === Object) {
                        result[i] = '#object';
                    } else if (arg.constructor === Function) {
                        result[i] = '#function';
                    } else if (arg.constructor === String) {
                        result[i] = '"' + arg + '"';
                    } else if (arg.constructor === Number) {
                        result[i] = arg;
                    } else {
                        result[i] = '?';
                    }
                }
            }
            return result.join(',');
        },

        sourceCache: {},

        /**
         * @return {String} the text from a given URL
         */
        ajax: function(url) {
            var req = this.createXMLHTTPObject();
            if (req) {
                try {
                    req.open('GET', url, false);
                    //req.overrideMimeType('text/plain');
                    //req.overrideMimeType('text/javascript');
                    req.send(null);
                    //return req.status == 200 ? req.responseText : '';
                    return req.responseText;
                } catch (e) {
                }
            }
            return '';
        },

        /**
         * Try XHR methods in order and store XHR factory.
         *
         * @return {XMLHttpRequest} XHR function or equivalent
         */
        createXMLHTTPObject: function() {
            var xmlhttp, XMLHttpFactories = [
                function() {
                    return new XMLHttpRequest();
                }, function() {
                    return new ActiveXObject('Msxml2.XMLHTTP');
                }, function() {
                    return new ActiveXObject('Msxml3.XMLHTTP');
                }, function() {
                    return new ActiveXObject('Microsoft.XMLHTTP');
                }
            ];
            for (var i = 0; i < XMLHttpFactories.length; i++) {
                try {
                    xmlhttp = XMLHttpFactories[i]();
                    // Use memoization to cache the factory
                    this.createXMLHTTPObject = XMLHttpFactories[i];
                    return xmlhttp;
                } catch (e) {
                }
            }
        },

        /**
         * Given a URL, check if it is in the same domain (so we can get the source
         * via Ajax).
         *
         * @param url {String} source url
         * @return {Boolean} False if we need a cross-domain request
         */
        isSameDomain: function(url) {
            return typeof location !== "undefined" && url.indexOf(location.hostname) !== -1; // location may not be defined, e.g. when running from nodejs.
        },

        /**
         * Get source code from given URL if in the same domain.
         *
         * @param url {String} JS source URL
         * @return {Array} Array of source code lines
         */
        getSource: function(url) {
            // TODO reuse source from script tags?
            if (!(url in this.sourceCache)) {
                this.sourceCache[url] = this.ajax(url).split('\n');
            }
            return this.sourceCache[url];
        },

        guessAnonymousFunctions: function(stack) {
            for (var i = 0; i < stack.length; ++i) {
                var reStack = /\{anonymous\}\(.*\)@(.*)/,
                    reRef = /^(.*?)(?::(\d+))(?::(\d+))?(?: -- .+)?$/,
                    frame = stack[i], ref = reStack.exec(frame);

                if (ref) {
                    var m = reRef.exec(ref[1]);
                    if (m) { // If falsey, we did not get any file/line information
                        var file = m[1], lineno = m[2], charno = m[3] || 0;
                        if (file && this.isSameDomain(file) && lineno) {
                            var functionName = this.guessAnonymousFunction(file, lineno, charno);
                            stack[i] = frame.replace('{anonymous}', functionName);
                        }
                    }
                }
            }
            return stack;
        },

        guessAnonymousFunction: function(url, lineNo, charNo) {
            var ret;
            try {
                ret = this.findFunctionName(this.getSource(url), lineNo);
            } catch (e) {
                ret = 'getSource failed with url: ' + url + ', exception: ' + e.toString();
            }
            return ret;
        },

        findFunctionName: function(source, lineNo) {
            // FIXME findFunctionName fails for compressed source
            // (more than one function on the same line)
            // function {name}({args}) m[1]=name m[2]=args
            var reFunctionDeclaration = /function\s+([^(]*?)\s*\(([^)]*)\)/;
            // {name} = function ({args}) TODO args capture
            // /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*function(?:[^(]*)/
            var reFunctionExpression = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*function\b/;
            // {name} = eval()
            var reFunctionEvaluation = /['"]?([$_A-Za-z][$_A-Za-z0-9]*)['"]?\s*[:=]\s*(?:eval|new Function)\b/;
            // Walk backwards in the source lines until we find
            // the line which matches one of the patterns above
            var code = "", line, maxLines = Math.min(lineNo, 20), m, commentPos;
            for (var i = 0; i < maxLines; ++i) {
                // lineNo is 1-based, source[] is 0-based
                line = source[lineNo - i - 1];
                commentPos = line.indexOf('//');
                if (commentPos >= 0) {
                    line = line.substr(0, commentPos);
                }
                // TODO check other types of comments? Commented code may lead to false positive
                if (line) {
                    code = line + code;
                    m = reFunctionExpression.exec(code);
                    if (m && m[1]) {
                        return m[1];
                    }
                    m = reFunctionDeclaration.exec(code);
                    if (m && m[1]) {
                        //return m[1] + "(" + (m[2] || "") + ")";
                        return m[1];
                    }
                    m = reFunctionEvaluation.exec(code);
                    if (m && m[1]) {
                        return m[1];
                    }
                }
            }
            return '(?)';
        }
    };

    return printStackTrace;
}));

},{}],6:[function(require,module,exports){
module.exports = require('./lib/eql');

},{"./lib/eql":7}],7:[function(require,module,exports){
/*!
 * deep-eql
 * Copyright(c) 2013 Jake Luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Module dependencies
 */

var type = require('type-detect');

/*!
 * Buffer.isBuffer browser shim
 */

var Buffer;
try { Buffer = require('buffer').Buffer; }
catch(ex) {
  Buffer = {};
  Buffer.isBuffer = function() { return false; }
}

/*!
 * Primary Export
 */

module.exports = deepEqual;

/**
 * Assert super-strict (egal) equality between
 * two objects of any type.
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @param {Array} memoised (optional)
 * @return {Boolean} equal match
 */

function deepEqual(a, b, m) {
  if (sameValue(a, b)) {
    return true;
  } else if ('date' === type(a)) {
    return dateEqual(a, b);
  } else if ('regexp' === type(a)) {
    return regexpEqual(a, b);
  } else if (Buffer.isBuffer(a)) {
    return bufferEqual(a, b);
  } else if ('arguments' === type(a)) {
    return argumentsEqual(a, b, m);
  } else if (!typeEqual(a, b)) {
    return false;
  } else if (('object' !== type(a) && 'object' !== type(b))
  && ('array' !== type(a) && 'array' !== type(b))) {
    return sameValue(a, b);
  } else {
    return objectEqual(a, b, m);
  }
}

/*!
 * Strict (egal) equality test. Ensures that NaN always
 * equals NaN and `-0` does not equal `+0`.
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @return {Boolean} equal match
 */

function sameValue(a, b) {
  if (a === b) return a !== 0 || 1 / a === 1 / b;
  return a !== a && b !== b;
}

/*!
 * Compare the types of two given objects and
 * return if they are equal. Note that an Array
 * has a type of `array` (not `object`) and arguments
 * have a type of `arguments` (not `array`/`object`).
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @return {Boolean} result
 */

function typeEqual(a, b) {
  return type(a) === type(b);
}

/*!
 * Compare two Date objects by asserting that
 * the time values are equal using `saveValue`.
 *
 * @param {Date} a
 * @param {Date} b
 * @return {Boolean} result
 */

function dateEqual(a, b) {
  if ('date' !== type(b)) return false;
  return sameValue(a.getTime(), b.getTime());
}

/*!
 * Compare two regular expressions by converting them
 * to string and checking for `sameValue`.
 *
 * @param {RegExp} a
 * @param {RegExp} b
 * @return {Boolean} result
 */

function regexpEqual(a, b) {
  if ('regexp' !== type(b)) return false;
  return sameValue(a.toString(), b.toString());
}

/*!
 * Assert deep equality of two `arguments` objects.
 * Unfortunately, these must be sliced to arrays
 * prior to test to ensure no bad behavior.
 *
 * @param {Arguments} a
 * @param {Arguments} b
 * @param {Array} memoize (optional)
 * @return {Boolean} result
 */

function argumentsEqual(a, b, m) {
  if ('arguments' !== type(b)) return false;
  a = [].slice.call(a);
  b = [].slice.call(b);
  return deepEqual(a, b, m);
}

/*!
 * Get enumerable properties of a given object.
 *
 * @param {Object} a
 * @return {Array} property names
 */

function enumerable(a) {
  var res = [];
  for (var key in a) res.push(key);
  return res;
}

/*!
 * Simple equality for flat iterable objects
 * such as Arrays or Node.js buffers.
 *
 * @param {Iterable} a
 * @param {Iterable} b
 * @return {Boolean} result
 */

function iterableEqual(a, b) {
  if (a.length !==  b.length) return false;

  var i = 0;
  var match = true;

  for (; i < a.length; i++) {
    if (a[i] !== b[i]) {
      match = false;
      break;
    }
  }

  return match;
}

/*!
 * Extension to `iterableEqual` specifically
 * for Node.js Buffers.
 *
 * @param {Buffer} a
 * @param {Mixed} b
 * @return {Boolean} result
 */

function bufferEqual(a, b) {
  if (!Buffer.isBuffer(b)) return false;
  return iterableEqual(a, b);
}

/*!
 * Block for `objectEqual` ensuring non-existing
 * values don't get in.
 *
 * @param {Mixed} object
 * @return {Boolean} result
 */

function isValue(a) {
  return a !== null && a !== undefined;
}

/*!
 * Recursively check the equality of two objects.
 * Once basic sameness has been established it will
 * defer to `deepEqual` for each enumerable key
 * in the object.
 *
 * @param {Mixed} a
 * @param {Mixed} b
 * @return {Boolean} result
 */

function objectEqual(a, b, m) {
  if (!isValue(a) || !isValue(b)) {
    return false;
  }

  if (a.prototype !== b.prototype) {
    return false;
  }

  var i;
  if (m) {
    for (i = 0; i < m.length; i++) {
      if ((m[i][0] === a && m[i][1] === b)
      ||  (m[i][0] === b && m[i][1] === a)) {
        return true;
      }
    }
  } else {
    m = [];
  }

  try {
    var ka = enumerable(a);
    var kb = enumerable(b);
  } catch (ex) {
    return false;
  }

  ka.sort();
  kb.sort();

  if (!iterableEqual(ka, kb)) {
    return false;
  }

  m.push([ a, b ]);

  var key;
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key], m)) {
      return false;
    }
  }

  return true;
}

},{"buffer":11,"type-detect":8}],8:[function(require,module,exports){
module.exports = require('./lib/type');

},{"./lib/type":9}],9:[function(require,module,exports){
/*!
 * type-detect
 * Copyright(c) 2013 jake luer <jake@alogicalparadox.com>
 * MIT Licensed
 */

/*!
 * Primary Exports
 */

var exports = module.exports = getType;

/*!
 * Detectable javascript natives
 */

var natives = {
    '[object Array]': 'array'
  , '[object RegExp]': 'regexp'
  , '[object Function]': 'function'
  , '[object Arguments]': 'arguments'
  , '[object Date]': 'date'
};

/**
 * ### typeOf (obj)
 *
 * Use several different techniques to determine
 * the type of object being tested.
 *
 *
 * @param {Mixed} object
 * @return {String} object type
 * @api public
 */

function getType (obj) {
  var str = Object.prototype.toString.call(obj);
  if (natives[str]) return natives[str];
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  if (obj === Object(obj)) return 'object';
  return typeof obj;
}

exports.Library = Library;

/**
 * ### Library
 *
 * Create a repository for custom type detection.
 *
 * ```js
 * var lib = new type.Library;
 * ```
 *
 */

function Library () {
  this.tests = {};
}

/**
 * #### .of (obj)
 *
 * Expose replacement `typeof` detection to the library.
 *
 * ```js
 * if ('string' === lib.of('hello world')) {
 *   // ...
 * }
 * ```
 *
 * @param {Mixed} object to test
 * @return {String} type
 */

Library.prototype.of = getType;

/**
 * #### .define (type, test)
 *
 * Add a test to for the `.test()` assertion.
 *
 * Can be defined as a regular expression:
 *
 * ```js
 * lib.define('int', /^[0-9]+$/);
 * ```
 *
 * ... or as a function:
 *
 * ```js
 * lib.define('bln', function (obj) {
 *   if ('boolean' === lib.of(obj)) return true;
 *   var blns = [ 'yes', 'no', 'true', 'false', 1, 0 ];
 *   if ('string' === lib.of(obj)) obj = obj.toLowerCase();
 *   return !! ~blns.indexOf(obj);
 * });
 * ```
 *
 * @param {String} type
 * @param {RegExp|Function} test
 * @api public
 */

Library.prototype.define = function (type, test) {
  if (arguments.length === 1) return this.tests[type];
  this.tests[type] = test;
  return this;
};

/**
 * #### .test (obj, test)
 *
 * Assert that an object is of type. Will first
 * check natives, and if that does not pass it will
 * use the user defined custom tests.
 *
 * ```js
 * assert(lib.test('1', 'int'));
 * assert(lib.test('yes', 'bln'));
 * ```
 *
 * @param {Mixed} object
 * @param {String} type
 * @return {Boolean} result
 * @api public
 */

Library.prototype.test = function (obj, type) {
  if (type === getType(obj)) return true;
  var test = this.tests[type];

  if (test && 'regexp' === getType(test)) {
    return test.test(obj);
  } else if (test && 'function' === getType(test)) {
    return test(obj);
  } else {
    throw new ReferenceError('Type test "' + type + '" not defined or invalid.');
  }
};

},{}],10:[function(require,module,exports){
/**
 * ### .get(obj, path)
 *
 * Retrieve the value in an object given a string path.
 *
 * ```js
 * var obj = {
 *     prop1: {
 *         arr: ['a', 'b', 'c']
 *       , str: 'Hello'
 *     }
 *   , prop2: {
 *         arr: [ { nested: 'Universe' } ]
 *       , str: 'Hello again!'
 *     }
 * };
 * ```
 *
 * The following would be the results.
 *
 * ```js
 * var properties = require('tea-properties');
 * properties.get(obj, 'prop1.str'); // Hello
 * properties.get(obj, 'prop1.att[2]'); // b
 * properties.get(obj, 'prop2.arr[0].nested'); // Universe
 * ```
 *
 * @param {Object} object
 * @param {String} path
 * @return {Object} value or `undefined`
 */

exports.get = function(obj, path) {
  var parsed = exports.parse(path);
  return getPathValue(parsed, obj);
};

/**
 * ### .set(path, value, object)
 *
 * Define the value in an object at a given string path.
 *
 * ```js
 * var obj = {
 *     prop1: {
 *         arr: ['a', 'b', 'c']
 *       , str: 'Hello'
 *     }
 *   , prop2: {
 *         arr: [ { nested: 'Universe' } ]
 *       , str: 'Hello again!'
 *     }
 * };
 * ```
 *
 * The following would be acceptable.
 *
 * ```js
 * var properties = require('tea-properties');
 * properties.set(obj, 'prop1.str', 'Hello Universe!');
 * properties.set(obj, 'prop1.arr[2]', 'B');
 * properties.set(obj, 'prop2.arr[0].nested.value', { hello: 'universe' });
 * ```
 *
 * @param {Object} object
 * @param {String} path
 * @param {Mixed} value
 * @api public
 */

exports.set = function(obj, path, val) {
  var parsed = exports.parse(path);
  setPathValue(parsed, val, obj);
};

/*!
 * Helper function used to parse string object
 * paths. Use in conjunction with `getPathValue`.
 *
 *  var parsed = parsePath('myobject.property.subprop');
 *
 * ### Paths:
 *
 * * Can be as near infinitely deep and nested
 * * Arrays are also valid using the formal `myobject.document[3].property`.
 *
 * @param {String} path
 * @returns {Object} parsed
 */

exports.parse = function(path) {
  var str = (path || '').replace(/\[/g, '.[');
  var parts = str.match(/(\\\.|[^.]+?)+/g);

  return parts.map(function(value) {
    var re = /\[(\d+)\]$/
      , mArr = re.exec(value)
    if (mArr) return { i: parseFloat(mArr[1]) };
    else return { p: value };
  });
};

/*!
 * Companion function for `parsePath` that returns
 * the value located at the parsed address.
 *
 *  var value = getPathValue(parsed, obj);
 *
 * @param {Object} parsed definition from `parsePath`.
 * @param {Object} object to search against
 * @returns {Object|Undefined} value
 */

function getPathValue(parsed, obj) {
  var tmp = obj;
  var res;

  for (var i = 0, l = parsed.length; i < l; i++) {
    var part = parsed[i];
    if (tmp) {
      if (defined(part.p)) tmp = tmp[part.p];
      else if (defined(part.i)) tmp = tmp[part.i];
      if (i == (l - 1)) res = tmp;
    } else {
      res = undefined;
    }
  }

  return res;
};

/*!
 * Companion function for `parsePath` that sets
 * the value located at a parsed address.
 *
 *  setPathValue(parsed, 'value', obj);
 *
 * @param {Object} parsed definition from `parsePath`
 * @param {*} value to use upon set
 * @param {Object} object to search and define on
 * @api private
 */

function setPathValue(parsed, val, obj) {
  var tmp = obj;
  var i = 0;
  var l = parsed.length;
  var part;

  for (; i < l; i++) {
    part = parsed[i];

    if (defined(tmp) && i == (l - 1)) {
      var x = defined(part.p) ? part.p : part.i;
      tmp[x] = val;
    } else if (defined(tmp)) {
      if (defined(part.p) && tmp[part.p]) {
        tmp = tmp[part.p];
      } else if (defined(part.i) && tmp[part.i]) {
        tmp = tmp[part.i];
      } else {
        var next = parsed[i + 1];
        var x = defined(part.p) ? part.p : part.i;
        var y = defined(next.p) ? {} : [];
        tmp[x] = y;
        tmp = tmp[x];
      }
    } else {
      if (i == (l - 1)) tmp = val;
      else if (defined(part.p)) tmp = {};
      else if (defined(part.i)) tmp = [];
    }
  }
};

/*!
 * Check if `val` is defined.
 *
 * @param {Mixed} val
 * @returns {Boolean} `true` if defined
 * @api private
 */

function defined(val) {
  return !(!val && 'undefined' === typeof val);
}

},{}],11:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":12,"ieee754":13}],12:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],13:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],14:[function(require,module,exports){
describe('async-asset', function () {
  'use strict';

  var AsyncAsset = require('../')
    , assume = require('assume')
    , File = AsyncAsset.File
    , assets;

  beforeEach(function each() {
    assets = new AsyncAsset();
  });

  it('exports as a function', function () {
    assume(AsyncAsset).to.be.a('function');
  });

  describe('.type', function () {
    it('returns the type of the file', function () {
      assume(assets.type('/foo/bar.js')).to.equal('js');
      assume(assets.type('/foo/bar.css')).to.equal('css');
      assume(assets.type('/foo/bar.jpg')).to.equal('jpg');
    });

    it('lowercases the result', function () {
      assume(assets.type('/FOO/BAR.JS')).to.equal('js');
      assume(assets.type('/FOO/BAR.CSS')).to.equal('css');
      assume(assets.type('/FOO/BAR.JPG')).to.equal('jpg');
    });
  });

  describe('.progress', function () {
    it('returns false for files that are not in progess', function fn() {
      assume(assets.progress('url', fn)).to.equal(false);
    });

    it('adds the callback if file is loading', function () {
      var file = new File('url');
      assets.files.url = file;

      assume(assets.progress('url', function () {})).to.equal(true);
      assume(file.callbacks).to.have.length(1);
    });

    it('return false if the file is dead or destroyed', function () {
      var file = new File('url');

      assets.files.url = file;
      assume(assets.progress('url', function () {})).to.equal(true);

      file.destroy();
      assume(assets.progress('url')).to.equal(false);
    });

    it('calls the callback directly if file is loaded', function (next) {
      var file = new File('url');

      assets.files.url = file;
      file.exec();
      assets.progress('url', next);
    });
  });
});

},{"../":1,"assume":3}],15:[function(require,module,exports){
describe('async-asset', function () {
  'use strict';

  var AsyncAsset = require('../')
    , assume = require('assume')
    , File = AsyncAsset.File;

  describe('.File', function () {
    it('exposes the File constructor', function () {
      assume(File).to.be.a('function');
    });

    it('sets a start EPOCH', function () {
      var file = new File('url');

      assume(file.readyState).to.equal(File.LOADING);
      assume(file.callbacks).to.have.length(0);
      assume(file.callbacks).to.be.a('array');
      assume(file.cleanup).to.be.a('array');
      assume(file.start).to.be.a('number');
      assume(file.url).to.equal('url');
    });

    it('adds the supplied callback', function callback() {
      var file = new File('url', callback);

      assume(file.callbacks).to.have.length(1);
      assume(file.callbacks[0]).to.equal(callback);
    });

    describe('.unload', function () {
      it('adds an unload handler', function callback() {
        var file = new File('url');

        assume(file.cleanup).to.be.a('array');
        assume(file.cleanup).to.have.length(0);
        file.unload(callback);
        assume(file.cleanup).to.have.length(1);
        assume(file.cleanup[0]).to.equal(callback);
      });

      it('is called when File is destroyed', function (next) {
        var file = new File('url');

        file.unload(next);
        file.destroy();
      });
    });

    describe('.add', function () {
      it('adds callbacks if we are loading', function () {
        var file = new File('url');

        assume(file.callbacks).to.have.length(0);
        assume(file.dependent).to.equal(0);

        var bool = file.add(function () {
          throw new Error('I should not execute yet');
        });

        assume(file.callbacks).to.have.length(1);
        assume(file.dependent).to.equal(1);
        assume(bool).to.be.true();

        bool = file.add(function () {
          throw new Error('I should not execute yet');
        });

        assume(file.callbacks).to.have.length(2);
        assume(file.dependent).to.equal(2);
        assume(bool).to.be.true();
      });

      it('executes the callback if we are loaded', function () {
        var file = new File('url')
          , called = false;

        file.readyState = File.LOADED;

        assume(file.callbacks).to.have.length(0);
        assume(file.dependent).to.equal(0);

        for (var i = 0; i < 10; i++) {
          bool = file.add(function () { called = true; });
        }

        assume(file.callbacks).to.have.length(0);
        assume(file.dependent).to.equal(10);
        assume(called).to.be.true();
        assume(bool).to.be.true();
      });

      it('does not queue or execute callback when dead', function () {
        var file = new File('url')
          , called = false;

        file.readyState = File.DEAD;

        assume(file.callbacks).to.have.length(0);
        assume(file.dependent).to.equal(0);

        var bool = file.add(function () {
          called = true;
        });

        assume(file.callbacks).to.have.length(0);
        assume(file.dependent).to.equal(0);
        assume(called).to.be.false();
        assume(bool).to.be.false();
      });
    });

    describe('.exec', function () {
      it('executes all callbacks', function (next) {
        var file = new File('url', next);
        file.exec();
      });

      it('clears all callbacks after executing', function ()  {
        var file = new File('url')
          , called = 0;

        file.callbacks.push(function () {
          called++;
        });

        assume(file.callbacks).to.have.length(1);
        file.exec();
        assume(called).to.equal(1);
        assume(file.callbacks).to.have.length(0);
      });

      it('will destroy the file when exec with error', function (next) {
        var file = new File('url', function (err) {
          if (!err) throw new Error('I should receive an error');
        });

        file.unload(next);
        file.exec(new Error('pew'));
      });
    });

    describe('.destroy', function () {
      it('calls all uncalled callbacks', function (next) {
        var file = new File('url', function (err) {
          assume(err.message).to.include('destroy');
          next();
        });

        file.destroy();
      });

      it('cleans the cleanup and sets readyState', function () {
        var file = new File('url');

        file.unload(function () {});

        assume(file.readyState).to.equal(File.LOADING);
        assume(file.cleanup).to.have.length(1);

        file.destroy();

        assume(file.readyState).to.equal(File.DEAD);
        assume(file.cleanup).to.have.length(0);
      });

      it('does not wine about missing callbacks if there is nothing', function () {
        var file = new File('url');

        file.destroy();
      });
    });
  });
});

},{"../":1,"assume":3}]},{},[14,15])