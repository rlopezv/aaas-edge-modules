'use strict';

var Transport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').ModuleClient;
var Message = require('azure-iot-device').Message;

const zambrettiConf = {
  pressureUpper : 995,
  pressureLower: 1005,
  hemisphere: 1,
  defaultWind: 1
} 
const { Pool } = require('pg');
const connectionString = 'postgresql://postgres:docker@postgres/aaas_db';
const poolConfig = {
  connectionString: connectionString
};
const pool = new Pool(poolConfig);

var _job;
var _client;

const ALERT_INSERT = `INSERT INTO alert (
  application, gateway, gatewayId, device, deviceId, data, status,gwTime,edgeTime)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);`;

 const SELECT_LAST_MEASURE = `SELECT data
 FROM telemetry where deviceType = 'WEATHER' and gwTime < $1 and deviceId = $2 limit 1`;

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
          client.onMethod('config', function(request, response) {
            processConfigRequest(request,response);
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

function processConfigRequest(request, response) {
  console.log('processConfigInvocation');
  var changed = false;
  if(request.payload) {
    console.log('Request:'+JSON.stringify(requestPayload));
    let content = request.payload;
    if (content.zambrettiConf) {
      let data = content.zambrettiConf;
      for (const parm in zambrettiConf) {
        if (data[parm]) {
          changed = changed || true;
          zambrettiConf[parm] = data[parm];
        }
      }
    } 
  }
  var responseBody = {}
  var result = {}
  if (changed) {
    result.message = 'updated';
    result.data = JSON.stringify({newConf:zambrettiConf})
  } else {
    result.message = 'no update';
  }
  responseBody.result = result;
  response.send(200, responseBody, function(err) {
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
  var result;
  //Publish message
  var outputMsg = new Message(JSON.stringify(data));
  _client.sendOutputEvent('data', outputMsg, printResultFor('Sending received message'));
  handleAlerts(data);
}

function handleAlerts(content) {
 
  var result = {};
  if (content.data) {
    var data = content.data;
   let forecast = forecast(data.pressure,new Date().getMonth()+1,zambrettiConf.defaultWind,getTrend(content),zambrettiConf.hemisphere, zambrettiConf.pressureUpper, zambrettiConf.pressureLower);

   if (forecast && forecast[1]) {
       result.message = forecast[0];
       result.change = forecast[1];
       result.data = data.data;
       console.log("publish weather message");
       var outputMsg = new Message(JSON.stringify(result));
       _client.sendOutputEvent('alert', outputMsg, printResultFor('Sending alert message'));
       persistAlert(result);
  }
  console.log(result);
}
return result;
}

function getTrend(content) {
  return ;
}

function persistAlert(message) {
  //application, gateway, gatewayId, device, deviceId, data,gwTime,edgeTime
  return pool.query(ALERT_INSERT,[message.application,
    message.gateway,
    message.gatewayId,
    message.device,
    message.deviceId,
    JSON.stringify(message.data),
    getStatus(message.data),
    new Date(message.gatewayTime).getTime(),
    new Date().getTime()], (err,res) => {
      if (err) {
        return console.log(err.message);
      }
      // get the last insert id
      console.log(`Alert has been inserted with rowid ${res.row[0]}`);
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

var content = {};
content.data = {};
content.data.pressure = 1020;

// beteljuice.com - near enough Zambretti Algorhithm 
// June 2008 - v1.0
// tweak added so decision # can be output

/* Negretti and Zambras 'slide rule' is supposed to be better than 90% accurate 
for a local forecast upto 12 hrs, it is most accurate in the temperate zones and about 09:00  hrs local solar time.
I hope I have been able to 'tweak it' a little better ;-)	

This code is free to use and redistribute as long as NO CHARGE is EVER made for its use or output
*/

// ---- 'environment' variables ------------
var z_where = 1;  // Northern = 1 or Southern = 2 hemisphere
var z_baro_top = 1050;	// upper limits of your local 'weather window' (1050.0 hPa for UK)
var z_baro_bottom = 950;	// lower limits of your local 'weather window' (950.0 hPa for UK)

// usage:   forecast = betel_cast( z_hpa, z_month, z_wind, z_trend [, z_where] [, z_baro_top] [, z_baro_bottom])[0];

// z_hpa is Sea Level Adjusted (Relative) barometer in hPa or mB
// z_month is current month as a number between 1 to 12
// z_wind is English windrose cardinal eg. N, NNW, NW etc.
// NB. if calm a 'nonsense' value should be sent as z_wind (direction) eg. 1 or calm !
// z_trend is barometer trend: 0 = no change, 1= rise, 2 = fall
// z_where - OPTIONAL for posting with form
// z_baro_top - OPTIONAL for posting with form
// z_baro_bottom - OPTIONAL for posting with form
// [0] a short forecast text is returned
// [1] zambretti severity number (0 - 25) is returned ie. betel_cast() returns a two deep array


var z_forecast = new Array("Settled fine", "Fine weather", "Becoming fine", "Fine, becoming less settled", "Fine, possible showers", "Fairly fine, improving", "Fairly fine, possible showers early", "Fairly fine, showery later", "Showery early, improving", "Changeable, mending", "Fairly fine, showers likely", "Rather unsettled clearing later", "Unsettled, probably improving", "Showery, bright intervals", "Showery, becoming less settled", "Changeable, some rain", "Unsettled, short fine intervals", "Unsettled, rain later", "Unsettled, some rain", "Mostly very unsettled", "Occasional rain, worsening", "Rain at times, very unsettled", "Rain at frequent intervals", "Rain, very unsettled", "Stormy, may improve", "Stormy, much rain"); 

// equivalents of Zambretti 'dial window' letters A - Z
var rise_options  = new Array(25,25,25,24,24,19,16,12,11,9,8,6,5,2,1,1,0,0,0,0,0,0) ; 
var steady_options  = new Array(25,25,25,25,25,25,23,23,22,18,15,13,10,4,1,1,0,0,0,0,0,0) ; 
var fall_options =  new Array(25,25,25,25,25,25,25,25,23,23,21,20,17,14,7,3,1,1,1,0,0,0) ; 

var z_test = new Array();

// ---- MAIN FUNCTION --------------------------------------------------
function forecast( z_hpa, z_month, z_wind, z_trend, z_hemisphere, z_upper, z_lower) {
	if(z_hemisphere) z_where = z_hemisphere;	// used by input form
	if(z_upper) z_baro_top = z_upper;	// used by input form
	if(z_lower) z_baro_bottom = z_lower; 	// used by input form
	var z_range = z_baro_top - z_baro_bottom;
    var z_constant = (z_range / 22).toFixed(3);
    var z_test = [];

	var z_season = (z_month >= 4 && z_month <= 9) ; 	// true if 'Summer'
	if (z_where == 1) {  		// North hemisphere
		if (z_wind == "N") {  
			z_hpa += 6 / 100 * z_range ;  
		} else if (z_wind == "NNE") {  
			z_hpa += 5 / 100 * z_range ;  
		} else if (z_wind == "NE") {  
//			z_hpa += 4 ;  
			z_hpa += 5 / 100 * z_range ;  
		} else if (z_wind == "ENE") {  
			z_hpa += 2 / 100 * z_range ;  
		} else if (z_wind == "E") {  
			z_hpa -= 0.5 / 100 * z_range ;  
		} else if (z_wind == "ESE") {  
//			z_hpa -= 3 ;  
			z_hpa -= 2 / 100 * z_range ;  
		} else if (z_wind == "SE") {  
			z_hpa -= 5 / 100 * z_range ;  
		} else if (z_wind == "SSE") {  
			z_hpa -= 8.5 / 100 * z_range ;  
		} else if (z_wind == "S") {  
//			z_hpa -= 11 ;  
			z_hpa -= 12 / 100 * z_range ;  
		} else if (z_wind == "SSW") {  
			z_hpa -= 10 / 100 * z_range ;  //
		} else if (z_wind == "SW") {  
			z_hpa -= 6 / 100 * z_range ;  
		} else if (z_wind == "WSW") {  
			z_hpa -= 4.5 / 100 * z_range ;  //
		} else if (z_wind == "W") {  
			z_hpa -= 3 / 100 * z_range ;  
		} else if (z_wind == "WNW") {  
			z_hpa -= 0.5 / 100 * z_range ;  
		}else if (z_wind == "NW") {  
			z_hpa += 1.5 / 100 * z_range ;  
		} else if (z_wind == "NNW") {  
			z_hpa += 3 / 100 * z_range ;  
		} 
		if (z_season == 1) {  	// if Summer
			if (z_trend == 1) {  	// rising
				z_hpa += 7 / 100 * z_range;  
			} else if (z_trend == 2) {  //	falling
				z_hpa -= 7 / 100 * z_range; 
			} 
		} 
	} else {  	// must be South hemisphere
		if (z_wind == "S") {  
			z_hpa += 6 / 100 * z_range ;  
		} else if (z_wind == "SSW") {  
			z_hpa += 5 / 100 * z_range ;  
		} else if (z_wind == "SW") {  
//			z_hpa += 4 ;  
			z_hpa += 5 / 100 * z_range ;  
		} else if (z_wind == "WSW") {  
			z_hpa += 2 / 100 * z_range ;  
		} else if (z_wind == "W") {  
			z_hpa -= 0.5 / 100 * z_range ;  
		} else if (z_wind == "WNW") {  
//			z_hpa -= 3 ;  
			z_hpa -= 2 / 100 * z_range ;  
		} else if (z_wind == "NW") {  
			z_hpa -= 5 / 100 * z_range ;  
		} else if (z_wind == "NNW") {  
			z_hpa -= 8.5 / 100 * z_range ;  
		} else if (z_wind == "N") {  
//			z_hpa -= 11 ;  
			z_hpa -= 12 / 100 * z_range ;  
		} else if (z_wind == "NNE") {  
			z_hpa -= 10 / 100 * z_range ;  //
		} else if (z_wind == "NE") {  
			z_hpa -= 6 / 100 * z_range ;  
		} else if (z_wind == "ENE") {  
			z_hpa -= 4.5 / 100 * z_range ;  //
		} else if (z_wind == "E") {  
			z_hpa -= 3 / 100 * z_range ;  
		} else if (z_wind == "ESE") {  
			z_hpa -= 0.5 / 100 * z_range ;  
		}else if (z_wind == "SE") {  
			z_hpa += 1.5 / 100 * z_range ;  
		} else if (z_wind == "SSE") {  
			z_hpa += 3 / 100 * z_range ;  
		} 
		if (z_season == 0) { 	// if Winter
			if (z_trend == 1) {  // rising
				z_hpa += 7 / 100 * z_range;  
			} else if (z_trend == 2) {  // falling
				z_hpa -= 7 / 100 * z_range; 
			} 
		} 
	} 	// END North / South

	if(z_hpa == z_baro_top) z_hpa = z_baro_top - 1;
	var z_option = Math.floor((z_hpa - z_baro_bottom) / z_constant); 
 	var z_output = "";
	if(z_option < 0) {
		z_option = 0;
		z_output = "Exceptional Weather, ";
	}
	if(z_option > 21) {
		z_option = 21;
		z_output = "Exceptional Weather, ";
	}

	if (z_trend == 1) { 	// rising
		z_output += z_forecast[rise_options[z_option]] ; 
z_test[1] = rise_options[z_option];
	} else if (z_trend == 2) { 	// falling
		z_output += z_forecast[fall_options[z_option]] ; 
z_test[1] = fall_options[z_option];
	} else { 	// must be 'steady'
		z_output += z_forecast[steady_options[z_option]] ; 
z_test[1] = steady_options[z_option];
	} 
//	return z_output ; 
z_test[0] = z_output ;
return z_test ; 
}	// END function   		
		
