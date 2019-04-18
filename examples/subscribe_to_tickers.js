"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');
let client = new SignalRClient({
    // websocket will be automatically reconnected if server does not respond to ping after 10s
    pingTimeout:10000,
    // use cloud scraper to bypass Cloud Fare (default)
    useCloudScraper:true
});

//-- event handlers
client.on('ticker', function(data){
    console.log(util.format("Got ticker update for pair '%s'", data.pair));
});

//-- start subscription
console.log("=== Subscribing to 'USDT-BTC' pair");
client.subscribeToTickers(['ETH-BTC']);
