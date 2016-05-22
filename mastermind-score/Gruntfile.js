'use strict';

var grunt = require('grunt');
grunt.loadNpmTasks('grunt-aws-lambda');

grunt.initConfig({
    lambda_invoke: {
        default: {}
    },
    lambda_deploy: {
        default: {
            arn: 'arn:aws:lambda:us-east-1:462398742414:function:mastermind-newgame',
            options: {
                credentialsJSON: 'credentials.json'
            }
        }
    },
    lambda_package: {
        default: {}
    }
});

grunt.registerTask('deploy', ['lambda_package', 'lambda_deploy']);