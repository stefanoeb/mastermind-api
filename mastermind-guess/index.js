'use strict';

var AWS = require('aws-sdk'),
    Q = require('q'),
    doc = require('dynamodb-doc'),
    moment = require('moment-timezone');

// Unlock the aws-sdk
AWS.config.loadFromPath('./credentials.json');

exports.handler = function (event, context) {

    var gameKey = event.gameKey,
        userKey = event.userKey,
        code = event.code;


    //Must provide a gameKey
    if (!gameKey || !gameKey.length > 0) {
        context.fail('Parameter: Missing gameKey parameter.');
        return;
    }

    //Along with the userKey
    if (!userKey || !userKey.length > 0) {
        context.fail('Parameter: Missing userKey parameter.');
        return;
    }

    //And of course, the valid guess
    if (!code || !code.length > 0) {
        context.fail('Parameter: Missing code parameter.');
        return;
    } else if (code.length !== 8) {
        context.fail('Parameter: The code must be 8 characters long.');
        return;
    }

    //Get the game properties
    __getGameByKey(gameKey, userKey)
        .then(function (result) {

            //If the guess is not valid anymore
            if (!result.valid) {
                context.done(null, {
                    message: result.msg
                });
            } else {

                //Compute the guess
                var guess = __computeCode(code, result.gameData);
                guess.code = code;

                //Register the user guess history and retrieve the past informations
                __registerUserGuess(gameKey, userKey, guess, result.gameData.Players)
                    .then(function (guessHistory) {

                        var ret = {
                            gameKey: gameKey,
                            userKey: userKey,
                            past_guesses: guessHistory,
                            num_guesses: guessHistory.length,
                            solved: false
                        };

                        //If he solved, do what we must do
                        if (guess.exact === code.length) {
                            __finishGame(result.gameData, userKey)
                                .then(function (finishData) {

                                    ret.solved = true;
                                    ret.time = finishData.time;
                                    ret.score = finishData.score;
                                    context.done(null, ret);

                                })
                                .catch(function (error) {
                                    context.fail(error);
                                });
                        } else {
                            context.done(null, ret);
                        }
                    })
                    .catch(function (error) {
                        context.fail(error);
                    });


            }

        })
        .catch(function (error) {
            context.fail(error);
        });
};

/**
 * Get the game data, doing some validations
 * @param {String} gameKey Game Key
 * @param {String} userKey User Key
 * @returns {promise}
 * @private
 */
var __getGameByKey = function (gameKey, userKey) {
    return Q.promise(function (resolve, reject) {

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

            //If the game exists
            if (!list || !list.Count > 0) {
                reject('Not Found: The gameKey does not match any created game');
                return;
            }

            //If the subject is a player of the game
            var players = list.Items[0].Players,
                found = false;
            for (var i = 0; i < players.length; i++) {
                if (players[i].UserKey === userKey) {
                    found = true;
                }
            }
            if (!found) {
                reject('Not Found: Your user is not a player of this game.');
                return;
            }

            //If it is finished already (Must be a HTTP/200)
            if (list.Items[0].Status === 'SOLVED') {
                resolve({
                    valid: false,
                    msg: 'Too late mate, other player solved it quicker than you! Start a new one as a revenge.'
                });
                return;
            }

            //If it has expired
            if (list.Items[0].Status === 'EXPIRED') {
                resolve({
                    valid: false,
                    msg: 'This game is expired, nobody figured out how to break the code :('
                });
                return;
            }

            //Check if it is any time left
            var startTime = list.Items[0].StartTime;
            if (startTime && moment.isMoment(moment(startTime, 'YYYY-MM-DD HH:mm:ss'))) {

                //If the game began more than 5 minutes ago, set as Expired.
                if (moment(startTime).diff(moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss'), 'minutes') <= -5) {
                    __changeGameStatus(gameKey, 'EXPIRED')
                        .then(function () {
                            resolve({
                                valid: false,
                                msg: 'This game is expired, nobody figured out how to break the code :('
                            });
                        })
                        .catch(function (error) {
                            reject(error);
                        });
                } else {

                    //Yay, the guess can be computed
                    resolve({
                        valid: true,
                        gameData: list.Items[0]
                    });
                }
            } else {

                //Start the game time and update the status
                __startGame(gameKey)
                    .then(function (list) {

                        //Yay, the guess can be computed
                        resolve({
                            valid: true,
                            gameData: list.Attributes
                        });
                    })
                    .catch(function (error) {
                        reject(error);
                    });
            }
        });
    });
};

/**
 * Change the game status
 * @param {String} gameKey Game Key
 * @param {String} Status One the the valid game states: ['WAITING', 'STARTED', 'SOLVED', 'EXPIRED']
 * @returns {promise} Null if the status is successfully changed
 * @private
 */
