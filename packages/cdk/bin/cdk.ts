#!/usr/bin/env node
import 'source-map-support/register';
import { App, Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AppStack } from '../lib/app-stack';

const app = new App();

new AppStack(app, 'lambda-provisioned-throttling', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  local: {
    ttl: Duration.days(1),
    authType: lambda.FunctionUrlAuthType.NONE,
    provisionedConcurrentExecutions: 5,
  },
});
