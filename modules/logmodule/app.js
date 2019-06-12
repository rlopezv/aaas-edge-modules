'use strict';

var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;
var Scheduler = require('node-schedule');

var _job;
var _client;

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
              twin.on('properties.desired', function(delta) {
                processTwinUpdate(delta);
              });
          };
          client.onMethod('remoteMethod', function(request, response) {
            processRemoteInvocation(request,response);
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
  if (_job && _job!=null) {
    _job.cancel();
  }
  _job = Scheduler.scheduleJob(exp,function() {handleSchedule();});
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
  if(request.payload) {
    console.log('Payload:');
    console.dir(request.payload);
  }

  var responseBody = {
    message: 'remoteMethod'
  };
  response.send(200, responseBody, function(err) {
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

  console.log('inputName:%s, message:%O',inputName,msg);
  if (inputName === 'input1') {
    var message = msg.getBytes().toString('utf8');
    console.log('Message'+message);
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
