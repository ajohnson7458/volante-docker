const http = require('http');
const querystring = require('querystring');

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
    sock: '/var/run/docker.sock',
    apiVersion: null,
  },
	methods: {
	  //
	  // the initial connect populates the local api version
	  //
	  connect() {
	    this.httpRequest('GET', '/version', null, null, (body) => {
	      if (body.length == 1) {
	        this.apiVersion = body[0].ApiVersion;
	        this.log(`Docker socket on ${this.sock}`);
	        this.log(`Docker version is ${body[0].Version}`);
	        this.log(`Docker API version is ${body[0].ApiVersion}`);
	      } else {
	        this.warn('failed to get /version info');
	      }
	    });
	  },
	  //
	  // Make the request, note that this function will prefix the path with
	  // the current API version, so it should not be included.
	  //
	  httpRequest(method, path, query, body, callback) {
	    let apiPath = "";
	    if (this.apiVersion) {
	      apiPath += `/v${this.apiVersion}${path}`;
	      if (query) {
	        apiPath += `?${querystring.stringify(query)}`;
	      }
	    } else {
	      apiPath += path;
	    }

	    var bodyBuf = null;
	    if (body) {
	      bodyBuf = new Buffer(JSON.stringify(body));
	    } else {
	      bodyBuf = new Buffer("");
	    }

	    var req = http.request({
	      method: method,
	      socketPath: this.sock,
	      path: apiPath,
	      headers: {
	        'Content-Type': 'application/json',
	        'Content-Length': Buffer.byteLength(bodyBuf)
	      }
	    }, (res) => {
	      this.handleHTTPResponse(res, (body) => {
	        callback && callback(body);
	      });
	    });

	    if (body) {
	      req.write(bodyBuf);
	    }
	    req.end();
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
	    this.debug(`received command: ${JSON.stringify(msg,null,2)}`);

	    if (this.apiVersion === null) {
	      this.connect();
	    }

	    // check required fields
	    if (msg.method && msg.path) {
	      this.httpRequest(msg.method, msg.path, msg.parameters, msg.body, (body) => {
	        // emit response if an eventName was provided
	        if (msg.eventName) {
	          this.hub.emit(msg.eventName, body);
	        }
	      });
	    }
	  },
	}
}

//
// exports
//
module.exports = VolanteDocker;
