"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');
let client = new SignalRClient({
    // websocket will be automatically reconnected if server does not respond to ping after 10s
    pingTimeout:10000
});

//-- event handlers
client.on('orderBookSummary', function(data){
    console.log(JSON.stringify(data));
    process.exit();
});

//-- start subscription
console.log("=== Subscribing to 'ETH-BTC' pair");
client.QuerySummaryStateDeltas(['BTC-ETH']);
