import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { IpAddresses, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * VPC across 2 AZs with public subnets for the ALB and private subnets
 * (with egress) for the EC2 ASG. A single NAT gateway in one public subnet
 * provides outbound internet for both private subnets — the cheapest layout
 * that still matches the spec ("public subnets for the ALB; private subnets
 * for EC2; NAT gateway for outbound traffic").
 */
export class NetworkStack extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // The "app" group is the original public subnet group — kept under its
    // original name so the existing CloudFormation exports stay stable and
    // we avoid a circular cross-stack export update when adding the private
    // group. The ALB stays here; the ASG now sits in the new "private" group.
    this.vpc = new Vpc(this, "Vpc", {
      ipAddresses: IpAddresses.cidr("10.20.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "app",     subnetType: SubnetType.PUBLIC,              cidrMask: 24 },
        { name: "private", subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 }
      ]
    });

    new CfnOutput(this, "VpcId", { value: this.vpc.vpcId, exportName: "MiniJira-VpcId" });
  }
}
