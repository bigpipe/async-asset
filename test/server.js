'use strict';

var http = require('http')
  , path = require('path')
  , fs = require('fs');

//
// The location of our fixtures.
//
var fixtures = path.join(__dirname, 'fixtures');

//
// Create a server that serves the fixtures.
//
http.createServer(function incoming(req, res) {
  res.statusCode = 200;
  fs.createReadStream(path.join(fixtures, req.url)).pipe(res);
}).listen(process.env.ZUUL_PORT || 8080);
