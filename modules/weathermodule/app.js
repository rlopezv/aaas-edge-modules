'use strict';

var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
var Scheduler = require('node-schedule');
var _job;
var _client;

const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

const DATA_LAST_SELECT = `SELECT application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime 
FROM telemetry where deviceType = 'WEATHER' and gwTime > $2 and deviceId = $1 ORDER BY  gwTime DESC limit 1`;

const UPDATE_LAST_SEND = `
UPDATE auditupload set uploadtime = $3
WHERE deviceId = $1 AND deviceType = $2`;

const INSERT_LAST_SEND = `
INSERT INTO auditupload (deviceId, deviceType, uploadtime)
VALUES ($1,$2,$3)`;
const SELECT_LAST_SEND = `select telemetry.deviceId as deviceId,telemetry.deviceType as deviceType, MAX(auditupload.uploadtime) as uploadtime
from telemetry
LEFT OUTER JOIN auditupload
    ON auditupload.deviceId=telemetry.deviceId
WHERE telemetry.deviceType = 'WEATHER'
group by 1,2`;

//*/15 * * * *
const DEFAULT_SCHEDULING = '*/15 * * * *';

var _scheduling;

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
        });
      }
    });
  }
});

function processTwinUpdate(twin, delta) {
  console.log('processTwinUpdate');
  console.log(delta);
  if (delta.schedule && !twin.properties.reported.schedule) {
    processScheduling(delta.schedule);
  } else {
    if (!_scheduling) {
      if (twin.properties.reported.schedule) {
        processScheduling(twin.properties.reported.schedule);
      } else {
        processScheduling(DEFAULT_SCHEDULING);
      }
    }
  }
}

function processScheduling(exp) {
  console.log('processScheduling');
  if (exp !== _scheduling) {
    if (_job && _job != null) {
      _job.cancel();
    }
    _scheduling = exp;
    _job = Scheduler.scheduleJob(exp, function () { handleSchedule(exp); });
    reporTwinProperties({ schedule: exp });
  }
}

function handleSchedule(exp) {
  processLastMeasures();
  console.log("Next invocation" + _job.nextInvocation());

}

function processLastMeasures(data) {
  pool.query(SELECT_LAST_SEND, [], (err, res) => {
    if (err) {
      console.log('Error retrieving data');
    } else {
      if (res.rows && res.rows.length > 0) {
        for (var row of res.rows) {
          processLastMeasure(row);
        }
      }
    }
  })
}

function processLastMeasure(data) {

  var fromTime = data.uploadtime;
  if (!fromTime || fromTime == null) {
    fromTime = 0;
  }

  pool.query(DATA_LAST_SELECT, [data.deviceid,fromTime], (err, res) => {
    if (err) {
      console.log('Error retrieving data');
    } else {
      if (res.rows && res.rows.length == 1) {
        processLastSent(fromTime,data, res.rows[0]);
      } else {
        processLastSent(fromTime,data);
      }
    }
  });
}

function processLastSent(time, data, row) {
  var sentTime = new Date().getTime();
  var query = UPDATE_LAST_SEND;
  if (time == 0) {
    query = INSERT_LAST_SEND;
  }
  pool.query(query, [data.deviceid,
  data.devicetype, sentTime], (err, res) => {
    if (err) {
      return console.log(err.message);
    } else {
      // get the last insert id
      
      console.log(`A row has been inserted`);
      if (row) {
      row.data = JSON.parse(row.data);
      row.type = 'DATA';
      var outputMsg = new Message(JSON.stringify(row));
      _client.sendOutputEvent('weather', outputMsg, printResultFor('Sending last message'));
    } else {
      console.log('No data to send');
    }
    }
  });

}
function processRows(data) {
  var result = {};
  if (data && Array.isArray(data) && data.length > 0) {
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


// This function just pipes the messages without any change.
function processMessage(client, inputName, msg) {
  client.complete(msg, printResultFor('Receiving message'));
  console.log('Does nothing');
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
  if (content.scheduling) {
    processScheduling(content.scheduling);
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

