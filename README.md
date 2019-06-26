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
