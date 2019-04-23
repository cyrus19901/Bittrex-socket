"use strict";
const SignalRClient = require('../ws-client.js');

let client = new SignalRClient({
    auth:{
        key:"775eda54503e4f62a1726a098df9b1b2",
        secret: "c1dd7adc282245a9a767f987a2ca0450"
    }
});
client.on('balanceDelta', function(data){
    console.log(data)
});

//-- start subscription
console.log("=== Subscribing to orders");
client.subscribeToOrders();

