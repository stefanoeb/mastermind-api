'use strict';

var AWS = require('aws-sdk'),
    uuid = require('uuid'),
    Q = require('q'),
    doc = require('dynamodb-doc');

// Unlock the aws-sdk
AWS.config.loadFromPath('./credentials.json');

// AWS Services
var dynamodb = new AWS.DynamoDB();

exports.handler = function (event, context) {

    var userName = event.userName;
    if (userName && userName.length > 0) {

        //Create the user
        __createUser(userName)
            .then(function (userKey) {

                context.done(null, {
                    userName: userName,
                    userKey: userKey
                });
            })
            .catch(function (error) {
                context.fail(error);
            });

    } else {
        context.fail('Parameter: Missing username parameter.');
    }
};

/**
 * Create a new user and get its key
 * @param {String} userName Name of the user being created
 * @returns {promise} A string containing the userKey
 * @private
 */
var __createUser = function (userName) {
    return Q.promise(function (resolve, reject) {

        var docClient = new doc.DynamoDB();
        //See if the username is not available anymore
        docClient.scan({
            TableName: 'user',
            FilterExpression : 'UserName = :userName',
            ExpressionAttributeValues : {':userName' : userName}
        }, function (error, list) {

            if (error) {
                reject(error);
                return;
            } else
            if (list && list.Count > 0) {

                //If the user already exists, I must warn the user in a different way
                reject('Username '+userName+' is already taken.');
                return;
            }

            //Generate the user key
            var userKey = uuid.v1();

            docClient.putItem({
                TableName: 'user',
                Item: {
                    UserKey: userKey,
                    UserName: userName,
                    Score: 0
                }
            }, function (err) {
                if (err != null) {
                    reject(err);
                } else {
                    resolve(userKey);
                }
            });
        });
    });
};
