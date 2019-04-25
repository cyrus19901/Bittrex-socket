"use strict";
var fs = require('fs');
const util = require('util');
const SignalRClient = require('../ws-client.js');
var stream_log = fs.createWriteStream('Nonce_file.txt');
var stream_error = fs.createWriteStream('Nonce_file_error.txt');
var reconnected_log = fs.createWriteStream('Reconnected_log.txt');
var BindingError_log = fs.createWriteStream('BindingError_log.txt');
var ConnectionError_log = fs.createWriteStream('ConnectionError_log.txt');
let _nonce = 0

let client = new SignalRClient({
    // websocket will be automatically reconnected if server does not respond to ping after 10s
    pingTimeout:10000
});

client.on('orderBookUpdate', function(data){
    let dataVal = new Date() + '===========' + data['N'] + '===============' + data['M'] +"\n";
    console.log(dataVal)
    if (_nonce !=0 && _nonce+1 != data['N']){
        let err = 'Last nonce lost for: '+data['M']+ ' at ' + new Date() + ' last nonce: ' + _nonce + ' current Nonce being: ' + data['N'] + "\n"; 
        stream_error.write(err);
    }
    stream_log.write(dataVal);
    _nonce = data['N']		
    return;
});

console.log("=== Subscribing to 'ETH-BTC' pair");
client.subscribeToMarkets(['BTC-ETH']);

