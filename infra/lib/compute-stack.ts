import { Stack, StackProps, CfnOutput, Duration } from "aws-cdk-lib";
import {
  AutoScalingGroup,
  HealthCheck
} from "aws-cdk-lib/aws-autoscaling";
import {
  AmazonLinuxCpuType,
  AmazonLinuxGeneration,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  UserData,
  Vpc
} from "aws-cdk-lib/aws-ec2";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  TargetType
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal
} from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

interface ComputeStackProps extends StackProps {
  vpc: Vpc;
  tasksTable: Table;
  projectsTable: Table;
  commentsTable: Table;
  auditLogsTable: Table;
  usersTable: Table;
  teamsTable: Table;
  originalsBucket: Bucket;
  resizedBucket: Bucket;
  artifactsBucket: Bucket;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  taskAssignedTopic: Topic;
  dailyDigestTopic: Topic;
  alertsTopic: Topic;
}

/**
 * ALB-fronted Auto Scaling Group of 2 EC2 instances across 2 AZs.
 * ALB lives in public subnets; EC2 lives in private subnets and reaches
 * S3 / Cognito / Dynamo / SNS through the VPC's NAT gateway.
 * User-data installs Node, pulls server bundle from artifacts S3, runs systemd unit on :4000.
 */
export class ComputeStack extends Stack {
  public readonly alb: ApplicationLoadBalancer;
  public readonly asg: AutoScalingGroup;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // -------- IAM role for EC2 --------
    const instanceRole = new Role(this, "InstanceRole", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        // SSM Session Manager (shell access without SSH key)
        ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
        // CloudWatch Agent for EC2 metrics + log shipping
        ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
      ]
    });
    [
      props.tasksTable, props.projectsTable, props.commentsTable,
      props.auditLogsTable, props.usersTable, props.teamsTable
    ].forEach((t) => t.grantReadWriteData(instanceRole));
    props.originalsBucket.grantReadWrite(instanceRole);
    props.resizedBucket.grantRead(instanceRole);
    props.artifactsBucket.grantRead(instanceRole);
    props.taskAssignedTopic.grantPublish(instanceRole);
    instanceRole.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        "sns:Subscribe",
        "sns:ListSubscriptionsByTopic",
        "sns:SetSubscriptionAttributes"
      ],
      // EC2 subscribes new users to all three topics during signup / admin create.
      resources: [
        props.taskAssignedTopic.topicArn,
        props.dailyDigestTopic.topicArn,
        props.alertsTopic.topicArn
      ]
    }));
    // Cognito perms:
    //  - AdminInitiateAuth + AdminGetUser for /api/auth/login
    //  - AdminCreateUser + AdminSetUserPassword + AdminUpdateUserAttributes for admin user management
    instanceRole.addToPrincipalPolicy(new PolicyStatement({
      actions: [
        "cognito-idp:AdminInitiateAuth",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDeleteUser"
      ],
      resources: [props.userPool.userPoolArn]
    }));

    // -------- Security groups --------
    const albSg = new SecurityGroup(this, "AlbSg", {
      vpc: props.vpc,
      description: "Allow HTTP from the internet",
      allowAllOutbound: true
    });
    albSg.addIngressRule(Peer.anyIpv4(), Port.tcp(80), "HTTP from internet");

    const instanceSg = new SecurityGroup(this, "InstanceSg", {
      vpc: props.vpc,
      description: "Allow :4000 only from ALB",
      allowAllOutbound: true
    });
    instanceSg.addIngressRule(albSg, Port.tcp(4000), "App port from ALB");

    // -------- User data --------
    const userData = UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      "dnf install -y nodejs unzip",
      "mkdir -p /opt/app",
      `aws s3 cp s3://${props.artifactsBucket.bucketName}/server-bundle.tgz /opt/app/server-bundle.tgz`,
      "tar -xzf /opt/app/server-bundle.tgz -C /opt/app",
      "cd /opt/app && npm ci --omit=dev || true",
      "cat > /etc/mini-jira.env <<'EOF'",
      "MINI_JIRA_BACKEND=aws",
      `AWS_REGION=${Stack.of(this).region}`,
      "PORT=4000",
      `COGNITO_USER_POOL_ID=${props.userPool.userPoolId}`,
      `COGNITO_CLIENT_ID=${props.userPoolClient.userPoolClientId}`,
      `DYNAMO_TASKS_TABLE=${props.tasksTable.tableName}`,
      `DYNAMO_PROJECTS_TABLE=${props.projectsTable.tableName}`,
      `DYNAMO_COMMENTS_TABLE=${props.commentsTable.tableName}`,
      `DYNAMO_AUDIT_LOGS_TABLE=${props.auditLogsTable.tableName}`,
      `DYNAMO_USERS_TABLE=${props.usersTable.tableName}`,
      `DYNAMO_TEAMS_TABLE=${props.teamsTable.tableName}`,
      `S3_ORIGINALS_BUCKET=${props.originalsBucket.bucketName}`,
      `S3_RESIZED_BUCKET=${props.resizedBucket.bucketName}`,
      `SNS_TOPIC_TASKS_ASSIGNED=${props.taskAssignedTopic.topicArn}`,
      `SNS_TOPIC_DAILY_DIGEST=${props.dailyDigestTopic.topicArn}`,
      `SNS_TOPIC_ALERTS=${props.alertsTopic.topicArn}`,
      "EOF",
      "cat > /etc/systemd/system/mini-jira.service <<'EOF'",
      "[Unit]",
      "Description=Mini-Jira server",
      "After=network.target",
      "[Service]",
      "Type=simple",
      "EnvironmentFile=/etc/mini-jira.env",
      "WorkingDirectory=/opt/app",
      "ExecStart=/usr/bin/node /opt/app/server/dist/src/index.js",
      "Restart=always",
      "RestartSec=5",
      "User=ec2-user",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",
      "chown -R ec2-user:ec2-user /opt/app",
      "systemctl daemon-reload",
      "systemctl enable mini-jira.service",
      "systemctl start mini-jira.service"
    );

    // -------- Auto Scaling Group --------
    this.asg = new AutoScalingGroup(this, "AppAsg", {
      vpc: props.vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      machineImage: MachineImage.latestAmazonLinux2023({ cpuType: AmazonLinuxCpuType.X86_64 }),
      minCapacity: 2,
      maxCapacity: 4,
      desiredCapacity: 2,
      role: instanceRole,
      securityGroup: instanceSg,
      userData,
      healthCheck: HealthCheck.elb({ grace: Duration.minutes(5) })
    });

    // -------- ALB --------
    this.alb = new ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: SubnetType.PUBLIC }
    });

    const targetGroup = new ApplicationTargetGroup(this, "AppTG", {
      vpc: props.vpc,
      port: 4000,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.INSTANCE,
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3
      },
      deregistrationDelay: Duration.seconds(15)
    });
    this.asg.attachToApplicationTargetGroup(targetGroup);

    this.alb.addListener("HttpListener", {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    });

    new CfnOutput(this, "AlbDnsName", { value: this.alb.loadBalancerDnsName });
    new CfnOutput(this, "AsgName", { value: this.asg.autoScalingGroupName });
  }
}
