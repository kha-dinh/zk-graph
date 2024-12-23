var http = require("http");
const express = require("express");
const fs = require("fs");
const app = express();
const path = require("path");
var exec = require("child_process").exec;
var url = require("url");

var client = null;
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const argv = yargs(hideBin(process.argv)).parse();

console.log(argv);

const workdir = argv["W"];
console.log(workdir);

function puts(error, stdout, stderr) {
  console.log(stdout);
  console.log(stderr);
}

// zk graph --format json >.graph.json
function generate_graph() {
  exec(`zk graph --format json -W ${workdir} > public/graph.json`, puts);
  if (client) {
    sendRefresh();
  }
}

generate_graph();

fs.watch(workdir, (event, filename) => {
  generate_graph();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/subscribe", (req, res) => {
  // send headers to keep connection alive
  const headers = {
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
  };
  res.writeHead(200, headers);

  // send client a simple response
  res.write("you are subscribed\n\n");

  // store `res` of client to let us send events at will
  client = res;

  // listen for client 'close' requests
  req.on("close", () => {
    client = null;
  });
});

// send refresh event (must start with 'data: ')
function sendRefresh() {
  client.write("data: refresh\n\n");
}

/* Open file with neovim-remote */
app.get("/open", function (req, res) {
  var params = url.parse(req.url, true).query;
  console.log("Openning " + params.file);
  exec(
    "/home/khadd/.local/bin/nvr " + params.file,
    { env: { PATH: process.env.PATH } },
    puts,
  );
  res.writeHead(200);
  res.end();
});

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

app.set("port", process.env.PORT || 3000);

http.createServer(app).listen(app.get("port"), function () {
  console.log("Express server listening on port " + app.get("port"));
});
