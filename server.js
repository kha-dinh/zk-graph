var http = require("http");
const express = require("express");
const app = express();
const path = require("path")
var exec = require('child_process').exec;
var url = require("url");

/* Open file with neovim-remote */
app.get('/open', function(req, res) {
  var params = url.parse(req.url, true).query;
  function puts(error, stdout, stderr) { console.log(stdout) }
  console.log("Openning " + params.file)
  exec("nvr " + params.file, puts);
  res.writeHead(200);
  res.end();
});

app.use(express.static(path.join(__dirname, 'public')));
// app.get('/', function(req, res) {
//   res.sendFile(path.join(__dirname + '/public/index.html'));
// });
// app.get('/graph.js', function(req, res) {
//   res.sendFile(path.join(__dirname + '/graph.js'));
// });
//
// app.get('/graph.json', function(req, res) {
//   res.sendFile(path.join(__dirname + '/graph.json'));
// });

app.set('port', process.env.PORT || 3000);

http.createServer(app).listen(app.get('port'),
  function() {
    console.log("Express server listening on port " + app.get('port'));
  });
