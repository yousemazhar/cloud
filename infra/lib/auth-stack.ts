import { Stack, StackProps, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import {
  AccountRecovery,
  OAuthScope,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

/**
 * Cognito User Pool with the two custom attributes the server reads:
 *   custom:role   -> "manager" | "employee" | "admin"
 *   custom:teamId -> string (team UUID, empty/absent for managers)
 *
 * server/src/services/aws/cognito-auth.ts already pulls these from the ID token.
 */
export class AuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: "mini-jira-users",
      selfSignUpEnabled: false, // managers add users (Cognito AdminCreateUser via seed script)
      signInAliases: { email: true, username: false },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true }
      },
      customAttributes: {
        role: new StringAttribute({ minLen: 1, maxLen: 32, mutable: true }),
        teamId: new StringAttribute({ minLen: 0, maxLen: 64, mutable: true })
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN
    });

    this.userPoolClient = new UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: "mini-jira-web",
      generateSecret: false,
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        userSrp: true
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE]
      },
      preventUserExistenceErrors: true
    });

    new CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      description: "Set as COGNITO_USER_POOL_ID env var on EC2"
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      description: "Set as COGNITO_CLIENT_ID env var on EC2 and VITE_COGNITO_CLIENT_ID on the client"
    });
  }
}
