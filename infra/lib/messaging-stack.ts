import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription, SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

interface MessagingStackProps extends StackProps {
  notifyEmail: string;
}

/**
 * Spec calls for SNS fan-out on task assignment:
 *   - email subscription to the assignee
 *   - SQS queue drained by the assignment-worker Lambda
 *
 * Plus separate topics for the daily digest emails and the overdue-tasks alarm.
 */
export class MessagingStack extends Stack {
  public readonly taskAssignedTopic: Topic;
  public readonly dailyDigestTopic: Topic;
  public readonly alertsTopic: Topic;
  public readonly assignmentQueue: Queue;
  public readonly assignmentDlq: Queue;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);

    this.assignmentDlq = new Queue(this, "AssignmentDLQ", {
      queueName: "mini-jira-assignment-events-dlq",
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY
    });

    this.assignmentQueue = new Queue(this, "AssignmentQueue", {
      queueName: "mini-jira-assignment-events",
      visibilityTimeout: Duration.seconds(60),
      retentionPeriod: Duration.days(4),
      encryption: QueueEncryption.SQS_MANAGED,
      deadLetterQueue: { queue: this.assignmentDlq, maxReceiveCount: 5 },
      removalPolicy: RemovalPolicy.DESTROY
    });

    this.taskAssignedTopic = new Topic(this, "TaskAssignedTopic", {
      topicName: "mini-jira-tasks-assigned",
      displayName: "Mini-Jira assignments"
    });
    // Fan-out (a): notify assignee by email (course demo uses a single inbox).
    this.taskAssignedTopic.addSubscription(new EmailSubscription(props.notifyEmail));
    // Fan-out (b): drop into SQS for the assignment-worker Lambda.
    this.taskAssignedTopic.addSubscription(new SqsSubscription(this.assignmentQueue));

    this.dailyDigestTopic = new Topic(this, "DailyDigestTopic", {
      topicName: "mini-jira-daily-digest",
      displayName: "Mini-Jira daily digest"
    });
    this.dailyDigestTopic.addSubscription(new EmailSubscription(props.notifyEmail));

    this.alertsTopic = new Topic(this, "AlertsTopic", {
      topicName: "mini-jira-alerts",
      displayName: "Mini-Jira alarms"
    });
    this.alertsTopic.addSubscription(new EmailSubscription(props.notifyEmail));

    new CfnOutput(this, "TaskAssignedTopicArn", {
      value: this.taskAssignedTopic.topicArn,
      description: "Set as SNS_TOPIC_TASKS_ASSIGNED env var on EC2"
    });
    new CfnOutput(this, "AssignmentQueueUrl", { value: this.assignmentQueue.queueUrl });
    new CfnOutput(this, "DailyDigestTopicArn", { value: this.dailyDigestTopic.topicArn });
    new CfnOutput(this, "AlertsTopicArn", { value: this.alertsTopic.topicArn });
  }
}
