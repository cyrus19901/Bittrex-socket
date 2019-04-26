"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');
let client = new SignalRClient({
    // websocket will be automatically reconnected if server does not respond to ping after 10s
    pingTimeout:10000
});

client.on('orderBookUpdate', function(data){
    console.log(data);
    return;
});

console.log("=== Subscribing to 'ETH-BTC' pair");
client.subscribeToMarkets(['BTC-ETH']);

