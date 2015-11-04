module.exports = function(RED) {
  'use strict'
  var redis = require('redis')

  const CONNECTED = {fill: 'green', shape: 'dot', text: 'connected'}
      , DISCONNECTED = {fill: 'red', shape: 'ring', text: 'disconnected'}

  var redisConnectionPool = function() {
    var connections = {}
    var obj = {
      get: function(host, port) {
        var id = host + ':' + port
        if (!connections[id]) {
          var conn = redis.createClient(port, host)
          conn.nodes = []
          conn._id = id
          conn._nodeCount = 0

          conn.on('error', function(err) {
            console.log('[redis] '+ err)
          })

          conn.on('end', function () {
            conn.nodes.map(function (node) {
              node.status(DISCONNECTED)
            })
          })

          conn.on('connect', function () {
            console.log('[redis] connected to ' + host + ':' + port)
            conn.nodes.map(function (node) {
              node.status(CONNECTED)
            })
          })

          connections[id] = conn
        }
        connections[id]._nodeCount += 1
        return connections[id]
      },

      close: function(connection, nodeId) {
        connection._nodeCount -= 1
        connection.nodes = connection.nodes.filter(function (node) {
          return node.id !== nodeId
        })
        if (connection._nodeCount === 0) {
          if (connection) {
            clearTimeout(connection.retry_timer)
            connection.end()
          }
          delete connections[connection._id]
        }
      }
    }
    return obj
  }()

  function RedisCmdNode(n) {
    RED.nodes.createNode(this, n)
    var node = this
    node.port = n.port || '6379'
    node.hostname = n.hostname || '127.0.0.1'

    node.client = redisConnectionPool.get(node.hostname, node.port)
    node.client.nodes.push(node)

    node.status(node.client.connected ? CONNECTED : DISCONNECTED)

    node.on('input', function(msg) {
      var cmd = msg.payload[0]
        , args = msg.payload
      args.shift()

      node.client.send_command(cmd, args, function (err, reply) {
        msg.error = err
        msg.payload = reply
        node.send(msg)
      })
    })

    node.on('close', function() {
      redisConnectionPool.close(node.client, node.id)
    })
  }

  RED.nodes.registerType('redis cmd', RedisCmdNode)
}
