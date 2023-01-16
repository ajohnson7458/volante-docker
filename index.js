const querystring = require('querystring');
let os = require('os');
let axios = require('axios');



//
// Class serves as a proxy to docker.sock for the Docker HTTP API
//
module.exports = {
  name: 'VolanteDocker',
  init() {
  },
  events: {
    'VolanteDocker.command'(cmd) {
      this.handleMessage(cmd);
    },
  },
  props: {
    apiVersion: null,
    logging: false,
    sock: os.platform() === 'win32' ? 'http://localhost:2375' : '/var/run/docker.sock'
  },
  methods: {
    
    //
    // the initial connect populates the local api version
    //
    connect() {
      this.httpRequest('GET', '/version', null, null, (body) => {
        if (body && body.data) {
          if (this.apiVersion === null){ this.apiVersion = body.data.ApiVersion }
          if (body.data && (body.data.MinAPIVersion || body.MinAPIVersion)){
            minAPIVersion = body.data.MinAPIVersion !== undefined ? body.data.MinAPIVersion : body.MinAPIVersion
            if (this.apiVersion < parseFloat(minAPIVersion)){
              console.warn(`VolanteDocker: Docker Minimum API version not met`)
            }
          }
          console.log(`VolanteDocker: Docker Socket on ${this.sock}`)
          console.log(`VolanteDocker: Docker Version is ${body.data.Version}`)
          console.log(`VolanteDocker: Docker API version is ${body.data.ApiVersion}`)
        } else {
          this.$debug('failed to get /version info')
          this.$debug(body)
        }
      });
    },

    getContainerNameFromURL(urlstring) {

      let urlobj = null;
      if (os.platform() === "win32") {
        // e.g. "http://localhost:2375/v1.29/containers/create?name=hypnos-channel-1624910049598"
        urlobj = new URL(urlstring)
      }
      else {
        // without this base, the URL will throw an error
        urlobj = new URL(urlstring, "file://");
      }
    
      let name = urlobj.searchParams.get('name');
    
      if (name == null) {
        // check the case "http://localhost:2375/v1.29/containers/json?all=true"
        let value = urlobj.searchParams.get('all');
        if (value) { name = "all"; }
      }
    
      if (name == null) {
        name = "";
        // extract from  e.g., /v1.29/containers/<containername>/start
        // in the case of container removal, the name will be the Docker container ID and not the container name
        // "http://localhost:2375/v1.29/containers/cdbd4ded1e7c3ac9c2cd7978884fa35b5b5237f5a0cf7f750e60ff68a9dd0655?force=true"
        let pathparts = urlobj.pathname.split("/");
        if (pathparts.length >= 4 && pathparts[2] === "containers") {
        // container name or contianer id if removal is occuring
        name = pathparts[3];
        }
      }
    
      return name;
    },
    //
    // Make the request, note that this function will prefix the path with
    // the current API version, so it should not be included.
    //
    httpRequest(method, path, query, body, callback) {
      var apiPath = ""
      if (this.apiVersion){
        apiPath += `/v${this.apiVersion}${path}`;
        if (query) {
          apiPath += `?${querystring.stringify(query)}`;
        }
      } else {
        apiPath += path;
      }
      combineurl = os.platform() === "win32" ? this.sock + apiPath : apiPath
      var bodyBuf = null;
      sockpath = os.platform() === 'win32' ? null : '/var/run/docker.sock'
      if (body) {
        bodyBuf = new Buffer.from(JSON.stringify(body));
        contentLength = Buffer.byteLength(bodyBuf)
      } else {
        contentLength = 0
      }
        request = {
            method: method,
            url: combineurl,
            responseType: 'json',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': contentLength
            },
            data: bodyBuf,
            socketPath: sockpath
        }
      /*} else {
        request = {
          method: method,
          url: combineurl,
          responseType: 'json',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': 0
          },
          socketPath: sockpath
        } 
      }*/

      axios(request)
      .then((response) => {
        // for debugging, uncomment. If left uncommented will cause dashboard
      // to spew container information every so often
        //console.log(response)
        let cname = this.getContainerNameFromURL(response.config.url);
        let retobject = {
          "status" : response.status,
          "message" : response.statusText,
          "data" : response.data,
          "name" : cname // used to associate request with container
         }

         //if (callback) { return callback(retobject); }
         return retobject;

      })
      .catch((error) => {
        let retobject = null;
        if(error.code == 'ECONNREFUSED' || error.code == 'EACCES') {
          // ECONNREFUSED if docker isn't running
          // EACCESS if /var/run/docker.sock is being accessed without sudo or not being in docker group
          console.log(`Unable to connect or access Docker Engine: ${error.message}`);
          // if docker Engine isn't running at all this is what you get
          retobject = {
            "status" : 503,
            "message" : error.message,
            "data" : null,
            "name" : ""
          }
        }
        else
        {
         //console.log(error.response.data.message);
         if (error.response){
          let cname = this.getContainerNameFromURL(error.response.config.url);
          retobject = {
            "status" : error.response.status,
            "message" : error.response.data.message || error.response.statusText,
            "data" : error.response.data || null,
            "name" : cname
           }
         } else if (error.message){
          retobject = {
            "status" : 404,
            "message" : error.message,
            "data" : null,
            "name" : ""
           }
         } else {
          retobject = {
            "status" : 404,
            "message" : "unknown server error",
            "data" : null,
            "name" : ""
           }
         }
        }

        //if (callback) { return callback(retobject); }
        return retobject;
      });
    },
    //
    // Build and parse the response body
    //
    handleHTTPResponse(res, callback) {
      var body = [];
      res.on('data', (d) => {
        try {
          var p = JSON.parse(d);
        } catch(error) {
          return this.error("error parsing Docker response");
        }
        body.push(p);
      });
      res.on('end', () => {
        if (body.length > 0) {
          callback && callback(body);
        } else {
          callback && callback(res.statusCode);
        }
      });
    },
    //
    // Handle an incoming Volante message. This message should have the following structure:
    // {
    //   eventName: <optional> used to emit reply event (no reply if missing)
    //   method: <required>
    //   path: <required>
    //   parameters: <optional>
    //   body: <optional>
    // }
    //
    //
    handleMessage(msg) {
      //this.debug(`received command: ${JSON.stringify(msg,null,2)}`);

      if (this.apiVersion === null) {
        this.connect();
      }

      // check required fields
      if (msg && msg.method && msg.path) {
        return this.httpRequest(msg.method, msg.path, msg.parameters, msg.body, (body) => {
          // emit response if an eventName was provided
          if (msg.eventName) {
            return this.$hub.emit(msg.eventName, body);
          }
        });
      }
    },
  }
}

//
// exports
//
//module.exports = VolanteDocker;
