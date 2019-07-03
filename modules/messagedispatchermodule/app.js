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
  window: 1000 // stabilization time in ms, default 750ms
};

const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

var _client;

//Table for telemetry messages table
const TELEMETRY_SCHEMA = `CREATE TABLE IF NOT EXISTS telemetry (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  gateway text NOT NULL,
  gateway_id text NOT NULL,
  device text NOT NULL,
  device_id text NOT NULL,
  device_type text NOT NULL,
  data text,
  gw_time BIGINT NOT NULL,
  edge_time BIGINT NOT NULL
)`;

//Table for alert messages table
const ALERT_SCHEMA = `CREATE TABLE IF NOT EXISTS alert (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  gateway text NOT NULL,
  gateway_id text NOT NULL,
  device text NOT NULL,
  device_id text NOT NULL,
  device_type text NOT NULL,
  data text,
  message text,
  gw_time BIGINT NOT NULL,
  edge_time BIGINT NOT NULL
)`;

//Table for sent messages table
const AUDIT_SENT_SCHEMA = `CREATE TABLE IF NOT EXISTS auditupload (
  device_id text NOT NULL,
  device_type text NOT NULL,
  uploadTime BIGINT NOT NULL
)`;

//Table for status messages table
const STATUS_SCHEMA = `
CREATE TABLE IF NOT EXISTS status (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  gateway text NOT NULL,
  gateway_id text NOT NULL,
  device text NOT NULL,
  device_id text NOT NULL,
  device_type text NOT NULL,
  data text,
  status boolean,
  gw_time BIGINT NOT NULL,
  edge_time BIGINT NOT NULL
)`;

const GATEWAY_SCHEMA = `CREATE TABLE IF NOT EXISTS gateway (
  id SERIAL NOT NULL PRIMARY KEY,
  application text NOT NULL,
  device text NOT NULL,
  device_id text NOT NULL,
  type text NOT NULL,
  edge_time BIGINT NOT NULL
)`

const STATUS_INSERT = `INSERT INTO status (
  application, gateway, gateway_id, device, device_id, device_type, data, status,gw_time,edge_time)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`;
const DATA_INSERT = `INSERT INTO telemetry (
  application, gateway, gateway_id, device, device_id, device_type, data,gw_time,edge_time)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);`;
const JOIN_INSERT = `INSERT INTO gateway (
  application,device,device_id,type,edge_time)
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
        client.getTwin(function (err, twin) {
          if (err) {
            console.error('Error getting twin: ' + err.message);
          } else {
            twin.on('properties.desired', function (delta) {
              processTwinUpdate(twin, delta);
            });
          };
          client.onMethod('config', function (request, response) {
            processRemoteConfig(request, response);
          });
          client.onMethod('status', function (request, response) {
            processRemoteStatus(request, response);
          });
          client.onMethod('command', function (request, response) {
            processCommand(request, response);
          });
        });
      }
    });
  }
});

// This function just pipes the messages without any change.
function processMessage(client, inputName, msg) {
  client.complete(msg, printResultFor('Receiving message'));
  if (inputName === 'message') {
    var message = msg.getBytes().toString('utf8');
    //Dispatches over data
    if (message) {
      handleMessage(JSON.parse(message));
    }
  } else {
    console.log(`Unknown message (%s):%s`,inputName,msg.getBytes().toString('utf8'));
  }
}

//Process message recevived
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

//inserts join data
function handleJoin(message) {
  //application,device,device_id,type,edge_time
  return pool.query(JOIN_INSERT, [message.application,
  message.device,
  message.device_id,
  message.type,
  new Date().getTime()], (err, res) => {
    if (err) {
      return console.log(err.message);
    }
    // get the last insert id
    console.log(`A row has been inserted`);
    var outputMsg = new Message(JSON.stringify(message));
    _client.sendOutputEvent('gateway', outputMsg, printResultFor('Sending join message'));
  });
}

//Inserts data event
function handleData(message) {
  //application, gateway, gateway_id, device, device_id, device_type, data,gw_time,edge_time
  return pool.query(DATA_INSERT, [message.application,
  message.gateway,
  message.gateway_id,
  message.device,
  message.device_id,
  message.device_type,
  JSON.stringify(message.data),
  new Date(message.gateway_time).getTime(),
  new Date(message.edge_time).getTime()], (err, res) => {
    if (err) {
      return console.log(err.message);
    }
    // get the last insert id
    console.log(`Data has been inserted`);
    var outputMsg = new Message(JSON.stringify(message));
    _client.sendOutputEvent(message.device_type.toLowerCase() , outputMsg, printResultFor('Sending data message'));
  });
}

//Inserts status event
function handleStatus(message) {
  return pool.query(STATUS_INSERT, [message.application,
  message.gateway,
  message.gateway_id,
  message.device,
  message.device_id,
  message.device_type,
  JSON.stringify(message.data),
  message.status,
  new Date(message.gateway_time).getTime(),
  new Date(message.edge_time).getTime()], (err, res) => {
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


function initDB() {
  waitOn(WAIT_OPTS, function (error) {
    if (error) {
      console.log(error.message);
    } else {
      pool.query(STATUS_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created or Updated STATUS TABLE");
        }
      });
      pool.query(TELEMETRY_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created or Updated  DATA TABLE");
        }
      });
      pool.query(GATEWAY_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created or Updated  GATEWAY TABLE");
        }
      });
      pool.query(ALERT_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created or Updated  ALERT TABLE");
        }
      });
      pool.query(AUDIT_SENT_SCHEMA, (err, res) => {
        if (err) {
          console.log(err.message);
        } else {
          console.log("Created or Updated  AUDIT SENT TABLE");
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

function processRemoteStatus(request, response) {
  console.log('received status');
  if (request.payload) {
    console.log('Payload:');
    console.dir(request.payload);
  }
  var responseBody = {};
  responseBody.result = getStatusInfo();
  response.send(200, responseBody, function (err) {
    if (err) {
      console.log('failed sending method response: ' + err);
    } else {
      console.log('successfully sent method response');
    }
  });
}

function processRemoteConfig(request, response) {
  console.log('received configuration request');
  var content = null;
  if (request.payload) {
    console.log(request.payload);
    content = request.payload;
  }
  
  response.send(200, responseBody, function (err) {
    if (err) {
      console.log('failed sending method response: ' + err);
    } else {
      console.log('successfully sent method response');
    }
  });
}

function getStatusInfo() {
  return { status: true, time: new Date().getTime() };
}

//{"command":"command","value":"value","device_id":"ead31f10c9610e41"}
function processCommand(request, response) {
  console.log('received command');
  var command = {};
  if (request.payload) {
    console.log('Payload:');
    console.dir(request.payload);
    command.device_id = request.payload.device_id;
    command.command = request.payload.command;
    command.value = request.payload.value;
  }
  if (command.command && command.value) {
    var outputMsg = new Message(JSON.stringify(command));
    _client.sendOutputEvent('command', outputMsg, function (err,result) {
      var responseBody = {};
      var responseCode = 200;
      if (err) {
        resposeCode = 500;
        responseBody = err.message;
      } else {
        responseBody = "command sent";
      }
      response.send(responseCode, responseBody, function (err) {
        if (err) {
          console.log('failed sending method response: ' + err);
        } else {
          console.log('successfully sent method response');
        }
      });
    }
  );
}
}

function processTwinUpdate(twin, delta) {
  console.log('processTwinUpdate');
  console.log(delta);
}

initDB();

