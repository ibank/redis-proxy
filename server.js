var net = require('net');
var fs = require('fs');
var util = require('util');
var RedisProxy = require('./lib/redis_proxy');
var stats = require('./lib/stats')
var logger = require('winston');

var configFile = process.argv[2] || "config/config.json";
logger.info('using '+ configFile + ' as configuration source');
var config = JSON.parse(fs.readFileSync(configFile));
var redis_proxy = new RedisProxy(config);
var bindAddress = config.bind_address || "127.0.0.1",
    listenPort = config.listen_port || 9999;
logger.level = config.debug ? 'debug' : 'info';

var server = net.createServer(function (socket) {
  logger.debug('client connected');
  socket.on('end', function() {
    logger.debug('client disconnected');
    // Hack to get the connection identifier, so that we can release the connection
    // the usual socket.remoteAddress, socket.remotePort don't seem to work after connection has ended.
    if(this._peername){
      redis_proxy.quit(this._peername.address+':'+this._peername.port);
    }
  });

  socket.on('data', function(data) {
    stats.incr("requests");
    var command = data.toString('utf8'), id = socket.remoteAddress+':'+socket.remotePort;
    redis_proxy.sendCommand(command, id, function(err, res) {
      if(err){
        stats.incr("response:errors");
        logger.error(err);
      }
      if(res){
        stats.incr("responses");
        socket.write(res.toString('utf8'));
      }
      if(/quit/i.test(data)){
        logger.debug('QUIT command received closing the connection' );
        socket.end();
      }
    });
  });
})

stats.set("start_time", new Date().valueOf());
redis_proxy.watch();

if(config.show_web_ui){
  logger.info("Starting the web UI.");
  require('./lib/webui')(config);
}

server.listen(listenPort, bindAddress);
logger.info("Redis proxy is listening on " +bindAddress+" : " + listenPort);
