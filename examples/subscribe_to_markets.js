"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');
let client = new SignalRClient({
    // websocket will be automatically reconnected if server does not respond to ping after 10s
    pingTimeout:10000
});

client.on('orderBookUpdate', function(data){
    console.log(JSON.stringify(data))
    console.log(util.format("Got order book update for pair '%s' : cseq = %d", data.pair, data.cseq));
});

//-- start subscription
console.log("=== Subscribing to 'USDT-BTC' pair");
client.subscribeToMarkets(['BTC-ETH']);