var __changeGameStatus = function (gameKey, Status) {
    return Q.promise(function (resolve, reject) {

        var docClient = doc.DynamoDB();
        docClient.updateItem({
                TableName: 'mastermind',
                Key: {
                    "GameKey": gameKey
                },
                AttributeUpdates: {
                    Status: {
                        Action: 'PUT',
                        Value: Status
                    }
                }
            },
            function (error) {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
    });
};

/**
 * Compute the exacts and nears of the given code
 * @param {String} code The guess
 * @param {object} gameData The full game data from DynamoDB
 * @returns {object} Object with the near and exact guesses
 * @private
 */
var __computeCode = function (code, gameData) {

    var result = {
        exact: 0,
        near: 0
    };

    //Parse the string into arrays, so I can maniplate them properly
    var arGuesses = code.split('');
    var arTarget = gameData.Code.split('');

    //First, we compute the exacts
    var removedItems = 0;
    var arRemainingGuesses = [];
    arGuesses.forEach(function (guess, idx) {
        if (guess === arTarget[idx - removedItems]) {
            result.exact++;
            arTarget.splice(idx - removedItems, 1);
            removedItems++;
        } else {
            arRemainingGuesses.push(guess);
        }
    });

    //Now the near guesses
    arRemainingGuesses.forEach(function (guess) {
        var found = arTarget.some(function (target, idx) {
            if (guess === target) {
                arTarget.splice(idx, 1);
                return true;
            }
        });
        if (found) {
            result.near++;
        }
    });

    return result;
};

/**
 * Register a new guess for that user in the game
 * @param {String} gameKey Game key
 * @param {String} userKey User key
 * @param {object} guess Object containing the code and the result of the guess
 * @param {Array} playersList The list of players in the game
 * @returns {promise} An array containing the user past guesses
 * @private
 */
var __registerUserGuess = function (gameKey, userKey, guess, playersList) {
    return Q.promise(function (resolve, reject) {

        var Players = playersList,
            guessHistory = [];

        //Search for the past guesses of that user
        Players.forEach(function (player) {
            if (player.UserKey === userKey) {
                player.Guesses.push(guess);
                guessHistory = player.Guesses;
            }
        });

        var docClient = doc.DynamoDB();
        docClient.updateItem({
                TableName: 'mastermind',
                Key: {
                    "GameKey": gameKey
                },
                AttributeUpdates: {
                    Players: {
                        Action: 'PUT',
                        Value: Players
                    }
                }
            },
            function (error) {
                if (error) {
                    reject(error);
                } else {
                    resolve(guessHistory);
                }
            });
    });
};

/**
 * Start the game, changing the status and the start time
 * @param {String} gameKey The game key
 * @returns {promise} Null if successfull
 * @private
 */
var __startGame = function (gameKey) {
    return Q.promise(function (resolve, reject) {

        var docClient = doc.DynamoDB();
        docClient.updateItem({
                TableName: 'mastermind',
                Key: {
                    "GameKey": gameKey
                },
                AttributeUpdates: {
                    "Status": {
                        Action: 'PUT',
                        Value: 'STARTED'
                    },
                    "StartTime": {
                        Action: 'PUT',
                        Value: moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss')
                    }
                },
                ReturnValues: 'ALL_NEW'
            },
            function (error, list) {
                if (error) {
                    reject(error);
                } else {
                    resolve(list);
                }
            });
    });
};

/**
 * Set the game as finished as calculates the score
 * @param {object} gameData The game data retrieved from DynamoDB
 * @param {String} userKey The user key
 * @returns {promise} Object with the amount of seconds elapsed and the score obtained
 * @private
 */
var __finishGame = function (gameData, userKey) {
    return Q.promise(function (resolve, reject) {

        //Calculate the score and the time [Score is 250+each second towards the deadline]
        var secs = moment(moment().tz('America/Sao_Paulo').format('YYYY-MM-DD HH:mm:ss')).diff(moment(gameData.StartTime), 'seconds');
        var score = 250 + (300 - secs);

        //Sets the game status to finished and compute the new score at the same time
        Q.all([
            __changeGameStatus(gameData.GameKey, 'SOLVED'),
            __addScoreToUser(userKey, score)
        ])
            .then(function () {

                resolve({
                    time: secs + ' secs',
                    score: score
                });
            })
            .catch(function (error) {
                reject(error);
            });
    });
};

/**
 * Sums up the new score to the user
 * @param {String} userKey The user key
 * @param {int} score The score achieved this game
 * @returns {promise} Null if successfull
 * @private
 */
var __addScoreToUser = function (userKey, score) {
    return Q.promise(function (resolve, reject) {

        var docClient = doc.DynamoDB();
        docClient.updateItem({
            TableName: 'user',
            Key: {
                "UserKey": userKey
            },
            UpdateExpression: 'set Score = Score + :x',
            ExpressionAttributeValues: {':x': score}
        }, function (error) {
            if (error){
                reject(error);
            } else {
                resolve();
            }
        })
    });
};