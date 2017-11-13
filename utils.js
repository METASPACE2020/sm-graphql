const slack = require('node-slack'),
  jsondiffpatch = require('jsondiffpatch'),
  winston = require('winston'),
  moment = require('moment'),
  { PubSub } = require('graphql-subscriptions'),
  { generateProcessingConfig } = require('./config-gen.js');

const config = require('config');

function metadataChangeSlackNotify(user, datasetId, oldMetadata, newMetadata) {
  const delta = jsondiffpatch.diff(oldMetadata, newMetadata),
    diff = jsondiffpatch.formatters.jsonpatch.format(delta);

  const slackConn = config.slack.webhook_url ? new slack(config.slack.webhook_url): null;
  if (slackConn) {
    let oldDSName = oldMetadata.metaspace_options.Dataset_Name || "";
    let msg = slackConn.send({
      text: `${user} edited metadata of ${oldDSName} (id: ${datasetId})` +
      "\nDifferences:\n" + JSON.stringify(diff, null, 2),
      channel: config.slack.channel
    });
  }
}

function metadataUpdateFailedSlackNotify(user, datasetId, e_msg) {
  const slackConn = config.slack.webhook_url ? new slack(config.slack.webhook_url): null;
  if (slackConn) {
    let msg = slackConn.send({
      text: `${user} tried to edit metadata (ds_id=${datasetId})\nError: ${e_msg}`,
      channel: config.slack.channel
    });
  }
}

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      level: config.log.level,
      timestamp: function() {
        return moment().format();
      },
      formatter: function(options) {
        // Return string will be passed to logger.
        return options.timestamp() +' - '+ options.level.toUpperCase() +' - '+ (options.message ? options.message : '') +
          (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
      }
    })
  ]
});

const pubsub = new PubSub();

const dbConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

let pg = require('knex')({
  client: 'pg',
  connection: dbConfig(),
  searchPath: 'knex,public'
});

module.exports = {
  generateProcessingConfig,
  metadataChangeSlackNotify,
  metadataUpdateFailedSlackNotify,
  config,
  logger,
  pubsub,
  pg
};
