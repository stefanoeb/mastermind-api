# Mastermind-API Backend
## AxiomZen's challenge @vanhackaton

The challenge was to build a reliable, scalable and well-tested API in which many users can play [mastermind](https://en.wikipedia.org/wiki/Mastermind_(board_game) with, along with multiplayer feature and any interesting add-on that we think it could fit.

## Tech Stack
In order to fulfill the requirements, I built my entire API in a serverless architecture within Amazon Web Services that offers a easily-scalable and well managed structure.

**Chosen Stack**:

* Node.JS
* AWS Lambda
* AWS DynamoDB (NoSQL)
* AWS API Gateway

With it all set up, we have some key benefits:
* Scale-up is one click away, both for logic (Lambda) and for database read OR write ops (DynamoDB)
* HTTP Codes can be fully handled with API Gateway
* Security: Amazon takes care of CORS, authentication and throttling for us
* Caching: You can use cache in some cases so you don't punish your backend again and again.

## How to Play & API Reference





