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