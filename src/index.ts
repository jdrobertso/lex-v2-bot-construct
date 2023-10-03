import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { custom_resources as cr, aws_iam as iam, aws_logs as logs, RemovalPolicy, CustomResource, Duration } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import path from 'path';
import fs from 'fs';

export interface LexBotStackProps extends cdk.StackProps {
  botLambdaFunctionPath: string;
  botExportFilePath: string;
  botName: string;
  botLambdaFunctionRuntime: lambda.Runtime;
  botLambdaFunctionHandler: string;
}

export class LexBotStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: LexBotStackProps) {
    super(scope, id, props);


    const botLambdaFunction = new lambda.Function(this, 'LexFunction', {
      runtime: props.botLambdaFunctionRuntime,
      handler: props.botLambdaFunctionHandler,
      code: lambda.Code.fromAsset(props.botLambdaFunctionPath),
    });

    botLambdaFunction.addAlias('live');

    const audioFileDestination = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const textLogDestination = new logs.LogGroup(this, 'LogGroup', {});

    const lexBotRole = new iam.Role(this, 'LexBotRole', {
      assumedBy: new iam.ServicePrincipal('lexv2.amazonaws.com')
    });

    const providerLambdaFunction = new lambda.Function(this, 'ProviderFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'lib/index.onEvent',
      code: lambda.Code.fromAsset(path.join(__dirname, '../provider_lambda_handler')),
      timeout: Duration.minutes(5)
    });

    providerLambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: [
        'lex:*',
        'iam:PassRole'
      ]
    }));

    const lexProvider = new cr.Provider(this, 'LexProvider', {
      onEventHandler: providerLambdaFunction,
      logRetention: logs.RetentionDays.ONE_MONTH
    });

    const files = fs.readdirSync(props.botExportFilePath);

    const botFileName = this.getBotFileName(files);

    const bot = new CustomResource(this, 'GenericLexBot', {
      serviceToken: lexProvider.serviceToken,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      properties: {
        botFileName: botFileName,
        coppa: props.coppa,
        botName: props.botName,
        botRoleArn: lexBotRole.roleArn,
        textLogDestination: textLogDestination.logGroupArn,
        audioFileDestination: audioFileDestination.bucketArn,
        lambdaArn: botLambdaFunction.functionArn,
        lambdaVersion: botLambdaFunction.latestVersion.version,
        // Change this to 'Overwrite' if you have an existing bot you need to overwrite on create operations.
        createOperationType: 'FailOnConflict'
      }
    });
  }

  private getBotFileName(files: string[]) {
    files.sort();
    const newestFile = files[files.length - 1];
    if(!newestFile) {
      throw new Error('Bot Export Folder is Empty');
    }
    return newestFile;
  }
}
