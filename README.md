# async-asset

Asynchronously load front-end assets. And with async, we mean truly async.
Loading scripts async isn't that hard but loading a CSS file fully async in
a cross browser manner can be utterly painful. Especially when you try to do
this in the front-end's worst enemy, Internet Explorer. It has limitations on
the amount of style sheets that can be loaded on a single page. So we need to
make sure that we do not reach these limitations by using clever tricks. (Which
we are doing of course).

## Installation

This module exposes a Node.js (`module.exports`) interface for loading the module
so you should be using `browserify` to compile the assets in to a single file.
The code it self is released through `npm` as you might have expected and can be
installed by running:

```
npm install --save async-asset
```

## Usage

Require the module:

```js
'use strict';

var AsyncAsset = require('async-asset');
```

And construct a new instance.

```js
var assets = new AsyncAsset(root, { options });
```

In the function signature above you can see that it receives 2 arguments:

1. The `root` element where we append all script/link instances to.
2. The `options` object which allows you further configure the object. The
   following options are accepted:
   - `document` Document instance where we call the `createElement` on.
   - `timeout` Amount of milliseconds we allow the resource to load until call
     all callbacks with an timeout error.
   - `onload` Indication if style sheets call the `onload` method.
   - `prefix` Prefix for id selectors we used to pull for style sheet changes.

### AsyncAsset.remove

```js
assets.remove(url, fn);
```

### AsyncAsset.add

```js
assets.add(url, fn);
```

## License

MIT
