import { Construct } from 'constructs';
import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import path from 'path';
import os from 'os';

interface ServiceProps {
  /**
   * Architecture to build for and run on
   *
   * @default x86_64
   */
  readonly arch?: 'arm64' | 'x86_64';

  /**
   * Type of function to create
   */
  readonly functionType?: 'docker' | 'zip';

  /**
   * Auth type to use
   *
   * @default NONE
   */
  readonly authType?: lambda.FunctionUrlAuthType;

  /**
   * Optional lambda function name.
   * Also used for the CloudWatch LogGroup for the function.
   *
   * @default - auto assigned
   */
  readonly lambdaFuncServiceName?: string;

  /**
   * Automatically clean up durable resources (e.g. for PR builds).
   * @default false
   */
  readonly autoDeleteEverything?: boolean;

  /**
   * The amount of memory, in MB, that is allocated to your Lambda function.
   *
   * Lambda uses this value to proportionally allocate the amount of CPU power. For more information, see Resource Model in the AWS Lambda Developer Guide.
   *
   * 1769 MB is 1 vCPU seconds of credits per second
   *
   * @default 512
   */
  readonly memorySize?: number;

  /**
   * Disables bundling for test builds so that snapshots remain stable
   *
   * @default false
   */
  readonly isTestBuild?: boolean;

  /**
   * VPC for the ALB
   */
  readonly vpc: ec2.IVpc;

  /**
   * Subnets for the ALB
   */
  readonly subnets: ec2.ISubnet[];

  /**
   * Number of provisioned concurrent executions to pre-provision.
   *
   * Note: this can cost $$$ even if idle, do not set high (> 10) and
   * cleanup when done.
   */
  readonly provisionedConcurrentExecutions?: number;
}

export interface IServiceExports {
  readonly serviceFunc: lambda.IFunction;

  readonly serviceFuncUrl: lambda.IFunctionUrl;
  readonly serviceFuncProvisionedUrl: lambda.IFunctionUrl;

  readonly alb: elbv2.ApplicationLoadBalancer;

  readonly albUrl: string;
  readonly albProvisionedUrl: string;
}

export class ServiceConstruct extends Construct implements IServiceExports {
  private _serviceFunc: lambda.Function;
  public get serviceFunc(): lambda.IFunction {
    return this._serviceFunc;
  }

  private _serviceFuncUrl: lambda.FunctionUrl;
  public get serviceFuncUrl(): lambda.IFunctionUrl {
    return this._serviceFuncUrl;
  }

  private _serviceFuncProvisionedUrl: lambda.FunctionUrl;
  public get serviceFuncProvisionedUrl(): lambda.IFunctionUrl {
    return this._serviceFuncProvisionedUrl;
  }

  private _alb: elbv2.ApplicationLoadBalancer;
  public get alb(): elbv2.ApplicationLoadBalancer {
    return this._alb;
  }

  private _albUrl: string;
  public get albUrl(): string {
    return this._albUrl;
  }

  private _albProvisionedUrl: string;
  public get albProvisionedUrl(): string {
    return this._albProvisionedUrl;
  }

  /**
   * Construct for the service that reads from DynamoDB
   * @param scope
   * @param id
   * @param props
   */
  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);

    const {
      autoDeleteEverything,
      lambdaFuncServiceName,
      memorySize = 128, // 1769 MB is 1 vCPU seconds of credits per second
      arch = 'x86_64',
      authType = lambda.FunctionUrlAuthType.NONE,
      functionType = 'docker',
      isTestBuild = false,
    } = props;

    //
    // Create the Lambda Function
    //
    if (functionType === 'docker') {
      this._serviceFunc = new lambda.DockerImageFunction(this, 'lambda-func', {
        code: lambda.DockerImageCode.fromImageAsset('./', {
          buildArgs: {
            arch: arch === 'x86_64' ? 'amd64' : arch,
            archImage: arch,
          },
        }),
        functionName: lambdaFuncServiceName,
        architecture: arch === 'x86_64' ? lambda.Architecture.X86_64 : lambda.Architecture.ARM_64,
        logRetention: logs.RetentionDays.ONE_MONTH,
        memorySize,
        timeout: Duration.seconds(20),
        environment: {
          NODE_ENV: 'production', // This is used by next.js and is always 'production'
        },
      });
    } else {
      this._serviceFunc = new lambdaNodejs.NodejsFunction(this, 'lambda-func', {
        entry: 'packages/lambda/src/index.ts',
        functionName: lambdaFuncServiceName,
        logRetention: logs.RetentionDays.ONE_MONTH,
        memorySize,
        timeout: Duration.seconds(20),
        runtime: lambda.Runtime.NODEJS_14_X,
        environment: {
          NODE_ENV: 'production', // This is used by next.js and is always 'production'
        },
        bundling: {
          minify: false,
          sourceMap: !isTestBuild,
          tsconfig: 'packages/lambda/tsconfig.json',
          format: lambdaNodejs.OutputFormat.ESM,
          // Thanks: https://github.com/evanw/esbuild/issues/253#issuecomment-1042853416
          target: 'node14.8',
        },
      });
    }
    if (lambdaFuncServiceName !== undefined) {
      Tags.of(this._serviceFunc).add('Name', lambdaFuncServiceName);
    }
    if (autoDeleteEverything) {
      this._serviceFunc.applyRemovalPolicy(RemovalPolicy.DESTROY);
    }

    // Creating an alias forces creation of a version when the hash
    // of the function source and properties changes.
    // CDK 1.110.0 appears to fix: https://github.com/aws/aws-cdk/releases/tag/v1.110.0
    // With CDK 1.104.0 this would fail on 2nd builds with unchanged lambda code.
    // The key issue for this project was: https://github.com/aws/aws-cdk/issues/15023
    // https://github.com/aws/aws-cdk/issues/5334
    const alias = this._serviceFunc.currentVersion.addAlias('ProvisionedVersion', {
      ...(props.provisionedConcurrentExecutions
        ? { provisionedConcurrentExecutions: props.provisionedConcurrentExecutions }
        : {}),
    });

    // Create the function URL on the Alias so it can use Provisioned Concurrency
    this._serviceFuncUrl = this._serviceFunc.addFunctionUrl({
      authType,
    });

    // Create a "current version" URL that does not have Provisioned Concurrency
    this._serviceFuncProvisionedUrl = alias.addFunctionUrl({
      authType,
    });

    // Create the ALB
    this._alb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      internetFacing: true,
      vpc: props.vpc,
      vpcSubnets: { subnets: props.subnets },
    });

    // Create the listener
    const listener = this._alb.addListener('listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    const targetGroupCurrentVersion = new elbv2.ApplicationTargetGroup(
      this,
      'target-group-current',
      {
        targets: [new elbv2targets.LambdaTarget(this._serviceFunc)],
      },
    );
    const targetGroupProvisioned = new elbv2.ApplicationTargetGroup(
      this,
      'target-group-provisioned',
      {
        targets: [new elbv2targets.LambdaTarget(alias)],
      },
    );

    listener.addAction('/', {
      action: elbv2.ListenerAction.forward([targetGroupCurrentVersion]),
    });
    listener.addAction('/provisioned', {
      action: elbv2.ListenerAction.forward([targetGroupProvisioned]),
      priority: 5,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/provisioned'])],
    });

    this._albUrl = `http://${this._alb.loadBalancerDnsName}/`;
    this._albProvisionedUrl = `http://${this._alb.loadBalancerDnsName}/provisioned`;
  }
}
