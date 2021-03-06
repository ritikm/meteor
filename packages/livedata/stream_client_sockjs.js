// @param url {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
Meteor._DdpClientStream = function (url) {
  var self = this;
  self._initCommon();

  //// Constants


  // how long between hearing heartbeat from the server until we declare
  // the connection dead. heartbeats come every 25s (stream_server.js)
  //
  // NOTE: this is a workaround until sockjs detects heartbeats on the
  // client automatically.
  // https://github.com/sockjs/sockjs-client/issues/67
  // https://github.com/sockjs/sockjs-node/issues/68
  self.HEARTBEAT_TIMEOUT = 60000;

  self.rawUrl = url;
  self.socket = null;

  self.sent_update_available = false;

  self.heartbeatTimer = null;

  // Listen to global 'online' event if we are running in a browser.
  // (IE8 does not support addEventListener)
  if (typeof window !== 'undefined' && window.addEventListener)
    window.addEventListener("online", _.bind(self._online, self),
                            false /* useCapture. make FF3.6 happy. */);

  //// Kickoff!
  self._launchConnection();
};

_.extend(Meteor._DdpClientStream.prototype, {

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send: function (data) {
    var self = this;
    if (self.currentStatus.connected) {
      self.socket.send(data);
    }
  },

  // Changes where this connection points
  _changeUrl: function (url) {
    var self = this;
    self.rawUrl = url;
  },

  _connected: function (welcome_message) {
    var self = this;

    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }

    if (self.currentStatus.connected) {
      // already connected. do nothing. this probably shouldn't happen.
      return;
    }

    // inspect the welcome data and decide if we have to reload
    try {
      var welcome_data = JSON.parse(welcome_message);
    } catch (err) {
      Meteor._debug("DEBUG: malformed welcome packet", welcome_message);
    }

    if (welcome_data && welcome_data.server_id) {
      if (__meteor_runtime_config__.serverId &&
          __meteor_runtime_config__.serverId !== welcome_data.server_id &&
          !self.sent_update_available) {
        self.sent_update_available = true;
        _.each(self.eventCallbacks.update_available,
               function (callback) { callback(); });
      }
    } else
      Meteor._debug("DEBUG: invalid welcome packet", welcome_data);

    // update status
    self.currentStatus.status = "connected";
    self.currentStatus.connected = true;
    self.currentStatus.retryCount = 0;
    self.statusChanged();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    _.each(self.eventCallbacks.reset, function (callback) { callback(); });

  },

  _cleanup: function () {
    var self = this;

    self._clearConnectionAndHeartbeatTimers();
    if (self.socket) {
      self.socket.onmessage = self.socket.onclose
        = self.socket.onerror = function () {};
      self.socket.close();
      self.socket = null;
    }
  },

  _clearConnectionAndHeartbeatTimers: function () {
    var self = this;
    if (self.connectionTimer) {
      clearTimeout(self.connectionTimer);
      self.connectionTimer = null;
    }
    if (self.heartbeatTimer) {
      clearTimeout(self.heartbeatTimer);
      self.heartbeatTimer = null;
    }
  },

  _heartbeat_timeout: function () {
    var self = this;
    Meteor._debug("Connection timeout. No heartbeat received.");
    self._lostConnection();
  },

  _heartbeat_received: function () {
    var self = this;
    // If we've already permanently shut down this stream, the timeout is
    // already cleared, and we don't need to set it again.
    if (self._forcedToDisconnect)
      return;
    if (self.heartbeatTimer)
      clearTimeout(self.heartbeatTimer);
    self.heartbeatTimer = setTimeout(
      _.bind(self._heartbeat_timeout, self),
      self.HEARTBEAT_TIMEOUT);
  },

  _sockjsProtocolsWhitelist: function () {
    // only allow polling protocols. no streaming.  streaming
    // makes safari spin.
    var protocolsWhitelist = [
      'xdr-polling', 'xhr-polling', 'iframe-xhr-polling', 'jsonp-polling'];

    // iOS 4 and 5 and below crash when using websockets over certain
    // proxies. this seems to be resolved with iOS 6. eg
    // https://github.com/LearnBoost/socket.io/issues/193#issuecomment-7308865.
    //
    // iOS <4 doesn't support websockets at all so sockjs will just
    // immediately fall back to http
    var noWebsockets = navigator &&
          /iPhone|iPad|iPod/.test(navigator.userAgent) &&
          /OS 4_|OS 5_/.test(navigator.userAgent);

    if (!noWebsockets)
      protocolsWhitelist = ['websocket'].concat(protocolsWhitelist);

    return protocolsWhitelist;
  },

  _launchConnection: function () {
    var self = this;
    self._cleanup(); // cleanup the old socket, if there was one.

    // Convert raw URL to SockJS URL each time we open a connection, so that we
    // can connect to random hostnames and get around browser per-host
    // connection limits.
    self.socket = new SockJS(
      Meteor._DdpClientStream._toSockjsUrl(self.rawUrl),
      undefined, {
        debug: false, protocols_whitelist: self._sockjsProtocolsWhitelist()
      });
    self.socket.onmessage = function (data) {
      self._heartbeat_received();

      // first message we get when we're connecting goes to _connected,
      // which connects us. All subsequent messages (while connected) go to
      // the callback.
      if (self.currentStatus.status === "connecting")
        self._connected(data.data);
      else if (self.currentStatus.connected)
        _.each(self.eventCallbacks.message, function (callback) {
          callback(data.data);
        });
    };
    self.socket.onclose = function () {
      // Meteor._debug("stream disconnect", _.toArray(arguments), (new Date()).toDateString());
      self._lostConnection();
    };
    self.socket.onerror = function () {
      // XXX is this ever called?
      Meteor._debug("stream error", _.toArray(arguments), (new Date()).toDateString());
    };

    self.socket.onheartbeat =  function () {
      self._heartbeat_received();
    };

    if (self.connectionTimer)
      clearTimeout(self.connectionTimer);
    self.connectionTimer = setTimeout(
      _.bind(self._lostConnection, self),
      self.CONNECT_TIMEOUT);
  }
});
