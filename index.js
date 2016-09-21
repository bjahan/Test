'use strict'
var https = require('https');
var express = require("express");
var cookieParser = require('cookie-parser');
var session = require('express-session');
var app = express();
var morgan = require('morgan');

var client = require('smartsheet');
var smartsheet = client.createClient({ accessToken: '6iemjrijyyw9qqud4ptwb8g1bj' });

app.use(cookieParser());
app.use(session({
    secret: 'btprefab',
    resave: false,
    saveUninitialized: false
}));

var port = process.env.PORT || 5000;

// serve static files
app.use(express.static(__dirname + '/views'));

//app.set('views', __dirname + '/views');

// set ejs as view engine
app.set('view engine', 'ejs');

var api = require('./routes/api');
app.use('/api', api); // redirect API calls

app.use(morgan('combined'));

app.get('/', (req, res) => {
    res.render('index');
});

app.get("/auth", function (req, res) {
    getAuthCode(res, "developer.api.autodesk.com", "2iPA1uj6nqALolRpStRAAaEPK7U4H51g", "euJMIWAGL75uLXju");
});

app.get("/s", function (req, res) {

    var options = {
        id: 8199442105952132 // ID of Sheet
    };

    var options2 = {
        sheetId: 8199442105952132,
        rowId: 1232047235721092
    };
    
    var rowData = null;
    smartsheet.sheets.getRow(options2).then(function (data){
        rowData = data;
        console.log(rowData);
        //updateRow();
    });

    var colId;
    smartsheet.sheets.getSheet(options).then(function (sheet) {
        for (var i = 0; i < (sheet.columns).length; i++) {
            if (sheet.columns[i].title === 'Check') {
                colId = sheet.columns[i].id;
            }
        };
        //updateRow();
    });
    


    function updateRow() {
        if (!colId || !rowData) return;
        var row = {
            "id": rowData.id,
            "cells": [{
                "columnId": colId,
                "value": "Yellow"
            }]
        };

        var options = {
            body: row,
            sheetId: 8199442105952132
        };

        smartsheet.sheets.updateRow(options)
            .then(function (data) {
                console.log(data);
            })
            .catch(function (error) {
                console.log(error);
            });
    }
    
    smartsheet.users.listAllUsers()
    .then(function (data) {

        //res.write("Users are:" + data.data[0].name + "\r");
        //res.write("Users are:" + data.data[1].name + "\r");
        //res.write("Users are:" + data.data[2].name + "\r");
        //res.end();

    })
    .catch(function (error) {
        console.log(error);
    });

    //res.write("Users are:" + smartsheet.users.listAllUsers().data.data[1].name);
    //res.end();
});

app.listen(port);


function getAuthCode(mainResponse, baseUrl, clientId, clientSecret) {
    var dataString = "client_id=" + clientId + "&client_secret=" + clientSecret + "&grant_type=client_credentials";

    var headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    };

    var options = {
        host: baseUrl,
        port: 443,
        path: "/authentication/v1/authenticate",
        method: "POST",
        headers: headers,

        // only for dev!
        rejectUnauthorized: false,
        requestCert: true,
        agent: false
    };

    var req = https.request(options, function (res) {
        res.setEncoding("utf8");
        var responseString = "";

        res.on("data", function (data) {
            responseString += data;
        });

        res.on("end", function () {
            console.log(responseString);
            mainResponse.setHeader('Content-Type', 'application/json');
            mainResponse.setHeader('Access-Control-Allow-Origin', '*');
            mainResponse.send(responseString);  // forward our response onto the original call from the browser app
        });
    });

    req.write(dataString);
    req.end();
}

