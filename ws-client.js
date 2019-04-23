"use strict";
const WebSocket = require('ws');
const _ = require('lodash');
const util = require('util');
const debug = require('debug')
const Big = require('big.js');
const EventEmitter = require('events');
const zlib = require('zlib');
const crypto = require('crypto');
const SignalRConnection = require('./ws');


class SignalRClient extends EventEmitter
{

constructor(options)
{
    super();
    this._auth = {
        key:null,
        secret:null
    }
    // subscriptions
    this._subscriptions = {

        markets:{
            pairs:{}
        },
        orders:{
            subscribed:false
        },
        query:{
            pairs:null,
            summary:false
        }
    };

    this._connectionOptions = {};
    if (undefined !== options)
    {
        // auth
        if ( options.auth !== undefined)
        {
            if (options.auth.key != undefined  && options.auth.key != '' &&
            options.auth.secret !== undefined && options.auth.secret !== '' )
            {
                this._auth.key = options.auth.key;
                this._auth.secret = options.auth.secret;
            }
        }
    }

    this._connection = null;
    this._connectionId = null;
}


subscribeToMarkets(pairs, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = Date.now() / 1000.0;
    let changes = {
        subscribe:[]
    };

    let newPairs = {};
    newPairs[pairs] = this._subscriptions.markets.pairs[pairs];
    this._subscriptions.markets.pairs = newPairs;
    this._subscriptions.markets.timestamp = timestamp;
    this._processChanges(changes, connect);

}

QueryExchangeDeltas(pairs, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    let changes = {
        query:null
    };
    this._subscriptions.query.pairs = pairs;
    this._processChanges(changes,connect);
    
}

QuerySummaryStateDeltas(pairs, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    let changes = {
        query:null
    };
    this._subscriptions.query.pairs = pairs;
    this._subscriptions.query.summary = true;
    this._processChanges(changes,connect);
    
}

_processChanges(changes, connect)
{  
    if (null === this._connection)
    {
        if (connect)
        {   
            this._createConnection();
        }
        return;
    }
    if (!this._connection.isConnected())
    {
        return;
    }
    if (this._subscriptions.query.pairs != null){
        this._queryExchangeState(this._subscriptions.query.pairs[0]);
    }
    if (this._subscriptions.query.pairs != null && this._subscriptions.query.summary === true){
        this._querySummaryState(this._subscriptions.query.pairs[0]);
    }

    if (undefined !== changes.subscribe)
    {   
        _.forEach(changes.subscribe, (entry) => {
            switch (entry.entity)
            {
                case 'market':
                    this._connection.callMethod('SubscribeToExchangeDeltas', [entry.pair]);
                    break;
                case 'summary':
                    this._connection.callMethod('SubscribeToSummaryDeltas');
                    break;
                case 'summarylite':
                    this._connection.callMethod('SubscribeToSummaryLiteDeltas');
                    break;
                case 'orders':
                    this._subscribeToOrders();
                    break;
            }
        });
    }
}

_createConnection(delay)
{  
    this._connectionId = null;
    let connection = new SignalRConnection(this._connectionOptions);
    let self = this;

    connection.on('connected', function(data){
        self.emit('connected', {connectionId:data.connectionId});
        self._connectionId = data.connectionId;
        self._processSubscriptions.call(self);
    });

    connection.on('data', function(data){
        self._processData.call(self, data);
    });

    this._connection = connection;

    try
    {
        if (undefined === delay)
        {
            connection.connect();
        }
        else
        {
            setTimeout(function(){
                if (null === self._connection)
                {
                    return;
                }
                connection.connect();
            }, delay);
        }
    }
    catch (e)
    {
        throw e;
    }
}


_subscribeToOrders(cb)
{   
    let self = this;
    this._connection.callMethod('GetAuthContext', [this._auth.key], function(challenge, err){
        // we got an error
        if (null !== err)
        {
            console.log("Error ecountered")
            return;
        }
        if (null === self._connection || !self._connection.isConnected())
        {
            if (undefined !== cb)
            {
                try
                {
                    cb(false);
                }
                catch (e)
                {
                    console.log("the error thrown is :",e)
                }
            }
            return;
        }
        // create response
        const hmac = crypto.createHmac('sha512', self._auth.secret);
        hmac.update(challenge);
        const response = hmac.digest('hex');

        // call Authenticate
        self._connection.callMethod('Authenticate', [self._auth.key, response], function(success, err){
            // we got an error
            if (null !== err)
            {
                console.log("Error was encounterd while authentication")
            }
            if (undefined !== cb)
            {
                try
                {
                    cb(true);
                }
                catch (e)
                {
                    console.log("the error thrown is :",e)
                }
            }
        });
    });
}

_processSubscriptions()
{   
    let changes = {
        subscribe:[]
    };

    if (this._subscriptions.query.pairs != null){
        changes.subscribe.push({entity:'queryExchange'})
    }
    if (this._subscriptions.query.pairs !=null && this._subscriptions.query.summary === true){
        changes.subscribe.push({entity:'querySummary'})
    }
    _.forEach(Object.keys(this._subscriptions.markets.pairs), (p) => {
        changes.subscribe.push({entity:'market',pair:p});
    });
    _.forEach(Object.keys(this._subscriptions.markets.pairs), (p) => {
        changes.subscribe.push({entity:'summary'});
    });
    _.forEach(Object.keys(this._subscriptions.markets.pairs), (p) => {
        changes.subscribe.push({entity:'summarylite'});
    });
    if (this._subscriptions.orders.subscribed)
    {
        changes.subscribe.push({entity:'orders'});
    }
    this._processChanges(changes);
}

_processData(data)
{   
    try
    {
        let methodName = data.M.toLowerCase();
        console.log(methodName)
        switch (methodName)
        {
            case 'ue':
            _.forEach(data.A, (entry) => {
                this._processUpdateExchangeMarketDeltas(entry);
            })
            break;
            case 'ul':
            _.forEach(data.A, (entry) => {
                this._processUpdateExchangeLiteDeltas(entry);
            })
            break;
            case 'us':
            _.forEach(data.A, (entry) => {
                this._processUpdateExchangeSummaryDeltas(entry);
            })
            break;
            case 'ub':
            _.forEach(data.A, (entry) => {
                this._processBalanceDelta(entry);
            })
            break;
            case 'uo':
            _.forEach(data.A, (entry) => {
                this._processOrdersDelta(entry);
            })
            break;
        };
    }
    catch (e)
    {
        console.log(e);
    }
}


_processOrdersDelta(d)
{
    this._decodeData(d, function(data){

        if (undefined === data)
        {
            return;
        }
        if (undefined === data.o)
        {
            return;
        }

        this.emit('orderDelta', data);
    });
}

_processBalanceDelta(d)
{
    this._decodeData(d, function(data){
        this.emit('balanceDelta', data);
    });
}


_processUpdateExchangeSummaryDeltas(d)
{   
    this._decodeData(d, function(data){
        this.emit('summaryDelta', data);
        if (undefined === data)
        {
            return;
        }
    });
}


_processUpdateExchangeMarketDeltas(d)
{   
    this._decodeData(d, function(data){
        this.emit('orderBookUpdate', data);
        // an error occurred
        if (undefined === data)
        {
            return;
        }
    });
}


_processUpdateExchangeLiteDeltas(d)
{   
    this._decodeData(d, function(data){
        this.emit('orderBookUpdateLite', data);
        // an error occurred
        if (undefined === data)
        {
            return;
        }
    });
}


_decodeData(d, cb)
{
    let self = this;
    let gzipData = Buffer.from(d, 'base64');
    zlib.inflateRaw(gzipData, function(err, str){
        if (null !== err)
        {
            cb.call(self, undefined);
            return;
        }
        let data;
        try
        {
            data = JSON.parse(str);
        }
        catch (e)
        {
            cb.call(self, undefined);
            return;
        }
        cb.call(self, data);
    });
}


_queryExchangeState(pair)
{
    
    let self = this;
    this._connection.callMethod('QueryExchangeState', [pair], function(d, err){
        if (err){
            console.log("An error occoured ",err);
        }
        else{
            self._decodeData.call(self, d, function(data){
                self.emit('orderBook',data);
            });
        }

    });

}

_querySummaryState(pair)
{
    
    let self = this;
    // this._connection.callMethod('QuerySummaryState');
    let val = this._connection.callMethod('QuerySummaryState', function(d,err){
    });
    console.log(JSON.stringify(val.data))
    //     if (err){
    //         console.log("An error occoured ",err);
    //     }
    //     else{
    //     //     self._decodeData.call(self, d, function(data){
    //     //         console.log(data)
    //     //         self.emit('orderBookSummary',data);
    //     //     });
    //         console.log("fuck")
    //     }

    // });

}

subscribeToOrders(connect)
{
    if (null === this._auth.key)
    {
        return false;
    }
    if (undefined === connect)
    {
        connect = true;
    }
    let changes = {
        subscribe:[{entity:'orders'}]
    };
    this._subscriptions.orders.subscribed = true;
    this._processChanges(changes, connect);
}


connect()
{
    // create if needed
    if (null !== this._connection)
    {
        return;
    }
    this._createConnection();
}


isConnected()
{
    if (null === this._connection)
    {
        return false;
    }
    return this._connection.isConnected()
}

}
module.exports = SignalRClient;
