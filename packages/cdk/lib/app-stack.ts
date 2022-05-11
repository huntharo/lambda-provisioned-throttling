import { Construct } from 'constructs';
import { CfnOutput, CfnParameter, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { TimeToLive } from '@cloudcomponents/cdk-temp-stack';
import { ServiceConstruct } from './service-construct';

interface AppProps extends StackProps {
  readonly local: {
    /**
     * Time after which to automatically delete all resources.
     */
    readonly ttl?: Duration;

    /**
     * Auth type to use
     *
     * @default NONE
     */
    readonly authType?: lambda.FunctionUrlAuthType;

    /**
     * Number of concurrent executions to pre-provision.
     *
     * Note: this costs $$$ even if idle
     *
     * @default 0
     */
    readonly provisionedConcurrentExecutions?: number;
  };
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppProps) {
    super(scope, id, props);

    const { local } = props;
    const {
      authType = lambda.FunctionUrlAuthType.NONE,
      ttl,
      provisionedConcurrentExecutions = 0,
    } = local;

    // const vpcId = new CfnParameter(this, 'vpcId', {
    //   type: 'AWS::EC2::VPC::Id',
    //   description: 'The VPC to attach the ALB to',
    // });
    // const subnetIds = new CfnParameter(this, 'subnets', {
    //   type: 'List<AWS::EC2::Subnet::Id>',
    //   description: 'Subnets for the ALB',
    // });

    const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
      isDefault: true,
    });
    const subnets = vpc.publicSubnets;
    // const subnets = subnetIds.valueAsList.map((subnetId: string) => {
    //   return ec2.Subnet.fromSubnetId(this, 'subnet', subnetId);
    // });

    // Set stack to delete if this is a PR build
    if (ttl !== undefined) {
      new TimeToLive(this, 'TimeToLive', {
        ttl,
      });
    }

    //
    // Create arm64 lambda
    //
    const serviceARM = new ServiceConstruct(this, 'service-arm64', {
      memorySize: 128,
      arch: 'arm64',
      autoDeleteEverything: ttl !== undefined,
      provisionedConcurrentExecutions: provisionedConcurrentExecutions
        ? provisionedConcurrentExecutions
        : undefined,
      authType,
      vpc,
      subnets,
    });

    //
    // Create arm64 lambda
    //
    const serviceARMZip = new ServiceConstruct(this, 'service-arm64-zip', {
      memorySize: 128,
      arch: 'arm64',
      functionType: 'zip',
      autoDeleteEverything: ttl !== undefined,
      provisionedConcurrentExecutions: provisionedConcurrentExecutions
        ? provisionedConcurrentExecutions
        : undefined,
      authType,
      vpc,
      subnets,
    });

    //
    // Create amd64 lambda
    //
    // const serviceAMD = new ServiceConstruct(this, 'service-amd64', {
    //   memorySize: 128,
    //   arch: 'x86_64',
    //   autoDeleteEverything: ttl !== undefined,
    //   provisionedConcurrentExecutions: provisionedConcurrentExecutions
    //     ? provisionedConcurrentExecutions
    //     : undefined,
    //   authType,
    // });

    new CfnOutput(this, 'service-url-arm', {
      value: serviceARM.serviceFuncUrl.url,
      exportName: `${this.stackName}-function-url-docker`,
    });
    new CfnOutput(this, 'service-url-arm-provisioned', {
      value: serviceARM.serviceFuncProvisionedUrl.url,
      exportName: `${this.stackName}-function-url-docker-provisioned`,
    });
    new CfnOutput(this, 'service-alb-url-arm', {
      value: serviceARM.albUrl,
      exportName: `${this.stackName}-alb-url-docker`,
    });
    new CfnOutput(this, 'service-alb-url-arm-provisioned', {
      value: serviceARM.albProvisionedUrl,
      exportName: `${this.stackName}-alb-url-docker-provisioned`,
    });

    new CfnOutput(this, 'service-url-arm-zip', {
      value: serviceARMZip.serviceFuncUrl.url,
      exportName: `${this.stackName}-function-url-zip`,
    });
    new CfnOutput(this, 'service-url-arm-zip-provisioned', {
      value: serviceARMZip.serviceFuncProvisionedUrl.url,
      exportName: `${this.stackName}-function-url-zip-provisinoed`,
    });
    new CfnOutput(this, 'service-alb-url-arm-zip', {
      value: serviceARMZip.albUrl,
      exportName: `${this.stackName}-url-zip`,
    });
    new CfnOutput(this, 'service-alb-url-arm-zip-provisioned', {
      value: serviceARMZip.albProvisionedUrl,
      exportName: `${this.stackName}-alb-url-zip-provisinoed`,
    });

    // new CfnOutput(this, 'service-url-amd', {
    //   value: serviceAMD.serviceFuncUrl.url,
    //   exportName: `${this.stackName}-service-url-amd`,
    // });
  }
}
