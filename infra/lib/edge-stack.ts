import { Stack, StackProps, CfnOutput, Duration } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy
} from "aws-cdk-lib/aws-cloudfront";
import { LoadBalancerV2Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

interface EdgeStackProps extends StackProps {
  alb: ApplicationLoadBalancer;
}

/**
 * CloudFront distribution in front of the ALB. Single origin keeps the demo simple:
 * CloudFront proxies the entire app (HTML, JS, API) through the ALB. The React app
 * is served by the same Node server from a static directory in the bundle.
 *
 * This is the **submission URL**.
 */
export class EdgeStack extends Stack {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const albOrigin = new LoadBalancerV2Origin(props.alb, {
      protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
      readTimeout: Duration.seconds(30),
      connectionAttempts: 3,
      connectionTimeout: Duration.seconds(5)
    });

    this.distribution = new Distribution(this, "Distribution", {
      comment: "Mini-Jira CloudFront in front of ALB",
      priceClass: PriceClass.PRICE_CLASS_100, // North America + Europe, cheapest
      defaultBehavior: {
        origin: albOrigin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
        compress: true
      },
      additionalBehaviors: {
        "/assets/*": {
          origin: albOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          compress: true
        }
      }
    });

    new CfnOutput(this, "DistributionDomainName", {
      value: this.distribution.distributionDomainName,
      description: "PUBLIC URL FOR SUBMISSION (open in browser without changes)"
    });
    new CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId
    });
  }
}
