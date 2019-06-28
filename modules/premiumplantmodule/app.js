'use strict';

var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

var _job;
var _client;

const ALERT_INSERT = `INSERT INTO alert (
  application, gateway, gateway_id, device, device_id, device_type, data, message,gw_time,edge_time)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`;

var irrigationConf = {
  SM_MIN: 10,
  SM_MAX: 60,
  HUM_MIN: 20,
  HUM_MAX: 80,
  TEMP_MAX: 35
}

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
              processTwinUpdate(delta);
            });
          };
        });
        client.onMethod('config', function (request, response) {
          processRemoteConfig(request, response);
        });
        client.onMethod('status', function (request, response) {
          processRemoteStatus(request, response);
        });

      }
    });
  }
});

function processTwinUpdate(delta) {
  console.log('processTwinUpdate');
  console.log(delta);
}


function processRemoteInvocation(request, response) {
  console.log('processRemoteInvocation');
  if (request.payload) {
    console.log('Payload:');
    console.dir(request.payload);
  }
  var responseBody = {
    message: 'remoteMethod'
  };
  response.send(200, responseBody, function (err) {
    if (err) {
      console.log('failed sending method response: ' + err);
    } else {
      console.log('successfully sent method response');
    }
  });
}

// This function just pipes the messages without any change.
function processMessage(client, inputName, msg) {
  client.complete(msg, printResultFor('Receiving message'));
  if (inputName === 'data') {
    var message = msg.getBytes().toString('utf8');
    if (message) {
      handleMessage(JSON.parse(message));
    }
  }
}

function handleMessage(data) {
  var result;
  //Publish message
  data.type = 'DATA';
  var outputMsg = new Message(JSON.stringify(data));
  _client.sendOutputEvent('data', outputMsg, printResultFor('Sending received message'));
  handleAlerts(data);
}

function buildResult(data, msg) {
  var result = {};
  result.application = data.application;
  result.gateway = data.gateway;
  result.gateway_id = data.gateway_id ? data.gateway_id : data.gateway_id;
  result.device = data.device;
  result.device_id = data.device_id ? data.device_id : data.device_id;
  result.device_type = data.device_type ? data.device_type : data.device_type;
  result.data = data.data;
  result.message = msg;
  result.status = false;
  if (data.gw_time) {
    result.gateway_time = data.gw_time;
  } else {
    result.gateway_time = new Date(data.gateway_time).getTime();
  }
  return result;
}

function handleAlerts(content) {
  if (content.data) {
    var data = content.data;
    if (data.sm > irrigationConf.SM_MAX) {
      var alertMessage = {};
      alertMessage.message = 'High Soil Moisture';
    } else if (data.sm < irrigationConf.SM_MIN) {
      var alertMessage = {};
      alertMessage.message = 'Low Soil Moisture';
      alertMessage.irrigation = true;
    } else if (data.humidity < irrigationConf.HUM_MIN && data.sm < irrigationConf.SM_MAX) {
      var alertMessage = {};
      alertMessage.message = 'Low Air Humidty';
      alertMessage.irrigation = true;
    } else if (data.temperature > irrigationConf.TEMP_MAX && data.sm < irrigationConf.SM_MAX) {
      var alertMessage = {};
      alertMessage.message = 'High temperature';
      alertMessage.irrigation = true;
    }
    if (alertMessage) {
      var result = buildResult(content, alertMessage.message);
      console.log("publish alert message");
      result.type = 'ALERT';
      var outputMsg = new Message(JSON.stringify(result));
      _client.sendOutputEvent('alert', outputMsg, printResultFor('Sending alert message'));
      persistAlert(result);
    }
  }
}

function persistAlert(message) {
  //application, gateway, gateway_id, device, device_id, device_type, data, message,gw_time,edge_time
  return pool.query(ALERT_INSERT, [message.application,
  message.gateway,
  message.gateway_id,
  message.device,
  message.device_id,
  message.device_type,
  JSON.stringify(message.data),
  message.message,
  new Date(message.gateway_time).getTime(),
  new Date().getTime()
  ], (err, res) => {
    if (err) {
      return console.log(err.message);
    }
    // get the last insert id
    console.log(`Alert has been inserted`);
  });
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
//{"irrigationConf":{"SM_MIN":20}}
function processRemoteConfig(request, response) {
  console.log('processConfigInvocation');
  var changed = false;
  if (request.payload) {
    console.log('Request:' + JSON.stringify(request.payload));
    let content = request.payload;
    if (content.irrigationConf) {
      let data = content.irrigationConf;
      for (const parm in irrigationConf) {
        if (data[parm]) {
          changed = changed || true;
          irrigationConf[parm] = data[parm];
        }
      }
      reporTwinProperties({ irrigationConf: irrigationConf });
    }
  }
  var responseBody = {}
  var result = {}
  if (changed) {
    result.message = 'updated';
    result.data = JSON.stringify({ newConf: irrigationConf })
  } else {
    result.message = 'no update';
  }
  responseBody.result = result;
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

function reporTwinProperties(patch) {
  _client.getTwin(function (err, twin) {
    if (err) {
      console.log('Error obtaining twin');
    } else {
      // send the patch
      twin.properties.reported.update(patch, function (err) {
        if (err) throw err;
        console.log('twin state reported');
      });
    }
  });
}
