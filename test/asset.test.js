describe('async-asset', function () {
  'use strict';

  var AsyncAsset = require('../')
    , assume = require('assume')
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
});
