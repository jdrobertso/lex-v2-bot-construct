import { LexModelsV2Client, StartImportCommand, CreateUploadUrlCommand, CreateUploadUrlCommandOutput, StartImportCommandOutput, ListImportsCommand, CreateBotVersionCommand, CreateBotAliasCommand, CreateBotVersionCommandOutput, BuildBotLocaleCommand} from '@aws-sdk/client-lex-models-v2';
import https from 'https';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function onEvent(event: any, _context: any) {
  console.log(event);
  switch(event.RequestType) {
  case 'Create':
    return onCreate(event);
  case 'Update':
    return onUpdate(event);
  case 'Delete':
    return onDelete(event);
  default:
    throw new Error(`Invalid request type ${event.RequestType}`);
  }
}

async function onCreate(event:any) {
  const props = event.ResourceProperties;
  const client = new LexModelsV2Client({});
  let output = '';

  try {
    const uploadURL = await createUploadURL(client);
    console.log('Created upload URL');
    const uploadRequest = await uploadBotZip(uploadURL.uploadUrl as string, props.botFileName);
    console.log(uploadRequest);
    console.log('uploaded bot zip');
    console.log(uploadURL.importId);
    const startImportRequest = await importBot(client, uploadURL.importId, props.createOperationType, props);
    console.log('started import');
    output = await resolveImport(startImportRequest, client);
    console.log('resolved import');
    await buildBotLanguage(output, client);
    const botVersion = await createBotVersion(output, client);
    await createBotAlias(botVersion, props, client);
  } catch (e) {
    console.log(e);
    throw new Error();
  }
  return output;
}

async function onUpdate(event:any) {
  const props = event.ResourceProperties;
  const client = new LexModelsV2Client({});
  let output = '';

  try {
    const uploadURL = await createUploadURL(client);
    console.log('Created upload URL');
    const uploadRequest = await uploadBotZip(uploadURL.uploadUrl as string, props.botFileName);
    console.log(uploadRequest);
    console.log('uploaded bot zip');
    console.log(uploadURL.importId);
    const startImportRequest = await importBot(client, uploadURL.importId, 'Overwrite', props);
    console.log('started import');
    output = await resolveImport(startImportRequest, client);
    console.log('resolved import');
    await buildBotLanguage(output, client);
    const botVersion = await createBotVersion(output, client);
    await createBotAlias(botVersion, props, client);
  } catch (e) {
    console.log(e);
    throw new Error();
  }

  return output;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onDelete(event:any) {
  return '1';
}

async function createUploadURL(client:LexModelsV2Client):Promise<CreateUploadUrlCommandOutput> {
  const uploadURLCommand = new CreateUploadUrlCommand({});
  const response = await client.send(uploadURLCommand);
  return response;
}

async function importBot(client:LexModelsV2Client, importId:string | undefined, mergeStrategy:string, props: any) {
  const childDirected = props.coppa === 'true' ? true : false;
  const command = new StartImportCommand({
    importId: importId,
    mergeStrategy: mergeStrategy,
    resourceSpecification: {
      botImportSpecification: {
        botName: props.botName,
        roleArn: props.botRoleArn,
        dataPrivacy: {
          childDirected: childDirected
        },
      }
    }
  });
  return await client.send(command);
}

function uploadBotZip(uploadURL:string, botFileName:string) {
  return new Promise((resolve, reject) => {
    try {
      const upload = new URL(uploadURL);
      const file = fs.readFileSync(`assets/${botFileName}`);
      const options = {
        method: 'PUT',
        headers: { 'Content-Length': file.length }
      };

      console.log(upload);
      const req = https.request(upload, options, res => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve(responseBody);
        });
      });

      req.on('error', err => {
        reject(err);
      });
      req.write(file);
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function resolveImport(startImport: StartImportCommandOutput, client: LexModelsV2Client): Promise<string> {
  const command = new ListImportsCommand({
    sortBy: {
      attribute: 'LastUpdatedDateTime',
      order: 'Ascending'
    }
  });
  const response = await client.send(command);
  // eslint-disable-next-line no-async-promise-executor
  return new Promise<string>(async (resolve, reject) => {
    if(response.importSummaries) {
      const summary = response.importSummaries.find(summary => {
        return summary.importId === startImport.importId;
      });
      console.log(summary);
      if (summary) {
        switch (summary.importStatus) {
        case 'Completed':
          resolve(summary.importedResourceId!);
          break;
        case 'InProgress':
          await delay(2000);
          resolve(resolveImport(startImport, client));
          break;
        default:
          reject(new Error('Import failed.'));
        }
      }
    }
  });
}

async function buildBotLanguage(output: string, client: LexModelsV2Client) {
  const buildLanguage = new BuildBotLocaleCommand({
    botId: output,
    botVersion: 'DRAFT',
    localeId: 'en_US',
  });
  return await client.send(buildLanguage);
}

async function createBotVersion(output: string, client: LexModelsV2Client) {
  const createVersion = new CreateBotVersionCommand({
    botId: output,
    botVersionLocaleSpecification: {
      'en_US': {
        sourceBotVersion: 'DRAFT'
      }
    }
  });
  return await client.send(createVersion);
}

async function createBotAlias(version: CreateBotVersionCommandOutput, props: any, client: LexModelsV2Client) {
  const createAlias = new CreateBotAliasCommand({
    botAliasName: 'live',
    botId: version.botId,
    conversationLogSettings: {
      textLogSettings: [
        {
          enabled: true,
          destination: {
            cloudWatch: {
              cloudWatchLogGroupArn: props.textLogDestination,
              logPrefix: props.botName,
            }
          }
        }
      ],
      audioLogSettings: [
        {
          enabled: true,
          destination: {
            s3Bucket: {
              s3BucketArn: props.audioFileDestination,
              logPrefix: props.botName
            }
          }
        }
      ]
    },
    sentimentAnalysisSettings: { detectSentiment: true },
    botAliasLocaleSettings: {
      'en_US': {
        enabled: true,
        codeHookSpecification: {
          lambdaCodeHook: {
            lambdaARN: props.lambdaArn,
            codeHookInterfaceVersion: '1.0'
          }
        }
      }
    }
  });
  return await client.send(createAlias);
}

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}
