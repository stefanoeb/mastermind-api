'use strict';

var AWS = require('aws-sdk'),
    uuid = require('uuid'),
    Q = require('q'),
    doc = require('dynamodb-doc');

// Unlock the aws-sdk
AWS.config.loadFromPath('./credentials.json');

// Possible colors
var COLORS = "RBGYOPCM";

exports.handler = function (event, context) {
    var userKey = event.userKey;

    //Who are you?
    if (!userKey || !userKey.length > 0) {
        context.fail('Parameter: Missing userKey parameter.');
    }

    //Don't try to fool me, i'll check that key
    __getUserByKey(userKey)
        .then(function (userList) {

            if (userList && userList.Count > 0 && userList.Items[0].UserKey === userKey) {

                //So you are creating and brand-new game
                __createGame(userKey)
                    .then(function (result) {

                        //Deliver important informations about the game
                        result.possible_colors = COLORS;
                        result.code_length = COLORS.length;
                        context.done(null, result);
                    })
                    .catch(function (error) {
                        context.fail(error);
                    });
            } else {
                context.fail('Not Found: UserKey does not match any user.');
            }
        })
        .catch(function (error) {
            context.fail(error);
        });
};

/**
 * Creates a new game generating the key
 * @param {String} userKey The userkey that we're searching
 * @returns {promise} A list of found users in dynamodb
 * @private
 */
var __getUserByKey = function (userKey) {
    return Q.promise(function (resolve, reject) {

        var docClient = new doc.DynamoDB();
        docClient.query({
            TableName: 'user',
            KeyConditions: [
                docClient.Condition("UserKey", "EQ", userKey)
            ]
        }, function (error, list) {

            if (error) {
                reject(error);
            } else {
                resolve(list);
            }
        });
    });
};

/**
 * Creates a new game generating the key
 * @param {String} userKey The username that will be creating the game
 * @returns {promise} An object with the the created game data
 * @private
 */
var __createGame = function (userKey) {
    return Q.promise(function (resolve, reject) {

        var gameKey = uuid.v1();
        var code = __shuffle(COLORS);

        var docClient = new doc.DynamoDB();
        docClient.putItem({
            TableName: 'mastermind',
            Item: {
                GameKey: gameKey,
                Code: code,
                CreatorUserKey: userKey,
                Status: 'WAITING',
                StartTime: false,
                Players: [
                    {
                        UserKey: userKey,
                        Guesses: []
                    }
                ]
            }
        }, function (error) {

            if (error) {
                reject(error);
            } else {
                resolve({
                    gameKey: gameKey,
                    userKey: userKey
                });
            }
        });
    });
};

/**
 * Shuffle the possible colors inside a string
 * @param {String} str The input string
 * @returns {String} A real mess!
 * @private
 */
var __shuffle = function (str) {
    if (str && str.length > 0) {

        var n = str.length;
        var res = "";
        for (var i = 0; i < n; i++) {
            res += str[__getRandom(0, n - 1)];
        }

        return res;
    } else {
        return str;
    }
};

/**
 * Get a random floating point number between `min` and `max`.
 * @param {number} min Minimum number
 * @param {number} max Maximum number
 * @return {number} A random number
 */
var __getRandom = function (min, max) {
    return Math.floor(Math.random() * (max - min) + min);
};
