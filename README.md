#Edge modules

##Install edge runtime environment in rPi

sudo apt-get update

sudo apt-get dist-upgrade


### Download and install the moby-engine
curl -L https://aka.ms/moby-engine-armhf-latest -o moby_engine.deb && sudo dpkg -i ./moby_engine.deb

### Download and install the moby-cli
curl -L https://aka.ms/moby-cli-armhf-latest -o moby_cli.deb && sudo dpkg -i ./moby_cli.deb

### Run apt-get fix
sudo apt-get install -f



### Download and install the standard libiothsm implementation
curl -L https://aka.ms/libiothsm-std-linux-armhf-latest -o libiothsm-std.deb && sudo dpkg -i ./libiothsm-std.deb

### Download and install the IoT Edge Security Daemon
curl -L https://aka.ms/iotedged-linux-armhf-latest -o iotedge.deb && sudo dpkg -i ./iotedge.deb

### Run apt-get fix
sudo apt-get install -f

##Set up autoprovisioning

https://docs.microsoft.com/en-us/azure/iot-dps/quick-setup-auto-provision

##configuring node
sudo vi /etc/iotedge/config.yaml

## DPS symmetric key provisioning configuration provisioning
   source: "dps"
   global_endpoint: "https://global.azure-devices-provisioning.net"
   scope_id: "0ne000615EB"
   attestation:
     method: "symmetric_key"
     registration_id: "aaas-dev-id"
     symmetric_key: "<your obtained key>"

##Module/Container configuration
Customized
###Postgres

"postgres": {
            "version": "1.0",
            "type": "docker",
            "status": "running",
            "restartPolicy": "always",
            "settings": {
              "image": "postgres:9.6",
              "createOptions": {
                "Env": [
                  "POSTGRES_PASSWORD=docker",
                  "POSTGRES_DB=aaas_db"
                ],
                "ExposedPorts": {
                  "5432/tcp": {}
                },
                "HostConfig": {
                  "Privileged": true,
                  "PortBindings": {
                    "5432/tcp": [
                      {
                        "HostPort": "5432"
                      }
                    ]
                  },
                  "Binds": [
                    "/Users/ramon/master/tfm/data:/var/lib/postgresql/data"
                  ]
                }
              }
            }
          }

###Node-RED module
The Node-RED docker-file can be found in:
https://github.com/rlopezv/aaas-edge-nodered-module

"nodered": {
            "version": "1.0",
            "type": "docker",
            "status": "running",
            "restartPolicy": "always",
            "settings": {
              "image": "rlopezviana/aaas-edge-nodered:0.1.0-amd64",
              "createOptions": {
                "HostConfig": {
                  "Privileged": true,
                  "PortBindings": {
                    "1880/tcp": [
                      {
                        "HostPort": "1880"
                      }
                    ]
                  }
                }
              }
            }
          }
###Help
  https://github.com/Azure/iotedgedev/wiki/edge-device-setup

  https://docs.microsoft.com/en-us/azure/iot-edge/troubleshoot

  https://aka.ms/iotedge-prod-checklist-logs

#Routes definitions
          "noderedToMessageDispatcherModule": "FROM /messages/modules/nodered/outputs/* INTO BrokeredEndpoint(\"/modules/messagedispatchermodule/inputs/message\")",
          "weathermoduleToIoTHub": "FROM /messages/modules/weathermodule/outputs/* INTO $upstream",
          "plantmoduleToIoTHub": "FROM /messages/modules/plantmodule/outputs/* INTO $upstream",
          "mesageDispatcherModuleToPremiumPlantModule": "FROM /messages/modules/messagedispatchermodule/outputs/plant INTO BrokeredEndpoint(\"/modules/premiumplantmodule/inputs/data\")",
          "premiumPlantModuleToIoTHub": "FROM /messages/modules/plantpremiummodule/outputs/* INTO $upstream",
          "pgToIoTHub": "FROM /messages/modules/pg/outputs/* INTO $upstream",
          "premiumweathermoduleToIoTHub": "FROM /messages/modules/premiumweathermodule/outputs/* INTO $upstream",
          "meesageDispatcherModuleToStatusModule": "FROM /messages/modules/messagedispatchermodule/outputs/status INTO BrokeredEndpoint(\"/modules/statusmodule/inputs/data\")",
          "statusmoduleToIoTHub": "FROM /messages/modules/statusmodule/outputs/* INTO $upstream",
          "mesageDispatcherModuleToPremiumWeatherModule": "FROM /messages/modules/messagedispatchermodule/outputs/weather INTO BrokeredEndpoint(\"/modules/premiumweathermodule/inputs/data\")",
          "mesageDispatcherModuleTonoderedModule": "FROM /messages/modules/messagedispatchermodule/outputs/command INTO BrokeredEndpoint(\"/modules/nodered/inputs/command\")"


