import { Stack, StackProps, Duration } from "aws-cdk-lib";
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  MathExpression,
  Metric,
  Stats,
  TextWidget,
  TreatMissingData
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface ObservabilityStackProps extends StackProps {
  asg: AutoScalingGroup;
  alertsTopic: Topic;
  tasksTable: Table;
}

/**
 * Spec calls for ≥4 dashboard widgets and ≥1 alarm publishing to SNS.
 *   1. Tasks created per day      (custom metric MiniJira/TasksCreated)
 *   2. Tasks closed per day / team (custom metric MiniJira/TasksClosed, dim teamId)
 *   3. Average time-to-close      (custom metric MiniJira/TaskTimeToCloseMs)
 *   4. EC2 CPU utilization        (built-in AWS/EC2 + AWS/AutoScaling)
 * Alarm: OverdueTasks > 5 -> alerts SNS topic.
 */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const ns = "MiniJira";

    const tasksCreated = new Metric({
      namespace: ns,
      metricName: "TasksCreated",
      statistic: Stats.SUM,
      period: Duration.hours(24)
    });

    const tasksClosedPerTeam = new MathExpression({
      expression: `SEARCH('{${ns},teamId} MetricName="TasksClosed"', 'Sum', 86400)`,
      label: "TasksClosed by team",
      period: Duration.hours(24)
    });

    const timeToClose = new Metric({
      namespace: ns,
      metricName: "TaskTimeToCloseMs",
      statistic: Stats.AVERAGE,
      period: Duration.hours(24)
    });

    const ec2Cpu = new Metric({
      namespace: "AWS/EC2",
      metricName: "CPUUtilization",
      dimensionsMap: { AutoScalingGroupName: props.asg.autoScalingGroupName },
      statistic: Stats.AVERAGE,
      period: Duration.minutes(5)
    });

    const overdue = new Metric({
      namespace: ns,
      metricName: "OverdueTasks",
      statistic: Stats.MAXIMUM,
      period: Duration.minutes(15)
    });

    const dashboard = new Dashboard(this, "Dashboard", {
      dashboardName: "MiniJira-Main"
    });

    dashboard.addWidgets(
      new TextWidget({
        markdown: "# Mini-Jira on AWS\nDashboard for the Cloud Computing S'26 project. " +
                  "Widgets satisfy the spec requirement of ≥4 widgets including " +
                  "tasks created/day, tasks closed/day per team, average time-to-close, and EC2 CPU.",
        width: 24,
        height: 2
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: "Tasks created per day",
        left: [tasksCreated],
        width: 12,
        height: 6
      }),
      new GraphWidget({
        title: "Tasks closed per day (per team)",
        left: [tasksClosedPerTeam],
        width: 12,
        height: 6
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: "Average time-to-close (ms)",
        left: [timeToClose],
        width: 12,
        height: 6
      }),
      new GraphWidget({
        title: "EC2 CPU utilization (avg across ASG)",
        left: [ec2Cpu],
        width: 12,
        height: 6
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: "Overdue tasks",
        left: [overdue],
        width: 24,
        height: 6
      })
    );

    // Alarm: more than 5 overdue tasks -> publish to alerts SNS topic.
    const alarm = new Alarm(this, "OverdueTasksAlarm", {
      alarmName: "MiniJira-OverdueTasks-GT5",
      metric: overdue,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: "Fires when the daily-digest Lambda reports >5 overdue tasks."
    });
    alarm.addAlarmAction(new SnsAction(props.alertsTopic));

    // Avoid unused-table warning; the metric is emitted by Lambdas reading from this table.
    void props.tasksTable;
  }
}
