"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');
let client = new SignalRClient({
    pingTimeout:10000
});

//-- event handlers
client.on('orderBook', function(data){
    console.log(util.format(data));
    process.exit();
});

//-- start subscription
console.log("=== Subscribing to 'ETH-BTC' pair");
client.QueryExchangeDeltas(['BTC-ETH']);
