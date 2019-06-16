{
  "Mounts": [ {
  "Type": "bind",
  "Source": "/home/pi/folderwhereikeepmythings",
  "Destination": "/test",
  "Mode": "",
  "RW": true,
  "Propagation": "rprivate"
  }
  ],
  "NetworkingConfig": {
  "EndpointsConfig": {
  "host": {}
  }
  },
  "HostConfig": {
  "Privileged": true,
  "NetworkMode": "host",
  "Binds": [
  "/Users/ramon/master/tfm/data:/aaas/data"]
  }
  }

  "createOptions": "{\"HostConfig\":{\"Binds\":[\"/Users/ramon/master/tfm/data:/aaas/data\"]}}"

sudo apt-get update

sudo apt-get dist-upgrade

  https://github.com/Azure/iotedgedev/wiki/edge-device-setup

  https://docs.microsoft.com/en-us/azure/iot-edge/troubleshoot

  https://aka.ms/iotedge-prod-checklist-logs

# You can copy the entire text from this code block and 
# paste in terminal. The comment lines will be ignored.

# Download and install the moby-engine
curl -L https://aka.ms/moby-engine-armhf-latest -o moby_engine.deb && sudo dpkg -i ./moby_engine.deb

# Download and install the moby-cli
curl -L https://aka.ms/moby-cli-armhf-latest -o moby_cli.deb && sudo dpkg -i ./moby_cli.deb

# Run apt-get fix
sudo apt-get install -f


# You can copy the entire text from this code block and 
# paste in terminal. The comment lines will be ignored.

# Download and install the standard libiothsm implementation
curl -L https://aka.ms/libiothsm-std-linux-armhf-latest -o libiothsm-std.deb && sudo dpkg -i ./libiothsm-std.deb

# Download and install the IoT Edge Security Daemon
curl -L https://aka.ms/iotedged-linux-armhf-latest -o iotedge.deb && sudo dpkg -i ./iotedge.deb

# Run apt-get fix
sudo apt-get install -f

#configuring node
sudo vi /etc/iotedge/config.yaml

# DPS symmetric key provisioning configuration
# provisioning:
   source: "dps"
   global_endpoint: "https://global.azure-devices-provisioning.net"
   scope_id: "0ne000615EB"
   attestation:
     method: "symmetric_key"
     registration_id: "aaas-dev-id"
     symmetric_key: "CbxzmPWfzs5hkMal4pOdrNK1zFFROIfF2rh/FagvZ+tc1rpglbd18lm8QWkYB9uSomEf0Do0Sc9wgGcRaWNYtA=="

#Installing agent
https://github.com/Azure/iotedgedev/issues/375

https://github.com/Azure/iotedgedev/wiki/manual-dev-machine-setup (1,2,6,8,10)
Is necesry to execute:
sudo pip install --upgrade setuptools pip
before:
sudo apt-get install python2.7-dev libffi-dev libssl-dev -y

https://devblogs.microsoft.com/iotdev/setup-azure-iot-edge-ci-cd-pipeline-with-arm-agent/