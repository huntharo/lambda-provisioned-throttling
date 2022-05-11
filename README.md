# Overview

This repository contains an example of a possible bug with Lambda Provisioned Concurrency where the function will not scale above the Provisioned Concurrency value, even with Reserved Concurrency set far higher (to account-level unreserved concurrency).

The CDK stack deploys 2 different examples both with an ALB and a Function URL:

- Docker-based Lambda built for ARM64
- Zip-based Lambda built for ARM64

# Security Notice

The AWS Lambda URLs are configured with security set to `lambda.FunctionUrlAuthType.NONE` so they are open to any caller on the Internet. If this violates your security policies, change the type from `lambda.FunctionUrlAuthType.NONE` to `lambda.FunctionUrlAuthType.AWS_IAM`, then use `awscurl` instead of `curl` to test the function invocation.

[auth type config location](packages/cdk/bin/cdk.ts#L12)

# Usage

```
nvm use
npm i
npm run build
npm run build:rollup
docker-compose build

docker-compose up
# At this point the service should be up but will not be initialized until first request

# To get a shell, if needed, when `docker-compose up` is running:
docker-compose exec app /bin/sh

# To send a test request to the local instance:
npm run test-local-request

# To deploy to an AWS account
npx cdk deploy

# Invoke the Lambda Function URL
curl -v [paste the URL here]

# Invoke the Lambda ALB URL
curl -v [paste the URL here]
```

