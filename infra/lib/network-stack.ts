import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { IpAddresses, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * VPC across 2 AZs with public subnets only (no NAT gateway to stay free-tier).
 * EC2 sits in public subnets; ingress is locked down by the security group
 * created in ComputeStack so only ALB traffic reaches the instances.
 */
export class NetworkStack extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, "Vpc", {
      ipAddresses: IpAddresses.cidr("10.20.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "app",
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
          mapPublicIpOnLaunch: true
        }
      ]
    });

    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId, exportName: "MiniJira-VpcId" });
  }
}
