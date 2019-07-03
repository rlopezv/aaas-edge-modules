'use strict';

var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
var Scheduler = require('node-schedule');
const si = require('systeminformation');

var _job;
var _jobLastInvocation;
var _client;
var db;

const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

const DATA_SELECT = `SELECT application, gateway, gateway_id, device, device_id, device_type, data,gw_time,edge_time 
FROM telemetry where device_type = 'PLANT' and gw_time > $1`;

const DATA_LAST_SELECT = `SELECT application, gateway, gateway_id, device, device_id, device_type, data,gw_time,edge_time 
FROM telemetry where device_type = 'PLANT' and gw_time > $2 and device_id = $1 ORDER BY  gw_time DESC limit 20`;

const UPDATE_LAST_SEND = `
UPDATE auditupload set uploadtime = $3
WHERE device_id = $1 AND device_type = $2`;

const INSERT_LAST_SEND = `
INSERT INTO auditupload (device_id, device_type, uploadtime)
VALUES ($1,$2,$3)`;
const SELECT_LAST_SEND = `select telemetry.device_id as device_id,telemetry.device_type as device_type, MAX(auditupload.uploadtime) as uploadtime
from telemetry
LEFT OUTER JOIN auditupload
    ON auditupload.device_id=telemetry.device_id
WHERE telemetry.device_type = 'PLANT'
group by 1,2`;

const DEFAULT_SCHEDULING = '*/15 * * * *';

const EXCLUDED_PROPERTIES = ["gw_time","type","content"];

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
              processTwinUpdate(twin,delta);
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

function processTwinUpdate(twin,delta) {
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

function handleSchedule() {
  processLastMeasures();
  console.log("Next invocation" + _job.nextInvocation());
  //Summary
  // pool.query(DATA_SELECT, [fromTime], (err, res) => {
  //   if (err) {
  //     console.log('Error retrieving data');
  //   } else {
  //     processRows(res.rows);
  //   }
  // });
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

  //var fromTime = data.uploadtime;
  var fromTime = 0;
  if (!fromTime || fromTime == null) {
     fromTime = 0;
  }

  pool.query(DATA_LAST_SELECT, [data.device_id,fromTime], (err, res) => {
    if (err) {
      console.log('Error retrieving data');
    } else {
      if (res.rows && res.rows.length>0) {
        processLastSent(fromTime,data, res.rows);
    } else {
        console.log("No data to send");
    }
  }
});
}

function processLastSent(time, data, rows) {
  var sentTime = new Date().getTime();
  var query = UPDATE_LAST_SEND;
  if (time == 0) {
    query = INSERT_LAST_SEND;
  }
  pool.query(query, [data.device_id,
  data.device_type, sentTime], (err, res) => {
    if (err) {
      return console.log(err.message);
    } else {
      // get the last insert id
      console.log(`A row has been inserted`);
      if (rows) {
      var average = processRows(rows);
      var outputMsg = new Message(JSON.stringify(average));
      _client.sendOutputEvent('plant', outputMsg, printResultFor('Sending last summary'));
    } else {
      console.log('No data to send');
    }
    }
  });

}
function processRows(data) {
  var result = {};
  result.type = 'DATA';
  result.edge_time = new Date().toISOString();
  result.application = data[0].application;
  result.gateway = data[0].gateway;
  result.gateway_id = data[0].gateway_id;
  result.device = data[0].device;
  result.device_id = data[0].device_id;
  result.device_type = data[0].device_type;
  result.gateway_time = new Date().toISOString();
  if (data && Array.isArray(data) && data.length > 0) {
    var values = [];
    for (var datum of data) {
      datum = JSON.parse(datum.data);
      var element = {};
      for (const key of Object.getOwnPropertyNames(datum)) {
        if (EXCLUDED_PROPERTIES.indexOf(key)<0) {
          element[key] = datum[key];
        }
      }
      values.push(element);
    }
    var avg = summary(values);
    result.data = {};
    for (const value of avg) {
      result.data[value.name] = value.average;
    }
    result.data.content = "data";
    result.data.type = "PLANT";
    result.avg_time = new Date().toISOString();
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
  return { status: true, time:new Date().getTime() };
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
