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
var _lastNotification;

const ALERT_INSERT = `INSERT INTO alert (
  application, gateway, gatewayId, device, deviceId, deviceType, data, message,gwTime,edgeTime)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`;

var statusConf = {
  NOTIFICATION_PERIOD: 1
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
          client.onMethod('config', function (request, response) {
            processRemoteConfig(request, response);
          });
          client.onMethod('status', function (request, response) {
            processRemoteStatus(request, response);
          });
        });
      }
    });
  }
});

function processTwinUpdate(delta) {
  console.log('processTwinUpdate');
  console.log(delta);
  if (delta.schedule) {
    processScheduling(delta.schedule);
  }

}

function processScheduling(exp) {
  console.log('processScheduling');
  if (_job && _job != null) {
    _job.cancel();
  }
  _job = Scheduler.scheduleJob(exp, function () { handleSchedule(); });
  console.log("Next invocation" + _job.nextInvocation());
}

function handleSchedule() {
  console.log('handleSchedule');
  var outputMsg = new Message("schedule");
  _client.sendOutputEvent('output1', outputMsg, printResultFor("Scheduled Task executed"));
  console.log("Next invocation" + _job.nextInvocation());
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
  //Publish message
  if (data.status) {
    var outputMsg = new Message(JSON.stringify(data));
    _client.sendOutputEvent('data', outputMsg, printResultFor('Sending status message'));
    handleAlerts(data);
  }
}

function handleAlerts(content) {
  var result = {};

  if (content.data) {
    var data = content.data;
    if (content.status && !content.status) {
      result.message = {};
      result.message.message = "Device Sensors Errors";
      result.data = data;
      if (!_lastNotification || new Date().getTime() > _lastNotification.getTime() + statusConf.NOTIFICATION_PERIOD * 60 * 1000) {
        var outputMsg = new Message(JSON.stringify(result));
        _client.sendOutputEvent('alert', outputMsg, printResultFor('Sending alert message'));
        _lastNotification = new Date();
      }
      
      persistAlert(content,result);
    }
  }
}

function persistAlert(message, result) {
  //application, gateway, gatewayId, device, deviceId, deviceType, data, message,gwTime,edgeTime
  return pool.query(ALERT_INSERT, [message.application,
  message.gateway,
  message.gatewayId,
  message.device,
  message.deviceId,
  message.deviceType?message.deviceType:"DEFAULT",
  JSON.stringify(message.data),
  JSON.stringify(result.message),
  new Date(message.gatewayTime).getTime(),
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

function processRemoteConfig(request, response) {
  console.log('received configuration');
  var content = null; 
  if (request.payload) {
    console.log(request.payload);
    content = request.payload;
  }
  var responseBody = {
    message: 'processed'
  };
  response.send(200, responseBody, function (err) {
    if (err) {
      console.log('failed sending method response: ' + err);
    } else {
      console.log('successfully sent method response');
    }
  });
}

function getStatusInfo() {
  return { status: true, time:new Date().getTime() };
}