# Volante Docker Spoke

Volante Spoke module which uses docker.sock to expose the [Docker Engine HTTP API](https://docs.docker.com/engine/api/latest) to other Volante Spokes.


## Usage

```bash
npm install volante-docker
```

Volante modules are automatically loaded and instanced if they are installed locally and `hub.attachAll()` is called.


## Options

Options may be changed using the `volante-docker.options` event with an options object (shown with defaults):

```js
hub.emit('volante-docker.options', {
  sock: '/var/run/docker.sock' // default
});
```

## Example

```js

hub.on('any.reply.event.name', (d) => console.log(d));

hub.emit('volante-docker.command', {
  eventName: 'any.reply.event.name',
  method: 'GET',
  path: '/containers/json'
});
```

volante-docker attempts to automatically fill in the API version number for the Docker Engine at /var/docker.sock, so this would be sent as `/v1.31/containers/json` to a Docker Engine implementing the v1.31 API.

## Events

### Handled

- `volante-docker.options`
  ```js
  {
    sock: String
  }
  ```
- `volante-docker.command`
  ```js
  {
    eventName: String, // optional
    method: String,
    path: String,
    parameters: Object, // optional
    body: Object // optional
  }
  ```

### Emitted

In addition to native Volante log events, this modules also emits the response to a Docker Engine HTTP API request using the `eventName` given in the `volante-docker.command`. If no `eventName` was provided, the response will not be emitted.

## License

ISC