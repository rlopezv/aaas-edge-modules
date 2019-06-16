'use strict';


var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
var sqlite3 = require('sqlite3').verbose();

const PATH = "/aaas/data/test.db";

const DB_SCHEMA = `CREATE TABLE IF NOT EXISTS telemetry (
  id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  application text NOT NULL,
  gateway text NOT NULL,
  gatewayId text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  deviceType text NOT NULL,
  data text,
  gwTime integer NOT NULL,
  edgeTime integer NOT NULL
);

CREATE TABLE IF NOT EXISTS status (
  id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  application text NOT NULL,
  gateway text NOT NULL,
  gatewayId text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  data text,
  status integer,
  gwTime integer NOT NULL,
  edgeTime integer NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway (
  id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  application text NOT NULL,
  device text NOT NULL,
  deviceId text NOT NULL,
  type text NOT NULL,
  edgeTime integer NOT NULL
);`

const STATUS_INSERT = `INSERT INTO status (
  application, gateway, gatewayId, device, deviceId, data, status,gwTime,edgeTime)
 VALUES (?,?,?,?,?,?,?,?,?);`;;
const DATA_INSERT = `INSERT INTO telemetry (
  application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime)
 VALUES (?,?,?,?,?,?,?,?,?);`;
const JOIN_INSERT = `INSERT INTO gateway (
  application,device,deviceId,type,edgeTime)
 VALUES (?,?,?,?,?);`;

var db;

Client.fromEnvironment(Transport, function (err, client) {
  if (err) {
    throw err;
  } else {
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
        initDB();
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

    if (message) {
      if (handleMessage(JSON.parse(message))) {
        var outputMsg = new Message(message);
      }
      
      //client.sendOutputEvent('output1', outputMsg, printResultFor('Sending received message'));
    }
  }
}

function handleMessage(message) {
  var result;
  if (message.type) {
    let type = message.type;
    switch(type) {
      case 'JOIN': result = handleJoin(message);
      break;
      case 'DATA': if (message.data && message.data.content) {
        if (message.data.content=='status') {
          result = handleStatus(message);
        } else if (message.data.content=='data') {
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
    return db.run(JOIN_INSERT,[message.application,message.device,message.deviceId,message.type,new Date().getTime()]);
}

function handleData(message) {
  //application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime
  return db.run(DATA_INSERT,[message.application,
    message.gateway,
    message.gatewayId,
    message.device,
    message.deviceId,
    message.deviceType,
    JSON.stringify(message.data),
    new Date(message.gatewayTime).getTime(),
    new Date().getTime()]);
}

function handleStatus(message) {
  //application, gateway, gatewayId, device, deviceId, data,gwTime,edgeTime
  return db.run(STATUS_INSERT,[message.application,
    message.gateway,
    message.gatewayId,
    message.device,
    message.deviceId,
    JSON.stringify(message.data),
    getStatus(message.data),
    new Date(message.gatewayTime).getTime(),
    new Date().getTime()]);

}

function getStatus(data) {
  return true;
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

function initDB() {

    db = new sqlite3.Database(PATH, (err) => { 
    if (err) { 
        console.log('Error when creating the database', err) 
    } else { 
        console.log('Database created!');
        db.serialize(function() { 
        db.exec(DB_SCHEMA);
        });
    } 
})
}

