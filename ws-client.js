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

const keyAlias = [
    {
        key: 'A',
        val: 'Ask'
    },
    {
        key: 'a',
        val: 'Available'
    },
    {
        key: 'B',
        val: 'Bid'
    },
    {
        key: 'b',
        val: 'Balance'
    },
    {
        key: 'C',
        val: 'Closed'
    },
    {
        key: 'c',
        val: 'Currency'
    },
    {
        key: 'D',
        val: 'Deltas'
    },
    {
        key: 'd',
        val: 'Delta'
    },
    {
        key: 'E',
        val: 'Exchange'
    },
    {
        key: 'e',
        val: 'ExchangeDeltaType'
    },
    {
        key: 'F',
        val: 'FillType'
    },
    {
        key: 'f',
        val: 'Fills'
    },
    {
        key: 'G',
        val: 'OpenBuyOrders'
    },
    {
        key: 'g',
        val: 'OpenSellOrders'
    },
    {
        key: 'H',
        val: 'High'
    },
    {
        key: 'h',
        val: 'AutoSell'
    },
    {
        key: 'I',
        val: 'Id'
    },
    {
        key: 'i',
        val: 'IsOpen'
    },
    {
        key: 'J',
        val: 'Condition'
    },
    {
        key: 'j',
        val: 'ConditionTarget'
    },
    {
        key: 'K',
        val: 'ImmediateOrCancel'
    },
    {
        key: 'k',
        val: 'IsConditional'
    },
    {
        key: 'L',
        val: 'Low'
    },
    {
        key: 'l',
        val: 'Last'
    },
    {
        key: 'M',
        val: 'MarketName'
    },
    {
        key: 'm',
        val: 'BaseVolume'
    },
    {
        key: 'N',
        val: 'Nonce'
    },
    {
        key: 'n',
        val: 'CommissionPaid'
    },
    {
        key: 'O',
        val: 'Orders'
    },
    {
        key: 'o',
        val: 'Order'
    },
    {
        key: 'P',
        val: 'Price'
    },
    {
        key: 'p',
        val: 'CryptoAddress'
    },
    {
        key: 'Q',
        val: 'Quantity'
    },
    {
        key: 'q',
        val: 'QuantityRemaining'
    },
    {
        key: 'R',
        val: 'Rate'
    },
    {
        key: 'r',
        val: 'Requested'
    },
    {
        key: 'S',
        val: 'Sells'
    },
    {
        key: 's',
        val: 'Summaries'
    },
    {
        key: 'T',
        val: 'TimeStamp'
    },
    {
        key: 't',
        val: 'Total'
    },
    {
        key: 'U',
        val: 'Uuid'
    },
    {
        key: 'u',
        val: 'Updated'
    },
    {
        key: 'V',
        val: 'Volume'
    },
    {
        key: 'W',
        val: 'AccountId'
    },
    {
        key: 'w',
        val: 'AccountUuid'
    },
    {
        key: 'X',
        val: 'Limit'
    },
    {
        key: 'x',
        val: 'Created'
    },
    {
        key: 'Y',
        val: 'Opened'
    },
    {
        key: 'y',
        val: 'State'
    },
    {
        key: 'Z',
        val: 'Buys'
    },
    {
        key: 'z',
        val: 'Pending'
    },
    {
        key: 'CI',
        val: 'CancelInitiated'
    },
    {
        key: 'FI',
        val: 'FillId'
    },
    {
        key: 'DT',
        val: 'OrderDeltaType'
    },
    {
        key: 'OT',
        val: 'OrderType'
    },
    {
        key: 'OU',
        val: 'OrderUuid'
    },
    {
        key: 'PD',
        val: 'PrevDay'
    },
    {
        key: 'TY',
        val: 'Type'
    },
    {
        key: 'PU',
        val: 'PricePerUnit'
    }
];

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
            pairs:{},
            summary:false
        }
    };

    this._connectionOptions = {};
    if (undefined !== options)
    {
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
        subscribe:[],
        query:{}
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
    connection.on('connectionError', function(err){
        self.emit('connectionError', {step:err.step,attempts:err.attempts,error:err.error});
        return;
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

    if (this._subscriptions.query.pairs != null && this._subscriptions.query.summary === false){
        changes.subscribe.push({entity:'queryExchange',pair:this._subscriptions.query.pairs})
    }
    if (this._subscriptions.query.pairs != null && this._subscriptions.query.summary === true){
        changes.subscribe.push({entity:'querySummary',pair:this._subscriptions.query.pairs})
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

        this.emit('orderDelta', this._reformatKeys(data));
    });
}

_processBalanceDelta(d)
{
    this._decodeData(d, function(data){
        this.emit('balanceDelta', this._reformatKeys(data));
    });
}


_processUpdateExchangeSummaryDeltas(d)
{   
    this._decodeData(d, function(data){
        this.emit('summaryDelta', this._reformatKeys(data));
        if (undefined === data)
        {
            return;
        }
    });
}

_getAlias(key)
{
    let response = null;

    keyAlias.forEach(function(element) {
        if(key === element.key) {
            response = element.val;
        }
    });

    if(response !== null) {
        return response;
    } else {
        console.log('failed to match alias', key);
    }
}

_reformatKeys(data){
    let self = this;
    if (Array.isArray(data)) {

        data.forEach(function(value, key) {
            data[key] = self._reformatKeys(value);
        });
    
    } else if(typeof data === 'object') {
        Object.keys(data).forEach(function(key) {
            let newKey = self._getAlias(key);
            let value = data[key];

            data[newKey] = value;
            delete data[key];

            if(value instanceof Array) {
                data[newKey] = self._reformatKeys(value);

            } else if(typeof data === 'object') {
                data[newKey] = self._reformatKeys(value);
            }
        });
    }
    return data;
}


_processUpdateExchangeMarketDeltas(d)
{   
    this._decodeData(d, function(data){
        this.emit('orderBookUpdate', this._reformatKeys(data));
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
        this.emit('orderBookUpdateLite', this._reformatKeys(data));
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
                self.emit('orderBook',this._reformatKeys(data));
            });
        }

    });

}

_querySummaryState(pair)
{

    let self = this;
    this._connection.callMethod('QuerySummaryState',function(d,err){
        if (err){
            console.log("An error occoured ",err);
        }
        else{
            self._decodeData.call(self, d, function(data){
                self.emit('orderBookSummary',this._reformatKeys(data));
            });
        }

    });

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
