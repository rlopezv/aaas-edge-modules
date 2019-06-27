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
var _client;
var _lastNotification;

const ALERT_INSERT = `INSERT INTO alert (
  application, gateway, gatewayId, device, deviceId, deviceType, data, message,gwTime,edgeTime)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`;

 const DATA_LAST_SELECT = `SELECT application, gateway, gatewayId, device, deviceId, deviceType, data,gwTime,edgeTime 
 FROM status where deviceId = $1 ORDER BY  gwTime DESC limit 1`;
 
 const UPDATE_LAST_SEND = `
 UPDATE auditupload set uploadtime = $3
 WHERE deviceId = $1 AND deviceType = $2`;
 
 const INSERT_LAST_SEND = `
 INSERT INTO auditupload (deviceId, deviceType, uploadtime)
 VALUES ($1,$2,$3)`;

 const SELECT_LAST_SEND = `select status.deviceId as deviceId, MAX(auditupload.uploadtime) as uploadtime
 from status
 LEFT OUTER JOIN auditupload
     ON auditupload.deviceId=status.deviceId 
     AND auditupload.deviceType = 'STATUS'
 group by 1`;

var statusConf = {
  NOTIFICATION_PERIOD: 1
}

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

function handleSchedule() {
  console.log('handleSchedule');
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

  pool.query(DATA_LAST_SELECT, [data.deviceid], (err, res) => {
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

function buildResult(data,msg) {
  var result = {};
  result.application = data.application;
  result.gateway = data.gateway;
  result.gatewayId = data.gatewayId?data.gatewayId:data.gatewayid;
  result.device = data.device;
  result.deviceId = data.deviceId?data.deviceId:data.deviceid;
  result.deviceType = data.deviceType?data.deviceType:data.devicetype;
  result.data = data.data;
  result.message = msg;
  result.status = false;
  if (data.gwtime) {
    result.gatewayTime = data.gwtime;
  } else {
    result.gatewayTime = new Date(data.gatewayTime).getTime();
  }
  return result;
}

function processLastSent(time, data, row) {
  var sentTime = new Date().getTime();
  var query = UPDATE_LAST_SEND;
  if (time == 0) {
    query = INSERT_LAST_SEND;
  }
  pool.query(query, [data.deviceid,
  'STATUS', sentTime], (err, res) => {
    if (err) {
      return console.log(err.message);
    } else {
      // get the last insert id
      if (row && row.gwtime<time) {
          var result = buildResult(row,"Device not reported");
          result.type = 'ALERT';
          var alertMsg = new Message(JSON.stringify(result));
          _client.sendOutputEvent('alert', alertMsg, printResultFor('Sending alert message'));
          result.type = 'STATUS';
          var statusMsg = new Message(JSON.stringify(result));
          _client.sendOutputEvent('status', statusMsg, printResultFor('Sending status message'));
          persistAlert(result);
      } else {
        console.log('No data to send');
    }
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
    data.type = 'STATUS';
    var outputMsg = new Message(JSON.stringify(data));
    _client.sendOutputEvent('status', outputMsg, printResultFor('Sending status message'));
    handleAlerts(data);
  }
}

function handleAlerts(content) {
  if (content.data) {
    var data = content.data;
    if (content.status && !content.status) {
      var result = buildResult(content,"Device Sensors Errors");
      var outputMsg = new Message(JSON.stringify(result));
      _client.sendOutputEvent('alert', outputMsg, printResultFor('Sending alert message'));
      persistAlert(result);
    }
  }
}

function persistAlert(result) {
  //application, gateway, gatewayId, device, deviceId, deviceType, data, message,gwTime,edgeTime
  return pool.query(ALERT_INSERT, [result.application,
  result.gateway,
  result.gatewayId,
  result.device,
  result.deviceId,
  result.deviceType,
  JSON.stringify(result.data),
  result.message,
  result.gatewayTime,
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