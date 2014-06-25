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
          , called = false
          , bool;

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

    describe('.remove', function () {
      it('decrementes the dependent', function () {
        var file = new File('url');

        file.dependent = 10;
        var bool = file.remove();

        assume(bool).to.be.false();
        assume(file.dependent).to.equal(9);
      });

      it('calls the destroy method when there are no more dependent', function (next) {
        var file = new File('url');

        file.unload(function () { setTimeout(next, 0); });
        file.dependent = 2;

        assume(file.remove()).to.equal(false);
        assume(file.dependent).to.equal(1);
        assume(file.remove()).to.equal(true);
        assume(file.dependent).to.equal(0);
        assume(file.readState).to.equal(File.DEATH);
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
