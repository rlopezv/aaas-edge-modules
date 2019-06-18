'use strict';

var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
var Scheduler = require('node-schedule');
const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

var _job;
var _jobLastInvocation;
var _client;

const DAY_PERIOD = 24 * 60 * 60 * 1000;
const DATA_SELECT = `SELECT application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime 
FROM telemetry where deviceType = 'WEATHER' and gwTime > $1`;


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
          client.onMethod('remoteMethod', function (request, response) {
            processRemoteInvocation(request, response);
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
  let fromTime;
  if (_jobLastInvocation) {
    fromTime = _jobLastInvocation.getTime();
  } else {
    fromTime = new Date().getTime() - DAY_PERIOD;
  }
  pool.query(DATA_SELECT, [fromTime], (err, rest) => {
    if (err) {
      console.log('Error retrieving data');
    } else {
      processRows(res.rows);
    }
  });
}

function processRows(data) {
  var result = {};
  if (data && Array.isArray(data)) {
    var values = [];
    for (const value of data) {
      values.push(JSON.parse(value.data));
    }
    var avg = summary(values);
    result = JSON.parse(JSON.stringify(data[0]));
    result.data = {};
    for (const value of avg) {
      result.data[value.name] = value.average;
    }
    result.avgTime = new Date().toISOString();
    _jobLastInvocation = new Date();
    var outputMsg = new Message(JSON.stringify(result));
    _client.sendOutputEvent('output1', outputMsg, printResultFor("Scheduled Task executed")); 
  }
  return result;
}

function summary(data) {
  return Array.from(data.reduce(
    (acc, obj) => Object.keys(obj).reduce(
      (acc, key) => typeof obj[key] == "number"
        ? acc.set(key, ( // immediately invoked function:
          ([sum, count]) => [sum + obj[key], count + 1]
        )(acc.get(key) || [0, 0])) // pass previous value
        : acc,
      acc),
    new Map()),
    ([name, [sum, count]]) => ({ name, average: sum / count })
  );
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
  if (inputName === 'input1') {
    var message = msg.getBytes().toString('utf8');
    if (message) {
      var outputMsg = new Message(message);
      client.sendOutputEvent('output1', outputMsg, printResultFor('Sending received message'));
    }
  }
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

