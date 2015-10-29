module.exports = function(RED) {
    "use strict";
    var util = require("util");
    var redis = require("redis");

    var hashFieldRE = /^([^=]+)=(.*)$/;
    // var validCmd = [
    //   'sadd', 'spop', 'smembers', 'sismember'
    // ]

    var redisConnectionPool = function() {
        var connections = {};
        var obj = {
            get: function(host,port) {
                var id = host+":"+port;
                if (!connections[id]) {
                    connections[id] = redis.createClient(port,host);
                    connections[id].on("error",function(err) {
                            util.log("[redis] "+err);
                    });
                    connections[id].on("connect",function() {
                            util.log("[redis] connected to "+host+":"+port);
                    });
                    connections[id]._id = id;
                    connections[id]._nodeCount = 0;
                }
                connections[id]._nodeCount += 1;
                return connections[id];
            },
            close: function(connection) {
                connection._nodeCount -= 1;
                if (connection._nodeCount === 0) {
                    if (connection) {
                        clearTimeout(connection.retry_timer);
                        connection.end();
                    }
                    delete connections[connection._id];
                }
            }
        };
        return obj;
    }();


    function RedisInNode(n) {
        RED.nodes.createNode(this,n);
        this.port = n.port||"6379";
        this.hostname = n.hostname||"127.0.0.1";
        this.key = n.key;
        this.structtype = n.structtype;

        this.client = redisConnectionPool.get(this.hostname,this.port);

        if (this.client.connected) {
            this.status({fill:"green",shape:"dot",text:"connected"});
        } else {
            this.status({fill:"red",shape:"ring",text:"disconnected"},true);
        }

        var node = this;
        this.client.on("end", function() {
            node.status({fill:"red",shape:"ring",text:"disconnected"});
        });
        this.client.on("connect", function() {
            node.status({fill:"green",shape:"dot",text:"connected"});
        });

        this.on("input", function(msg) {
            var k = this.key || msg.topic;
            var cmd = msg.payload[0]
            var args = msg.payload
            args.shift()

            this.client.send_command(cmd, args, function (err, reply) {
              if (err) {
                msg.payload = err
              }
              else {
                msg.payload = reply
              }
              node.send(msg)
            })
        })


        this.on("close", function() {
            redisConnectionPool.close(node.client);
        });
    }
    RED.nodes.registerType("redis in",RedisInNode);
}
