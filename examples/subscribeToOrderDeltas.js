"use strict";
const SignalRClient = require('../ws-client.js');

let client = new SignalRClient({
    auth:{
        key:"*****************************",
        secret: "*****************************"
    }
});
client.on('orderDelta', function(data){
    console.log(data)
});

//-- start subscription
console.log("=== Subscribing to orders");
client.subscribeToOrders();

