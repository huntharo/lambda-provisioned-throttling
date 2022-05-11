/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
import lambda from 'aws-lambda';
import { promisify } from 'util';
const sleep = promisify(setTimeout);

async function cheesyInit() {
  console.log('cheesyInit - started');
  try {
    console.log(`cheesyInit - __dirname working (it should not since this is ESM)?: ${__dirname}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.log(`cheesyInit - __dirname failed (it should fail since this is ESM): ${e.message}`);
  }
  await sleep(5000);
  console.log('cheesyInit - done');
}

await cheesyInit();

export async function handler(
  event: lambda.ALBEvent | lambda.APIGatewayProxyEventV2,
  context: lambda.Context,
  callback: lambda.ALBCallback | lambda.APIGatewayProxyCallbackV2,
): Promise<lambda.ALBResult | lambda.APIGatewayProxyStructuredResultV2 | undefined> {
  console.log('hi mom!');
  await sleep(100);
  console.log('bye mom!');

  // See if we have an API Gateway or Function URL event
  if (
    (event as lambda.APIGatewayProxyEventV2).routeKey === '$default' &&
    (event as lambda.APIGatewayProxyEventV2).version === 'v2'
  ) {
    console.log('API Gateway v2 event');

    const result: lambda.APIGatewayProxyStructuredResultV2 = {
      statusCode: 200,
      body: `You have reached the Lambda function - API Gateway v2 / Function URL
${context.invokedFunctionArn}
${context.functionVersion}
`,
      isBase64Encoded: false,
    };
    return result;
  }

  // Assume this is an ALB event
  console.log('ALB event');
  const result: lambda.ALBResult = {
    isBase64Encoded: false,
    statusCode: 200,
    statusDescription: 'OK',
    body: `You have reached the Lambda function - ALB
${context.invokedFunctionArn}
${context.functionVersion}
`,
  };
  return result;
}
