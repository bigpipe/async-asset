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

  describe('.add', function () {
    it('loads a JavaScript file', function (next) {
      assets.add('./fixtures/1.js', function (err) {
        if (err) return next(err);

        assume(x).to.be.a('object');
        assume(x.one).to.be.true();

        delete x.one;
        next();
      });
    });
  });
});
