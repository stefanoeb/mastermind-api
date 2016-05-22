'use strict';

var AWS = require('aws-sdk'),
    Q = require('q'),
    doc = require('dynamodb-doc');

// Unlock the aws-sdk
AWS.config.loadFromPath('./credentials.json');

exports.handler = function (event, context) {

    var gameKey = event.gameKey,
        userKey = event.userKey;

    //Must provide a gameKey
    if (!gameKey || !gameKey.length > 0) {
        context.fail('Parameter: Missing gameKey parameter.');
        return;
    }

    //And a userKey
    if (!userKey || !userKey.length > 0) {
        context.fail('Parameter: Missing userKey parameter.');
        return;
    }

    //Validate both keys to see if they truly exist and it is possible to join the game
    __validateKeys(gameKey, userKey)
        .then(function () {

            //Attach the new user to the game
            __addPlayer(gameKey, userKey)
                .then(function () {

                    context.done(null, {
                        userKey: userKey,
                        gameKey: gameKey
                    });
                })
                .catch(function (error) {
                    context.fail(error);
                })
        })
        .catch(function (error) {
            context.fail(error);
        });
};

/**
 * See if the game is active and the user exists
 * @param {String} gameKey The gameKey
 * @param {String} userKey The userKey
 * @returns {promise} Null if everything is on the tracks
 * @private
 */
var __validateKeys = function (gameKey, userKey) {
    return Q.promise(function (resolve, reject) {

        //Get the target game and see if it is possible to join
        var docClient = new doc.DynamoDB();
        docClient.query({
            TableName: 'mastermind',
            KeyConditions: [
                docClient.Condition("GameKey", "EQ", gameKey)
            ]
        }, function (error, list) {
            if (error) {
                reject(error);
                return;
            }

            //If the game is not found
            if (!list || list.Count === 0) {
                reject('Not Found: GameKey does not match any created game.');
                return;
            } else
            //If the game is found, but finished or started already
            if (list.Count > 0 && list.Items[0].Status !== 'WAITING') {
                reject('Not Found: The game do not accept players anymore.');
                return;
            } else {

                //If the subject is already in the game
                var players = list.Items[0].Players;
                for (var i = 0; i < players.length; i++) {
                    if (players[i].UserKey === userKey) {
                        reject('Parameter: You are a player in this game already.');
                    }
                }
            }


            //Fine, now we must validate the user
            docClient.query({
                TableName: 'user',
                KeyConditions: [
                    docClient.Condition("UserKey", "EQ", userKey)
                ]
            }, function (error, list) {
                if (error) {
                    reject(error);
                    return;
                }

                //If the user do not exist
                if (!list || list.Count === 0) {
                    reject('Not Found: UserKey does not match any created user.');
                } else {

                    //Yeah, seems that we can join in
                    resolve();
                }
            });
        });
    });
};

/**
 * Add a player to the game
 * @param {String} gameKey Game key
 * @param {String} userKey User key
 * @returns {promise}
 * @private
 */
var __addPlayer = function (gameKey, userKey) {
    return Q.promise(function (resolve, reject) {

        var docClient = doc.DynamoDB();
        docClient.updateItem({
                TableName: 'mastermind',
                Key: {
                    "GameKey": gameKey
                },
                AttributeUpdates: {
                    Players: {
                        Action: 'ADD',
                        Value: [{
                            UserKey: userKey,
                            Guesses: []
                        }]
                    }
                }
            },
            function (error, list) {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(list);
            }
        )
        ;
    });
};