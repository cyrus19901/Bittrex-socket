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

// how long should we wait before trying to reconnect upon disconnection
// const RETRY_DELAY = 10 * 1000;

class SignalRClient extends EventEmitter
{

constructor(options)
{
    // console.log(options)
    super();

    this._markNewOrderBookEntriesAsUpdates = true;

    this._auth = {
        key:null,
        secret:null
    }
    // subscriptions
    this._subscriptions = {
        tickers:{
            // wether or not we subscribed to tickers globally
            global:false,
            timestamp:null,
            pairs:{}
        },
        markets:{
            timestamp:null,
            pairs:{}
        },
        orders:{
            timestamp:null,
            subscribed:false
        }
    };

    // use to keep track of last trades id
    this._connectionOptions = {};
    if (undefined !== options)
    {
        // auth
        if (undefined !== options.auth)
        {
            if (undefined !== options.auth.key && '' != options.auth.key &&
                undefined !== options.auth.secret && '' !== options.auth.secret)
            {
                this._auth.key = options.auth.key;
                this._auth.secret = options.auth.secret;
            }
        }
        if (undefined != options.userAgent && '' != options.userAgent)
        {
            this._connectionOptions.userAgent = options.userAgent;
        }

        if (false === options.markNewOrderBookEntriesAsUpdates)
        {
            this._markNewOrderBookEntriesAsUpdates = false;
        }
    }

    // keep track of how many connections we started
    this._connectionCounter = 0;
    this._connection = null;
    // SignalR connection id
    this._connectionId = null;
}

/**
 * Initialize markets subscriptions for a given pair
 *
 * @param {float} timestamp timestamp of the first subscription
 */
_initializeMarketsPair(timestamp)
{
    let obj = {
        // last time subscription for current pair has changed
        timestamp:timestamp,
        lastCseq:0,
        lastUpdateCseq:0
    }
    return obj;
}

/**
 * Subscribe to order books & trades for a list of pairs
 *
 * @param {array} pairs array of pairs
 * @param {boolean} reset if true, previous subscriptions will be ignored (default = false)
 * @param {boolean} connect whether or not connection with exchange should be established if necessary (optional, default = true)
 */
subscribeToMarkets(pairs, connect)
{
    if (undefined === connect)
    {
        connect = true;
    }
    let timestamp = Date.now() / 1000.0;
    let changes = {
        subscribe:[],
        resync:[]
    };
    let newPairs = {};
    // check new subscriptions
    // _.forEach(pairs, (p) => {
    //     if (undefined !== newPairs[p])
    //     {
    //         return;
    //     }

    //     // pair has been added
    //     if (undefined === this._subscriptions.markets.pairs[p])
    //     {
    //         newPairs[p] = this._initializeMarketsPair(timestamp);
    //         // changes.subscribe.push({entity:'orderBook',pair:p});
    //     }
    //     else
    //     {
    //         newPairs[p] = this._subscriptions.markets.pairs[p];
    //     }
    // });
    newPairs[pairs] = this._subscriptions.markets.pairs[pairs];
    this._subscriptions.markets.pairs = newPairs;

    this._subscriptions.markets.timestamp = timestamp;
    this._processChanges(changes, connect);
    
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
    if (undefined !== changes.subscribe)
    {   
        _.forEach(changes.subscribe, (entry) => {
            console.log(entry.entity)
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
                // case 'orders':
                //     this._subscribeToOrders();
                //     break;
            }
        });
    }
}


/**
 * Creates a new connection
 *
 * @param {integer} delay delay in ms before connecting (optional, default = no delay)
 */
_createConnection(delay)
{
    this._connectionCounter += 1;
    this._connectionId = null;
    let connection = new SignalRConnection(this._connectionOptions);

    // recompute utc offset on each reconnect
    // this._computeUtcOffset();

    let self = this;

    connection.on('connected', function(data){
        // clear timers for data timeout
        self._connectionId = data.connectionId;
        self._processSubscriptions();
    });

    connection.on('data', function(data){
        self._processData.call(self, data);
    });

    this._connection = connection;

    try
    {
        // connect immediately
        if (undefined === delay)
        {
            connection.connect();
        }
        else
        {
            setTimeout(function(){
                // disconnection probably requested by client
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

/**
 * This method will be called upon reconnection and will call _processChanges
 */
_processSubscriptions()
{
    let changes = {
        subscribe:[],
        resync:[]
    };
    console.log(this._subscriptions.markets.pairs)
    _.forEach(Object.keys(this._subscriptions.markets.pairs), (p) => {
        changes.subscribe.push({entity:'market',pair:p});
    });
    _.forEach(Object.keys(this._subscriptions.markets.pairs), (p) => {
        changes.subscribe.push({entity:'summary'});
    });
    _.forEach(Object.keys(this._subscriptions.markets.pairs), (p) => {
        changes.subscribe.push({entity:'summarylite'});
    });
    // if (this._subscriptions.orders.subscribed)
    // {
    //     changes.subscribe.push({entity:'orders'});
    // }
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
        };
    }
    catch (e)
    {
        console.log(e);
    }
}

_processUpdateExchangeSummaryDeltas(d)
{   
    this._decodeData(d, function(data){
        this.emit('summaryDelta', data);
        // an error occurred
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
    // we need to use inflateRaw to avoid zlib error 'incorrect header check' (Z_DATA_ERROR)
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

/*
 * Connect SignalR connection
 *
 * Should not be necessary since connection will happen automatically
 */
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
