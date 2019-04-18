"use strict";
const util = require('util');
const SignalRClient = require('../ws-client.js');

let client = new SignalRClient({
    // websocket will be automatically reconnected if server does not respond to ping after 10s
    pingTimeout:10000,
    // NB: you need to provide correct API key & secret above to be able to subscribe to orders
    auth:{
        key:"775eda54503e4f62a1726a098df9b1b2",
        secret: "c1dd7adc282245a9a767f987a2ca0450"
    },
    watchdog:{
        // automatically re-subscribe for orders every 30min (this is enabled by default)
        orders:{
            enabled:true,
            period:1800
        }
    },
    // use cloud scraper to bypass Cloud Fare (default)
    useCloudScraper:true
});

//-- event handlers
client.on('order', function(data){
    console.log(data)
    console.log(util.format("Got 'order' event for order '%s' (%s)", data.orderNumber, data.pair));
    console.log(JSON.stringify(data));
});

//-- start subscription
console.log("=== Subscribing to orders");
client.subscribeToOrders();

// disconnect client after 10min
setTimeout(function(){
    console.log('=== Disconnecting...');
    client.disconnect();
    process.exit(0);
}, 600000);
