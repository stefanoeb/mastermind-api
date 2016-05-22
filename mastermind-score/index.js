'use strict';

var AWS = require('aws-sdk'),
    doc = require('dynamodb-doc');

// Unlock the aws-sdk
AWS.config.loadFromPath('./credentials.json');

exports.handler = function (event, context) {

    var docClient = doc.DynamoDB();
    //Get the whole user list
    docClient.scan({
        TableName: 'user'
    }, function(error, list) {
        if (error) {
            context.fail(error);
        } else {

            var results = list.Items.map(function (item) {
                return {
                    UserName: item.UserName,
                    Score: item.Score
                }
            });

            //Order by the highest score
            context.done(null, results.sort(function (a, b) {
                return a.Score > b.Score ? -1 : 1;
            }));
        }
    });
};
