'use strict';


var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
const { Pool } = require('pg');
var waitOn = require('wait-on');
const WAIT_OPTS = {
  resources: [
    'tcp:postgres:5432'
  ],
  interval: 100, // poll interval in ms, default 250ms
  timeout: 30000, // timeout in ms, default Infinity
  tcpTimeout: 10000, // tcp timeout in ms, default 300ms
  window: 1000, // stabilization time in ms, default 750ms

};

const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

var _client;


const TELEMETRY_SCHEMA = `CREATE TABLE IF NOT EXISTS telemetry (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  gateway text NOT NULL,
  gatewayId text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  deviceType text NOT NULL,
  data text,
  gwTime BIGINT NOT NULL,
  edgeTime BIGINT NOT NULL
)`;

const ALERT_SCHEMA = `CREATE TABLE IF NOT EXISTS alert (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  gateway text NOT NULL,
  gatewayId text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  deviceType text NOT NULL,
  data text,
  message text,
  gwTime BIGINT NOT NULL,
  edgeTime BIGINT NOT NULL
)`;


const STATUS_SCHEMA = `
CREATE TABLE IF NOT EXISTS status (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  gateway text NOT NULL,
  gatewayId text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  data text,
  status boolean,
  gwTime BIGINT NOT NULL,
  edgeTime BIGINT NOT NULL
)`;

const GATEWAY_SCHEMA = `CREATE TABLE IF NOT EXISTS gateway (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  type text NOT NULL,
  edgeTime BIGINT NOT NULL
)`

const STATUS_INSERT = `INSERT INTO status (
  application, gateway, gatewayId, device, deviceId, data, status,gwTime,edgeTime)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);`;
const DATA_INSERT = `INSERT INTO telemetry (
  application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);`;
const JOIN_INSERT = `INSERT INTO gateway (
  application,device,deviceId,type,edgeTime)
 VALUES ($1,$2,$3,$4,$5);`;

var db;

Client.fromEnvironment(Transport, function (err, client) {
  if (err) {
    throw err;
  } else {
    _client = client;
    client.on('error', function (err) {
      throw err;
    });

    // connect to the Edge instance
    client.open(function (err) {
      if (err) {
        throw err;
      } else {
        console.log('IoT Hub module client initialized');
        // Act on input messages to the module.
        client.on('inputMessage', function (inputName, msg) {
          processMessage(client, inputName, msg);
        });
      }
    });
  }
});

// This function just pipes the messages without any change.
function processMessage(client, inputName, msg) {
  client.complete(msg, printResultFor('Receiving message'));

  if (inputName === 'input1') {
    var message = msg.getBytes().toString('utf8');
    //Dispatches over data
    if (message) {
      handleMessage(JSON.parse(message));
    }
  }
}

function handleMessage(message) {
  var result;
  if (message.type) {
    let type = message.type;
    switch (type) {
      case 'JOIN': result = handleJoin(message);
        break;
      case 'DATA': if (message.data && message.data.content) {
        if (message.data.content == 'status') {
          message.status = getStatus(message.data);
          result = handleStatus(message);
        } else if (message.data.content == 'data') {
          result = handleData(message);
        }
      }
        break;
      default:
        console.log('Message not known');
        break;
    }
  }
  return result;
}

function handleJoin(message) {
  //application,device,deviceId,type,edgeTime
  return pool.query(JOIN_INSERT, [message.application,
  message.device,
  message.deviceId,
  message.type,
  new Date().getTime()], (err, res) => {
    if (err) {
      return console.log(err.message);
    }
    // get the last insert id
    console.log(`A row has been inserted`);
    var outputMsg = new Message(message);
    _client.sendOutputEvent('gateway', outputMsg, printResultFor('Sending join message'));
  });
}

function handleData(message) {
  //application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime
  return pool.query(DATA_INSERT, [message.application,
  message.gateway,
  message.gatewayId,
  message.device,
  message.deviceId,
  message.deviceType,
  JSON.stringify(message.data),
  new Date(message.gatewayTime).getTime(),
  new Date().getTime()], (err, res) => {
    if (err) {
      return console.log(err.message);
    }
    // get the last insert id
    console.log(`Data has been inserted`);
    var outputMsg = new Message(JSON.stringify(message));
    _client.sendOutputEvent(message.deviceType, outputMsg, printResultFor('Sending data message'));
  });
}

function handleStatus(message) {
  //application, gateway, gatewayId, device, deviceId, data,gwTime,edgeTime
  return pool.query(STATUS_INSERT, [message.application,
  message.gateway,
  message.gatewayId,
  message.device,
  message.deviceId,
  JSON.stringify(message.data),
  message.status,
  new Date(message.gatewayTime).getTime(),
  new Date().getTime()], (err, res) => {
    if (err) {
      return console.log(err.message);
    }
    // get the last insert id
    console.log(`Status been inserted`);
    var outputMsg = new Message(JSON.stringify(message));
    _client.sendOutputEvent('status', outputMsg, printResultFor('Sending status message'));
  });

}

function getStatus(data) {
  var result = true;
  if (data) {
    for (var key in data) {
      if (typeof (data[key]) === 'boolean') {
        result = result && data[key];
      }
    }
  }
  return result;
}

function isAvailable() {

}

function initDB() {
  waitOn(WAIT_OPTS, function (error) {
    if (error) {
      console.log(error.message);
    } else {
      pool.query(STATUS_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created STATUS TABLE");
        }
      });
      pool.query(TELEMETRY_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created DATA TABLE");
        }
      });
      pool.query(GATEWAY_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created GATEWAY TABLE");
        }
      });
      pool.query(ALERT_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created ALERT TABLE");
        }
      });
    }
  });
  // once here, all resources are available
}
// Helper function to print results in the console
function printResultFor(op) {
  return function printResult(err, res) {
    if (err) {
      console.log(op + ' error: ' + err.toString());
    }
    if (res) {
      console.log(op + ' status: ' + res.constructor.name);
    }
  };
}

initDB();

