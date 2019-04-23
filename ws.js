"use strict";
const WebSocket = require('ws');
const request = require('request');
const util = require('util');
const retry = require('retry');
const querystring = require('querystring');
const _ = require('lodash');
const EventEmitter = require('events');

//-- Bittrex endpoints
// base url
const BASE_PATH = 'bittrex.com/signalr';

// connection configuration
const DEFAULT_SOCKETTIMEOUT = 60 * 1000;


// SignalR connection states
const STATE_NEW = 0;
const STATE_CONNECTING = 1;
const STATE_CONNECTED = 2;
// const STATE_DISCONNECTING = 3;
// const STATE_DISCONNECTED = 4;

// whether or not we want to perform 'start' step (does not seem to be mandatory with Bittrex)
// const IGNORE_START_STEP = false;

const HUB = 'c2';
const CLIENT_PROTOCOL_VERSION = '1.5';


const DEFAULT_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1';

class SignalRConnection extends EventEmitter
{

constructor(options)
{
    super();
    // how long should we wait for a ping response ? (set to 0 to disable)
    this._pingTimeout = 30000;
    this._userAgent = DEFAULT_USER_AGENT;
    if (undefined !== options)
    {
        if (undefined != options.userAgent && '' != options.userAgent)
        {
            this._userAgent = options.userAgent;
        }
        if (undefined !== options.pingTimeout)
        {
            this._pingTimeout = options.pingTimeout;
        }
    }

    this._timestamps = {
        negotiate:null,
        connect:null,
        start:null
    }
    this._ignoreCloseEvent = true;
    this._connectionState = STATE_NEW;
    this._connection = null,
    this._ws = null;
    this._lastMessageId = 1;
    this._callbacks = {};

}


/**
 * Indicates whether or not we're ready to process messages from server
 */
isConnected()
{
    return STATE_CONNECTED == this._connectionState;
}

/**
 * Indicates whether or not we're waiting for connection to be established
 */
isConnecting()
{
    return STATE_CONNECTING == this._connectionState;
}

/**
 * Returns an https url
 *
 * @param {path} url path
 * @return {string}
 */
_getHttpsUrl(path)
{
    return `https://${BASE_PATH}/${path}`;
}

/**
 * Returns a wss url
 *
 * @param {path} url path
 * @return {string}
 */
_getWssUrl(path)
{
    return `wss://${BASE_PATH}/${path}`;
}

/**
 * Returns SignalR hubs
 *
 * @return {array}
 */
_getHubs()
{
    return [{name:HUB}];
}

/**
 * Return hub name
 *
 * @return {string}
 */
_getHubName()
{
    return HUB;
}


_negotiate()
{
    try
    {
         let operation = retry.operation();
         let headers = {
             'User-Agent': this._userAgent
         }
         let requestOptions = {
             timeout:DEFAULT_SOCKETTIMEOUT,
             method:'GET',
             headers: headers,
             json:true,
             url:this._getHttpsUrl('negotiate'),
             qs:{
                 clientProtocol:CLIENT_PROTOCOL_VERSION,
                 transport:'serverSentEvents',
                 connectionData:JSON.stringify(this._getHubs())
             }
         }
         let self = this;
         return new Promise((resolve, reject) => {
             operation.attempt(function(){
                 if (STATE_CONNECTING != self._connectionState)
                 {
                     resolve({ignore:true});
                     return;
                 }
                 request(requestOptions, function(error, response, body){
                     if (STATE_CONNECTING != self._connectionState)
                     {
                         resolve({ignore:true});
                         return;
                     }
                     let err = null;
                     if (null !== error)
                     {
                         err = {origin:'client', error:error.message};
                     }
                     else if (200 != response.statusCode)
                     {
                         err = {origin:'remote', error:{code:response.statusCode,message:response.statusMessage}}
                     }
                     if (null !== err)
                     {
                         reject({error:err});
                         return;
                     }
                     self._connection = body;
                     self._timestamps.negotiate = new Date().getTime();
                     resolve({connectionId:body.ConnectionId});
                 });
             });
        });
    }
    catch (e)
    {
        return new Promise((resolve, reject) => {
            let err = {origin:'client', error:e.message, stack:e.stack};
            reject({error:err});
        });
    }
}

_getConnectQueryString(connection)
{
    let qs = {
        clientProtocol: connection.ProtocolVersion,
        transport: "webSockets",
        connectionToken: connection.ConnectionToken,
        connectionData: JSON.stringify(this._getHubs()),
        tid: parseInt(new Date().getTime())
    };
    return `${this._getWssUrl('connect')}?${querystring.stringify(qs)}`;
}


_connect(connection)
{
    try
    {
        let self = this;
         let headers = {
             'User-Agent': this._userAgent
         }
         let wsOptions = {
             perMessageDeflate: false,
             handshakeTimeout:connection.TransportConnectTimeout * 2000,
             headers: headers
         }
        let operation = retry.operation();
         let queryString = this._getConnectQueryString(connection);
         return new Promise((resolve, reject) => {
             operation.attempt(function(){
                 if (STATE_CONNECTING != self._connectionState)
                 {
                     resolve({ignore:true});
                     return;
                 }
                 let ws = new WebSocket(queryString, wsOptions);
                 let ignoreErrorEvent = false;
                 let skipCloseEvent = false;
                 ws.on('open', function open() {
                     // connection has already been disconnected
                     if (STATE_CONNECTING != self._connectionState)
                     {
                         resolve({ignore:true});
                         return;
                     }
                     self._timestamps.connect = new Date().getTime();
                    //  self._ignoreCloseEvent = false;
                    //  skipCloseEvent = false;
                     self._ws = this;

                     resolve();
                 });
                 ws.on('message', function (message) {
                    if (STATE_CONNECTED != self._connectionState)
                    {
                        return;
                    }
                    if ('{}' === message)
                    {
                        return;
                    }
                    let data;
                    try
                    {
                        data = JSON.parse(message);
                    }
                    catch (e)
                    {
                        return;
                    }
                    
                    // process responses
                    if (undefined !== data.I)
                    {
                        let messageId = parseInt(data.I);
                        // ignore progress
                        if (undefined !== data.D)
                        {
                            return;
                        }
                        // process result
                        if (undefined !== data.R)
                        {   
                            // do we have a callback for this messageId
                            if (undefined !== self._callbacks[messageId])
                            {   
                                self._callbacks[messageId](data.R, null);
                                delete self._callbacks[messageId];
                            }
                        }
                        return;
                    }
                    if (undefined !== data.M)
                    {      
                         _.forEach(data.M, (entry) => {
                             self.emit('data', entry);
                         });
                     }
                 });
                 ws.on('error', function(e) {
                     if (ignoreErrorEvent)
                     {
                         return;
                     }
                     // connection has already been disconnected
                     if (STATE_CONNECTING != self._connectionState)
                     {
                         resolve({ignore:true});
                         return;
                     }
                     let err = {origin:'client', error:{code:e.code,message:e.message}}
                     skipCloseEvent = true;
                     self._ws = null;
                     this.terminate();
                     // ws is not open yet, likely to be a connection error
                     if (null === self._timestamps.connect)
                     {
                         if (operation.retry(err))
                         {
                             self.emit('connectionError', {step:'connect',error:err});
                             return;
                         }
                     }
                     reject({error:err});
                 });
                 ws.on('ping', function(data){
                     this.pong('', true, true);
                 });
                 ws.on('pong', function(data){
                     this.isAlive = true;
                 });
            });
        });
    }
    catch (e)
    {
        return new Promise((resolve, reject) => {
            let err = {origin:'client', error:e.message, stack:e.stack};
            reject({error:err});
        });
    }
}

_start(connection)
{
    try
    {
        // connection has already been disconnected
        if (STATE_CONNECTING != this._connectionState)
        {
            return new Promise((resolve, reject) => {
                resolve({ignore:true});
            });
        }
        // don't perform start step

         let operation = retry.operation();
         let headers = {
             'User-Agent': this._userAgent
         }
         let requestOptions = {
             timeout:DEFAULT_SOCKETTIMEOUT,
             method:'GET',
             headers: headers,
             json:true,
             url:this._getHttpsUrl('start'),
             qs:{
                 clientProtocol:CLIENT_PROTOCOL_VERSION,
                 transport:'webSockets',
                 connectionToken:connection.ConnectionToken,
                 connectionData:JSON.stringify(this._getHubs())
             }
        }
        let self = this;
        return new Promise((resolve, reject) => {
            operation.attempt(function(){
                // connection has already been disconnected
                if (STATE_CONNECTING != self._connectionState)
                {
                    resolve({ignore:true});
                    return;
                }
                request(requestOptions, function(error, response, body){
                    // connection has already been disconnected
                    if (STATE_CONNECTING != self._connectionState)
                    {
                        resolve({ignore:true});
                        return;
                    }
                    let err = null;
                    if (null !== error)
                    {
                        err = {origin:'client', error:error.message};
                    }
                    else if (200 != response.statusCode)
                    {
                        err = {origin:'remote', error:{code:response.statusCode,message:response.statusMessage}}
                    }
                    if (null !== err)
                    {
                        if (operation.retry(err))
                        {
                            self.emit('connectionError', {step:'start',error:err});
                            return;
                        }
                        reject({error:err});
                        return;
                    }
                    self._timestamps.start = new Date().getTime();
                    resolve();
                });
            });
        });
    }
    catch (e)
    {
        return new Promise((resolve, reject) => {
            let err = {origin:'client', error:e.message, stack:e.stack};
            reject({error:err});
        });
    }
 }

callMethod(method, args, cb)
{
    if (STATE_CONNECTED != this._connectionState || WebSocket.OPEN != this._ws.readyState)
    {
        return false;
    }
    if (undefined !== cb)
    {
        this._callbacks[this._lastMessageId] = cb;
    }
    try
    {
        let methodName = method.toLowerCase();
        let data = {
            H:this._getHubName(),
            M:methodName,
            A:undefined === args ? [] : args,
            I:this._lastMessageId++
        }
        let payload = JSON.stringify(data);
        this._ws.send(payload);
    }
    catch (e)
    {
        return false;
    }
    return true;
}

connect()
{   
    if (STATE_NEW != this._connectionState)
    {
        return false;
    }
    this._connectionState = STATE_CONNECTING;
    let self = this;
    // 'negotiate' step
    self._negotiate().then((result) => {
        // 'connect' step
        self._connect(self._connection).then((result) => {

            self._start(self._connection).then((result) => {
                self._connectionState = STATE_CONNECTED;
                self.emit('connected', {connectionId:self._connection.ConnectionId});
                
            }).catch ((e) => {
                self.emit('connectionError', {step:'start',error:e.error});
            });
        }).catch ((e) => {
            self.emit('connectionError', {step:'connect',error:e.error});
        });
    }).catch ((e) => {
        self.emit('connectionError', {step:'negotiate',error:e.error});
    });
    return true;
}
}

module.exports = SignalRConnection;
