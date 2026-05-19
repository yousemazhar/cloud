import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import type { Logger } from "../logger.js";

/**
 * Optional metrics seam. Local mode uses NoopMetrics (logs only). AWS mode emits
 * MiniJira/{TasksCreated,TasksClosed,TaskTimeToCloseMs} to CloudWatch so the
 * dashboard widgets in ObservabilityStack have data.
 */
export interface MetricsEmitter {
  taskCreated(teamId: string): void;
  taskClosed(teamId: string, timeToCloseMs: number): void;
}

export class NoopMetrics implements MetricsEmitter {
  constructor(private readonly logger?: Logger) {}
  taskCreated(teamId: string): void {
    this.logger?.debug({ teamId }, "metrics:noop taskCreated");
  }
  taskClosed(teamId: string, timeToCloseMs: number): void {
    this.logger?.debug({ teamId, timeToCloseMs }, "metrics:noop taskClosed");
  }
}

export interface CloudWatchMetricsConfig {
  client: CloudWatchClient;
  namespace?: string;
}

export class CloudWatchMetrics implements MetricsEmitter {
  private readonly client: CloudWatchClient;
  private readonly namespace: string;

  constructor(config: CloudWatchMetricsConfig, private readonly logger?: Logger) {
    this.client = config.client;
    this.namespace = config.namespace ?? "MiniJira";
  }

  private fireAndForget(promise: Promise<unknown>): void {
    promise.catch((err) => this.logger?.warn({ err }, "metrics publish failed"));
  }

  taskCreated(teamId: string): void {
    this.fireAndForget(this.client.send(new PutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: [
        { MetricName: "TasksCreated", Value: 1, Unit: StandardUnit.Count, Timestamp: new Date() },
        {
          MetricName: "TasksCreated",
          Dimensions: [{ Name: "teamId", Value: teamId }],
          Value: 1,
          Unit: StandardUnit.Count,
          Timestamp: new Date()
        }
      ]
    })));
  }

  taskClosed(teamId: string, timeToCloseMs: number): void {
    this.fireAndForget(this.client.send(new PutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: [
        { MetricName: "TasksClosed", Value: 1, Unit: StandardUnit.Count, Timestamp: new Date() },
        {
          MetricName: "TasksClosed",
          Dimensions: [{ Name: "teamId", Value: teamId }],
          Value: 1,
          Unit: StandardUnit.Count,
          Timestamp: new Date()
        },
        {
          MetricName: "TaskTimeToCloseMs",
          Value: timeToCloseMs,
          Unit: StandardUnit.Milliseconds,
          Timestamp: new Date()
        }
      ]
    })));
  }
}