[{"id":"8e0d6b50.40ca08","type":"tab","label":"Dasboard","disabled":false,"info":""},{"id":"6d70de93.3af7d","type":"ui_text","z":"8e0d6b50.40ca08","group":"f936d824.261558","order":0,"width":"24","height":"1","name":"","label":"","format":"{{msg.payload}}","layout":"col-center","x":330,"y":60,"wires":[]},{"id":"fa371340.847b5","type":"ui_text","z":"8e0d6b50.40ca08","group":"4923a584.f7c9ac","order":1,"width":"4","height":"2","name":"","label":"Plant Status","format":"<font color={{msg.color}} ><i class=\"fa fa-circle\" style=\"font-size:24px;\"></i></font>","layout":"col-center","x":190,"y":60,"wires":[]},{"id":"ae3af877.cf5a78","type":"ui_text","z":"8e0d6b50.40ca08","group":"4923a584.f7c9ac","order":3,"width":"4","height":"2","name":"","label":"Weather Status","format":"<font color={{msg.color}} ><i class=\"fa fa-circle\" style=\"font-size:24px;\"></i></font>","layout":"col-center","x":200,"y":100,"wires":[]},{"id":"d8f3e7af.a10b58","type":"ui_chart","z":"8e0d6b50.40ca08","name":"PlantRealTime","group":"3bd6f275.6046fe","order":0,"width":"24","height":"4","label":"Plant","chartType":"line","legend":"true","xformat":"dd HH:mm","interpolate":"linear","nodata":"","dot":false,"ymin":"","ymax":"","removeOlder":1,"removeOlderPoints":"","removeOlderUnit":"3600","cutout":0,"useOneColor":false,"colors":["#1f77b4","#aec7e8","#ff7f0e","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5"],"useOldStyle":false,"outputs":1,"x":480,"y":200,"wires":[["11c9049.4210bfb"]]},{"id":"ce900f21.1c1ef","type":"inject","z":"8e0d6b50.40ca08","name":"","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":100,"y":420,"wires":[["b1ae95e5.a3e988","bb7f1d2d.54a85","15f947e4.68c5c8","b67a0b4c.a9e528"]]},{"id":"b1ae95e5.a3e988","type":"function","z":"8e0d6b50.40ca08","name":"","func":"msg.payload = \n[{\n\"series\": [\"A\", \"B\", \"C\"],\n\"topic\": [\"TA\", \"TB\", \"TC\"],\n\"data\": [\n    [{ \"x\": 1504029632890, \"y\": 5 },\n     { \"x\": 1504029636001, \"y\": 4 },\n     { \"x\": 1504029638656, \"y\": 2 }\n    ],\n    [{ \"x\": 1504029633514, \"y\": 6 },\n     { \"x\": 1504029636622, \"y\": 7 },\n     { \"x\": 1504029639539, \"y\": 6 }\n    ],\n    [{ \"x\": 1504029634400, \"y\": 7 },\n     { \"x\": 1504029637959, \"y\": 7 },\n     { \"x\": 1504029640317, \"y\": 7 }\n    ]\n],\n\"labels\": [\"A\",\"B\",\"C\"]\n}];\nreturn msg;","outputs":1,"noerr":0,"x":110,"y":320,"wires":[[]]},{"id":"e1b5050f.bfc2e8","type":"inject","z":"8e0d6b50.40ca08","name":"","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":600,"y":300,"wires":[["9188b3e9.403fb"]]},{"id":"9188b3e9.403fb","type":"function","z":"8e0d6b50.40ca08","name":"","func":"msg.payload = [];\nreturn msg;","outputs":1,"noerr":0,"x":90,"y":160,"wires":[["d8f3e7af.a10b58","1b703038.51e58"]]},{"id":"11c9049.4210bfb","type":"debug","z":"8e0d6b50.40ca08","name":"","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"false","x":470,"y":40,"wires":[]},{"id":"1b703038.51e58","type":"ui_chart","z":"8e0d6b50.40ca08","name":"PlantSummary","group":"b2394d2e.1c543","order":0,"width":"24","height":"4","label":"Summary","chartType":"bar","legend":"true","xformat":"HH:mm:ss","interpolate":"linear","nodata":"","dot":false,"ymin":"","ymax":"","removeOlder":1,"removeOlderPoints":"","removeOlderUnit":"3600","cutout":0,"useOneColor":false,"colors":["#1f77b4","#aec7e8","#ff7f0e","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5"],"useOldStyle":false,"outputs":1,"x":480,"y":100,"wires":[[]]},{"id":"bb7f1d2d.54a85","type":"function","z":"8e0d6b50.40ca08","name":"","func":"msg.payload = [{\n    \"series\": [\"X\", \"Y\", \"Z\" ],\n    \"data\": [ [5,6,9], [3,8,5], [6,7,2] ],\n    \"labels\": [ \"Jan\", \"Feb\", \"Mar\" ]\n}];\nreturn msg;","outputs":1,"noerr":0,"x":210,"y":360,"wires":[[]]},{"id":"7e600944.49c648","type":"ui_chart","z":"8e0d6b50.40ca08","name":"WeatherSummary","group":"b9ea5d63.40d66","order":0,"width":"24","height":"4","label":"Summary","chartType":"bar","legend":"true","xformat":"HH:mm:ss","interpolate":"linear","nodata":"","dot":false,"ymin":"","ymax":"","removeOlder":1,"removeOlderPoints":"","removeOlderUnit":"3600","cutout":0,"useOneColor":false,"colors":["#1f77b4","#aec7e8","#ff7f0e","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5"],"useOldStyle":false,"outputs":1,"x":670,"y":60,"wires":[[]]},{"id":"5a2bf600.be00d8","type":"ui_chart","z":"8e0d6b50.40ca08","name":"WeatherRealTime","group":"24556abf.bea436","order":0,"width":"24","height":"4","label":"Plant","chartType":"line","legend":"true","xformat":"dd HH:mm","interpolate":"linear","nodata":"","dot":false,"ymin":"","ymax":"","removeOlder":1,"removeOlderPoints":"","removeOlderUnit":"3600","cutout":0,"useOneColor":false,"colors":["#1f77b4","#aec7e8","#ff7f0e","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5"],"useOldStyle":false,"outputs":1,"x":410,"y":300,"wires":[[]]},{"id":"172f130c.3793ed","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"WeatherTemperature","group":"c7b25467.d3ce58","order":1,"width":"3","height":"2","gtype":"gage","title":"Temperature","label":"ºC","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":660,"y":380,"wires":[]},{"id":"15f947e4.68c5c8","type":"function","z":"8e0d6b50.40ca08","name":"","func":"msg.payload = 10;\nmsg.timestamp = new Date();\nreturn msg;","outputs":1,"noerr":0,"x":350,"y":420,"wires":[["172f130c.3793ed","143ee6fb.d3ed09","a4c6d317.f1b93","87f5f977.bd6848","5bb2960c.26db68","41997290.444c0c","aa1a0f96.52202","f677f6f6.6b02e8","24355542.40c4fa","a3de391c.0e1b98","4aef81c6.b9e7e","6c588b53.245554"]]},{"id":"143ee6fb.d3ed09","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"WeatherHumidity","group":"c7b25467.d3ce58","order":2,"width":"3","height":"2","gtype":"gage","title":"Humidity","label":"%","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":650,"y":420,"wires":[]},{"id":"a4c6d317.f1b93","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"WeatherPressure","group":"c7b25467.d3ce58","order":3,"width":"3","height":"2","gtype":"gage","title":"Pressure","label":"hPa","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":650,"y":460,"wires":[]},{"id":"87f5f977.bd6848","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"WeatherRain","group":"c7b25467.d3ce58","order":4,"width":"3","height":"2","gtype":"gage","title":"Rain","label":"Intensity","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":630,"y":500,"wires":[]},{"id":"5bb2960c.26db68","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"WeatherLight","group":"c7b25467.d3ce58","order":5,"width":"3","height":"2","gtype":"gage","title":"Light","label":"Intensity","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":630,"y":540,"wires":[]},{"id":"41997290.444c0c","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"WeatherUV","group":"c7b25467.d3ce58","order":6,"width":"3","height":"2","gtype":"gage","title":"UV","label":"UV","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":630,"y":580,"wires":[]},{"id":"aa1a0f96.52202","type":"ui_text","z":"8e0d6b50.40ca08","group":"c7b25467.d3ce58","order":7,"width":"3","height":"2","name":"WeatherLastUpdated","label":"Last Updated","format":"{{msg.timestamp}}","layout":"col-center","x":660,"y":620,"wires":[]},{"id":"2fc156c6.4e0d8a","type":"ui_toast","z":"8e0d6b50.40ca08","position":"top right","displayTime":"3","highlight":"yellow","outputs":0,"ok":"OK","cancel":"","topic":"","name":"Alert","x":350,"y":500,"wires":[]},{"id":"b67a0b4c.a9e528","type":"function","z":"8e0d6b50.40ca08","name":"","func":"msg.payload = 'message';\nreturn msg;","outputs":1,"noerr":0,"x":190,"y":540,"wires":[["2fc156c6.4e0d8a","116e71af.43783e"]]},{"id":"f677f6f6.6b02e8","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"PlantTemperature","group":"5af08869.5aada8","order":1,"width":"3","height":"2","gtype":"gage","title":"Temperature","label":"ºC","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":650,"y":720,"wires":[]},{"id":"24355542.40c4fa","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"PlantHumidity","group":"5af08869.5aada8","order":2,"width":"3","height":"2","gtype":"gage","title":"Humidity","label":"%","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":640,"y":760,"wires":[]},{"id":"a3de391c.0e1b98","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"PlantSoilMoisture","group":"5af08869.5aada8","order":3,"width":"3","height":"2","gtype":"gage","title":"Soil Moisture","label":"%","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":650,"y":800,"wires":[]},{"id":"4aef81c6.b9e7e","type":"ui_gauge","z":"8e0d6b50.40ca08","name":"PlantLight","group":"5af08869.5aada8","order":4,"width":"3","height":"2","gtype":"gage","title":"Light","label":"Intensity","format":"{{value}}","min":"-10","max":"50","colors":["#00b500","#e6e600","#ca3838"],"seg1":"","seg2":"","x":620,"y":840,"wires":[]},{"id":"6c588b53.245554","type":"ui_text","z":"8e0d6b50.40ca08","group":"5af08869.5aada8","order":5,"width":"9","height":"1","name":"PlantLastUpdated","label":"Last Updated","format":"{{msg.timestamp}}","layout":"col-center","x":650,"y":880,"wires":[]},{"id":"803027bd.606758","type":"template","z":"8e0d6b50.40ca08","name":"css","field":"style","fieldType":"msg","format":"html","syntax":"mustache","template":"table {\n    color: #333;\n    font-family: Helvetica, Arial, sans-serif;\n    width: 100%;\n    border-collapse: collapse;\n    border-spacing: 0;\n}\ntd, th {\n    border: 1px solid transparent;\n    /* No more visible border */\n    height: 30px;\n    transition: all 0.3s;\n    /* Simple transition for hover effect */\n}\nth {\n    background: #DFDFDF;\n    /* Darken header a bit */\n    font-weight: bold;\n}\ntd {\n    background: #FAFAFA;\n    text-align: center;\n}\n\n/* Cells in even rows (2,4,6...) are one color */\n\ntr:nth-child(even) td {\n    background: #F1F1F1;\n}\n\n/* Cells in odd rows (1,3,5...) are another (excludes header cells)  */\n\ntr:nth-child(odd) td {\n    background: #FEFEFE;\n}\ntr td:hover {\n    background: #666;\n    color: #FFF;\n}\n\n/* Hover cell effect! */","x":470,"y":960,"wires":[["27c1ad64.9b51e2","116221bc.1b308e","c0b52583.dd8f18"]]},{"id":"27c1ad64.9b51e2","type":"ui_template","z":"8e0d6b50.40ca08","group":"94e80235.637d1","name":"Plant Alerts","order":0,"width":"24","height":"6","format":"<style>\n    {{msg.style}}\n</style>\n\n<table>\n  <tr ng-repeat=\"obj in msg.payload\">\n    <td>{{ obj.device }}</td>\n    <td>{{ obj.message }}</td>\n  </tr>\n</table>","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":630,"y":960,"wires":[[]]},{"id":"116e71af.43783e","type":"function","z":"8e0d6b50.40ca08","name":"","func":"const MAX_ALERTS = 5;\nvar messageData = flow.get(\"alertMessagesArray\")||[];\n\nif (messageData.length>=MAX_ALERTS) {\n  messageData.pop();  \n}\nvar message = {};\nmessage.device = messageData.length;\nmessage.message = new Date().toISOString();\nnode.warn(\"Added message\");\nmessageData.unshift(message);\n\nflow.set(\"alertMessagesArray\",messageData);\nmsg.payload = messageData;\nreturn msg;","outputs":1,"noerr":0,"x":330,"y":880,"wires":[["803027bd.606758"]]},{"id":"116221bc.1b308e","type":"ui_template","z":"8e0d6b50.40ca08","group":"93ee4c0.96c50b8","name":"WeatherAlerts","order":0,"width":"24","height":"6","format":"<style>\n    {{msg.style}}\n</style>\n\n<table>\n  <tr ng-repeat=\"obj in msg.payload\">\n    <td>{{ obj.device }}</td>\n    <td>{{ obj.message }}</td>\n  </tr>\n</table>","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":640,"y":1020,"wires":[[]]},{"id":"c0b52583.dd8f18","type":"ui_template","z":"8e0d6b50.40ca08","group":"e05b669b.eb93e8","name":"Alerts","order":0,"width":"24","height":"6","format":"<style>\n    {{msg.style}}\n</style>\n\n<table>\n  <tr ng-repeat=\"obj in msg.payload\">\n    <td>{{ obj.device }}</td>\n    <td>{{ obj.message }}</td>\n  </tr>\n</table>","storeOutMessages":true,"fwdInMessages":true,"templateScope":"local","x":610,"y":1100,"wires":[[]]},{"id":"741a04ad.428e2c","type":"ui_text","z":"8e0d6b50.40ca08","group":"8581afbf.aa29a","order":0,"width":"4","height":"2","name":"","label":"Temperature","format":"{{msg.payload}}","layout":"col-center","x":370,"y":1020,"wires":[]},{"id":"82aea71b.bc1678","type":"ui_text","z":"8e0d6b50.40ca08","group":"8581afbf.aa29a","order":0,"width":"4","height":"2","name":"","label":"Humidity","format":"{{msg.payload}}","layout":"col-center","x":360,"y":1060,"wires":[]},{"id":"6c427133.0bec7","type":"ui_text","z":"8e0d6b50.40ca08","group":"8581afbf.aa29a","order":0,"width":"4","height":"2","name":"","label":"Soil Moisture","format":"{{msg.payload}}","layout":"col-center","x":370,"y":1100,"wires":[]},{"id":"1f229407.f2572c","type":"ui_text","z":"8e0d6b50.40ca08","group":"8581afbf.aa29a","order":0,"width":"4","height":"2","name":"","label":"Light","format":"{{msg.payload}}","layout":"col-center","x":350,"y":1140,"wires":[]},{"id":"8eb5fd94.30b94","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"Temperature","format":"{{msg.payload}}","layout":"col-center","x":370,"y":1220,"wires":[]},{"id":"2bd775f7.73c57a","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"Humidity","format":"{{msg.payload}}","layout":"col-center","x":360,"y":1260,"wires":[]},{"id":"38dee804.7a35e8","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"Pressure","format":"{{msg.payload}}","layout":"col-center","x":360,"y":1300,"wires":[]},{"id":"2a2546b.1c3a6ba","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"Rain","format":"{{msg.payload}}","layout":"col-center","x":350,"y":1340,"wires":[]},{"id":"212dfb42.619a64","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"Light","format":"{{msg.payload}}","layout":"col-center","x":350,"y":1380,"wires":[]},{"id":"5d589f6e.b6524","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"UV","format":"{{msg.payload}}","layout":"col-center","x":350,"y":1420,"wires":[]},{"id":"569474ba.b2e5cc","type":"ui_text","z":"8e0d6b50.40ca08","group":"ac0138d0.74d198","order":0,"width":"3","height":"2","name":"","label":"Last Value","format":"{{msg.payload}}","layout":"col-center","x":370,"y":1460,"wires":[]},{"id":"53963c67.f7f1c4","type":"ui_text","z":"8e0d6b50.40ca08","group":"8581afbf.aa29a","order":0,"width":"4","height":"2","name":"","label":"Last Value","format":"{{msg.payload}}","layout":"col-center","x":370,"y":1180,"wires":[]},{"id":"8f26279d.859c48","type":"ui_text","z":"8e0d6b50.40ca08","group":"4923a584.f7c9ac","order":4,"width":"4","height":"2","name":"WeatherStatusLastUpdated","label":"Last Updated","format":"{{msg.timestamp}}","layout":"col-center","x":280,"y":140,"wires":[]},{"id":"b9924ff6.35517","type":"ui_text","z":"8e0d6b50.40ca08","group":"4923a584.f7c9ac","order":2,"width":"4","height":"2","name":"PlantStatusLastUpdated","label":"Last Updated","format":"{{msg.timestamp}}","layout":"col-center","x":270,"y":200,"wires":[]},{"id":"f936d824.261558","type":"ui_group","z":"","name":"dasboard_common","tab":"62720bf2.e48104","disp":false,"width":"24","collapse":false},{"id":"4923a584.f7c9ac","type":"ui_group","z":"","name":"Status","tab":"62720bf2.e48104","order":2,"disp":true,"width":"24","collapse":false},{"id":"3bd6f275.6046fe","type":"ui_group","z":"","name":"TimeSerie","tab":"a708e985.1eee58","order":2,"disp":false,"width":"24","collapse":false},{"id":"b2394d2e.1c543","type":"ui_group","z":"","name":"Summary","tab":"a708e985.1eee58","order":1,"disp":true,"width":"24","collapse":false},{"id":"b9ea5d63.40d66","type":"ui_group","z":"","name":"Summary","tab":"4e207db3.358f54","order":1,"disp":true,"width":"24","collapse":false},{"id":"24556abf.bea436","type":"ui_group","z":"","name":"TimeSerie","tab":"4e207db3.358f54","order":2,"disp":true,"width":"24","collapse":false},{"id":"c7b25467.d3ce58","type":"ui_group","z":"","name":"Weather","tab":"62720bf2.e48104","order":4,"disp":true,"width":"24","collapse":false},{"id":"5af08869.5aada8","type":"ui_group","z":"","name":"Plant","tab":"62720bf2.e48104","order":3,"disp":true,"width":"24","collapse":false},{"id":"94e80235.637d1","type":"ui_group","z":"","name":"Alerts","tab":"a708e985.1eee58","order":4,"disp":true,"width":"24","collapse":false},{"id":"93ee4c0.96c50b8","type":"ui_group","z":"","name":"Alerts","tab":"4e207db3.358f54","order":4,"disp":true,"width":"24","collapse":false},{"id":"e05b669b.eb93e8","type":"ui_group","z":"","name":"Alerts","tab":"62720bf2.e48104","order":5,"disp":true,"width":"24","collapse":false},{"id":"8581afbf.aa29a","type":"ui_group","z":"","name":"Current","tab":"a708e985.1eee58","order":3,"disp":true,"width":"24","collapse":false},{"id":"ac0138d0.74d198","type":"ui_group","z":"","name":"Current","tab":"4e207db3.358f54","order":3,"disp":true,"width":"24","collapse":false},{"id":"62720bf2.e48104","type":"ui_tab","z":"","name":"Dashboard","icon":"dashboard","order":1,"disabled":false,"hidden":false},{"id":"a708e985.1eee58","type":"ui_tab","z":"","name":"Plant","icon":"dashboard","order":2,"disabled":false,"hidden":false},{"id":"4e207db3.358f54","type":"ui_tab","z":"","name":"Weather","icon":"dashboard","order":3,"disabled":false,"hidden":false}]

kkkk