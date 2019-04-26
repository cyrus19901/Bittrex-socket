"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');
let client = new SignalRClient({
    pingTimeout:10000
});

client.on('summaryDelta', function(data){
    console.log(data);
    return;
});

console.log("=== Subscribing to 'ETH-BTC' pair");
client.subscribeToMarkets(['BTC-ETH']);

