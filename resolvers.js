const sprintf = require('sprintf-js'),
  jwt = require('jwt-simple'),
  {UserError} = require('graphql-errors'),
  fetch = require('node-fetch');

const config = require('config'),
  {esSearchResults, esCountResults, esCountGroupedResults,
   esAnnotationByID, esDatasetByID} = require('./esConnector'),
  {datasetFilters, dsField, getPgField, SubstringMatchFilter} = require('./datasetFilters.js'),
  {generateProcessingConfig, metadataChangeSlackNotify,
    metadataUpdateFailedSlackNotify, fetchDS,
    logger, pubsub, pg} = require("./utils.js"),
  {Mutation: DSMutation, Query: DSQuery} = require('./dsMutation.js');

function publishDatasetStatusUpdate(ds_id, status, attempt=1) {
  // wait until updates are reflected in ES so that clients don't have to care
  const maxAttempts = 5;
  esDatasetByID(ds_id).then(function(ds) {
    if (attempt > maxAttempts) {
      console.warn(`Failed to propagate dataset update for ${ds_id}`);
      return;
    }
    console.log(attempt, status, ds === null);

    if (ds === null && status == 'DELETED') {
      setTimeout(() => { pubsub.publish('datasetDeleted', {datasetId: ds_id}); }, 1000);
    } else if (ds !== null && status != 'DELETED') {
      const dataset = Object.assign({}, ds, {status});
      pubsub.publish('datasetStatusUpdated', {dataset});
    } else {
      setTimeout(publishDatasetStatusUpdate,
                 50 * attempt * attempt,
                 ds_id, status, attempt + 1);
    }
  });
}

let queue = require('amqplib').connect(`amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}`);
let rabbitmqChannel = 'sm_dataset_status';
queue.then(function(conn) {
  return conn.createChannel();
}).then(function(ch) {
  return ch.assertQueue(rabbitmqChannel).then(function(ok) {
    return ch.consume(rabbitmqChannel, function(msg) {
      const {ds_id, status} = JSON.parse(msg.content.toString());
      if (['QUEUED', 'STARTED', 'FINISHED', 'FAILED', 'DELETED'].indexOf(status) >= 0)
        publishDatasetStatusUpdate(ds_id, status);
      ch.ack(msg);
    });
  });
}).catch(console.warn);

function baseDatasetQuery() {
  return pg.from(function() {
    this.select(pg.raw('dataset.id as id'),
                'name',
                pg.raw('max(finish) as last_finished'),
                pg.raw('dataset.status as status'),
                'metadata', 'config', 'input_path')
        .from('dataset').leftJoin('job', 'dataset.id', 'job.ds_id')
        .groupBy('dataset.id').as('tmp');
  });
}


const Resolvers = {
  Person: {
    name(obj) { return obj.First_Name; },
    surname(obj) { return obj.Surname; },
    email(obj) { return obj.Email; }
  },

  Query: {
    dataset(_, { id }) {
      return esDatasetByID(id);
    },

    async allDatasets(_, args) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return esSearchResults(args, 'dataset');
    },

    allAnnotations(_, args) {
      return esSearchResults(args, 'annotation');
    },

    countDatasets(_, args) {
      args.datasetFilter = args.filter;
      args.filter = {};
      return esCountResults(args, 'dataset');
    },

    countDatasetsPerGroup(_, {query}) {
      const args = {
        datasetFilter: query.filter,
        simpleQuery: query.simpleQuery,
        filter: {},
        groupingFields: query.fields
      };
      return esCountGroupedResults(args, 'dataset');
    },

    countAnnotations(_, args) {
      return esCountResults(args, 'annotation');
    },

    annotation(_, { id }) {
      return esAnnotationByID(id);
    },

    metadataSuggestions(_, { field, query, limit }) {
      let f = new SubstringMatchFilter(field, {}),
          q = pg.select(pg.raw(f.pgField + " as field")).select().from('dataset')
                .groupBy('field').orderByRaw('count(*) desc').limit(limit);
      return f.pgFilter(q, query).orderBy('field', 'asc')
              .then(results => results.map(row => row['field']));
    },

    peopleSuggestions(_, { role, query }) {
      const schemaPath = 'Submitted_By.' + (role == 'PI' ? 'Principal_Investigator' : 'Submitter');
      const p1 = schemaPath + '.First_Name',
            p2 = schemaPath + '.Surname',
            f1 = getPgField(p1),
            f2 = getPgField(p2);
      const q = pg.distinct(pg.raw(`${f1} as name, ${f2} as surname`)).select().from('dataset')
                  .whereRaw(`${f1} ILIKE ? OR ${f2} ILIKE ?`, ['%' + query + '%', '%' + query + '%']);
      logger.info(q.toString());
      return q.orderBy('name', 'asc').orderBy('surname', 'asc')
              .then(results => results.map(r => ({First_Name: r.name, Surname: r.surname, Email: ''})))
    },

    molecularDatabases(_, args) {
      const host = config.services.moldb_service_host;
      return fetch(`http://${host}/v1/databases`)
        .then(res => res.json())
        .then((body) => {
          let mol_dbs = body['data'];
          logger.debug(`Molecular databases: ` + JSON.stringify(mol_dbs));
          return mol_dbs;
        })
        .catch((e) => { logger.error(e); return null; })
    },

    opticalImageUrl(_, {datasetId, zoom}) {
      const intZoom = zoom <= 1.5 ? 1 : (zoom <= 3 ? 2 : (zoom <= 6 ? 4 : 8));
      return pg.select().from('optical_image')
          .where('ds_id', '=', datasetId)
          .where('zoom', '=', intZoom)
          .then(records => {
              if (records.length > 0)
                  return '/optical_images/' + records[0].id;
              else
                  return null;
          })
          .catch((e) => {
              logger.error(e);
          })
    },

    rawOpticalImage(_, {datasetId}) {
      return pg.select().from('dataset')
        .where('id', '=', datasetId)
        .then(records => {
          if (records.length > 0)
            return {
              url: '/raw_optical_images/' + records[0].optical_image,
              transform: records[0].transform
            };
          else
            return null;
        })
        .catch((e) => {
          logger.error(e);
        })
    },

    reprocessingNeeded(_, args) {
      return DSQuery.reprocessingNeeded(args);
    }
  },

  Analyzer: {
    resolvingPower(msInfo, { mz }) {
      const rpMz = msInfo.rp.mz,
        rpRp = msInfo.rp.Resolving_Power;
      if (msInfo.type.toUpperCase() == 'ORBITRAP')
        return Math.sqrt(rpMz / mz) * rpRp;
      else if (msInfo.type.toUpperCase() == 'FTICR')
        return (rpMz / mz) * rpRp;
      else
        return rpRp;
    }
  },

  Dataset: {
    id(ds) {
      return ds._source.ds_id;
    },

    name(ds) {
      return ds._source.ds_name;
    },

    configJson(ds) {
      return JSON.stringify(ds._source.ds_config);
    },

    metadataJson(ds) {
      return JSON.stringify(ds._source.ds_meta);
    },

    institution(ds) { return dsField(ds, 'institution'); },
    organism(ds) { return dsField(ds, 'organism'); },
    organismPart(ds) { return dsField(ds, 'organismPart'); },
    condition(ds) { return dsField(ds, 'condition'); },
    growthConditions(ds) { return dsField(ds, 'growthConditions'); },
    polarity(ds) { return dsField(ds, 'polarity').toUpperCase(); },
    ionisationSource(ds) { return dsField(ds, 'ionisationSource'); },
    maldiMatrix(ds) { return dsField(ds, 'maldiMatrix'); },

    submitter(ds) {
      return ds._source.ds_meta.Submitted_By.Submitter;
    },

    principalInvestigator(ds) {
      return ds._source.ds_meta.Submitted_By.Principal_Investigator;
    },

    analyzer(ds) {
      const msInfo = ds._source.ds_meta.MS_Analysis;
      return {
        'type': msInfo.Analyzer,
        'rp': msInfo.Detector_Resolving_Power
      };
    },

    status(ds) {
      return ds._source.ds_status;
    },

    inputPath(ds) {
      return ds._source.ds_input_path;
    },

    uploadDateTime(ds) {
      return ds._source.ds_upload_dt;
    },

    fdrCounts(ds, {inpFdrLvls, checkLvl}) {
      let outFdrLvls = [], outFdrCounts = [], maxCounts = 0, dbName = '';
      if(ds._source.annotation_counts && ds._source.ds_status === 'FINISHED') {
        let annotCounts = ds._source.annotation_counts;
        let dbList = ds._source.ds_meta.metaspace_options.Metabolite_Database;
        let filteredDbList = annotCounts.filter(el => {
          return dbList.includes(el.db.name)
        });
        for (let db of filteredDbList) {
          let maxCountsCand = db.counts.find(lvlObj => {
            return lvlObj.level === checkLvl
          });
          if (maxCountsCand.n >= maxCounts) {
            maxCounts = maxCountsCand.n; outFdrLvls = []; outFdrCounts = [];
            inpFdrLvls.forEach(inpLvl => {
              let findRes = db.counts.find(lvlObj => {
                return lvlObj.level === inpLvl
              });
              if (findRes) {
                dbName = db.db.name;
                outFdrLvls.push(findRes.level);
                outFdrCounts.push(findRes.n);
              }
            })
          } else {
            break;
          }
        }
      }
      return {
        'dbName': dbName,
        'levels': outFdrLvls,
        'counts': outFdrCounts
      }
    },

    opticalImage(ds) {
      return Resolvers.Query.rawOpticalImage(null, {datasetId: ds._source.ds_id})
          .then(optImage => {
            if (optImage.transform == null) {
              //non-existing optical image don't have transform value
              return 'noOptImage'
            }
            return optImage.url
          }).catch((e) => {
            logger.error(e);
          })
    }
  },

  Annotation: {
    id(hit) {
      return hit._id;
    },

    sumFormula(hit) {
      return hit._source.sf;
    },

    possibleCompounds(hit) {
      const ids = hit._source.comp_ids;
      const names = hit._source.comp_names;
      let compounds = [];
      for (let i = 0; i < names.length; i++) {
        let id = ids[i];
        let dbName = hit._source.db_name,
          dbBaseName = dbName.split('-')[0];

        let infoURL;
        if (dbBaseName === 'HMDB') {
          infoURL = `http://www.hmdb.ca/metabolites/${id}`;
        } else if (dbBaseName === 'ChEBI') {
          infoURL = `http://www.ebi.ac.uk/chebi/searchId.do?chebiId=${id}`;
        } else if (dbBaseName === 'SwissLipids') {
          infoURL = `http://swisslipids.org/#/entity/${id}`;
        } else if (dbBaseName === 'LipidMaps') {
          infoURL = `http://www.lipidmaps.org/data/LMSDRecord.php?LMID=${id}`;
        } else if (dbBaseName === 'PAMDB') {
          infoURL = `http://pseudomonas.umaryland.edu/PAMDB?MetID=${id}`;
        }

        compounds.push({
          name: names[i],
          imageURL: `http://${config.services.mol_image_server_host}/mol-images/${dbBaseName}/${id}.svg`,
          information: [{database: dbName, url: infoURL, databaseId: id}]
        });
      }
      return compounds;
    },

    adduct: (hit) => hit._source.adduct,

    mz: (hit) => parseFloat(hit._source.centroid_mzs[0]),

    fdrLevel: (hit) => hit._source.fdr,

    msmScore: (hit) => hit._source.msm,

    rhoSpatial: (hit) => hit._source.image_corr,

    rhoSpectral: (hit) => hit._source.pattern_match,

    rhoChaos: (hit) => hit._source.chaos,

    dataset(hit) {
      return Object.assign({_id: hit._source.ds_id}, hit);
    },

    peakChartData(hit) {
      const {sf_adduct, ds_meta, ds_config, ds_id, mz} = hit._source;
      const msInfo = ds_meta.MS_Analysis;
      const host = config.services.moldb_service_host,
        pol = msInfo.Polarity.toLowerCase() == 'positive' ? '+1' : '-1';

      let rp = mz / (ds_config.isotope_generation.isocalc_sigma * 2.35482),
        ppm = ds_config.image_generation.ppm,
        theorData = fetch(`http://${host}/v1/isotopic_pattern/${sf_adduct}/tof/${rp}/400/${pol}`);

      return theorData.then(res => res.json()).then(json => {
        let {data} = json;
        data.ppm = ppm;
        return JSON.stringify(data);
      }).catch(e => logger.error(e));
    },

    isotopeImages(hit) {
      const {iso_image_ids, centroid_mzs, total_iso_ints, min_iso_ints, max_iso_ints} = hit._source;
      return centroid_mzs.map(function(mz, i) {
        return {
          url: iso_image_ids[i] !== null ? config.img_upload.categories.iso_image.path + iso_image_ids[i] : null,
          mz: parseFloat(mz),
          totalIntensity: total_iso_ints[i],
          minIntensity: min_iso_ints[i],
          maxIntensity: max_iso_ints[i]
        }
      });
    }
  },

  Mutation: {
    resubmitDataset: async (_, args) => {
      let {jwt, datasetId, name, path, metadataJson, priority, sync, delFirst} = args;
      const ds = await fetchDS({id: datasetId});
      if (ds === undefined)
        throw new UserError('DS does not exist');
      name = name || ds.name;
      path = path || ds.input_path;
      metadata = (metadataJson !== undefined) ? JSON.parse(metadataJson) : ds.metadata;
      return DSMutation.submit({jwt, datasetId, name, path, metadata, priority, sync, delFirst});
    },

    submitDataset: (_, args) => {
      args.metadata = JSON.parse(args.metadataJson);
      delete args['metadataJson'];
      return DSMutation.submit(args);
    },

    updateMetadata: (_, args) => {
      return DSMutation.update(args);
    },

    deleteDataset: (_, args) => {
      return DSMutation.delete(args);
    },

    addOpticalImage: (_, {input}) => {
      return DSMutation.addOpticalImage(input);
    },

    deleteOpticalImage: (_, args) => {
      return DSMutation.deleteOpticalImage(args);
    }
  },

  Subscription: {
    datasetStatusUpdated: {
      subscribe: () => pubsub.asyncIterator('datasetStatusUpdated'),
      resolve: payload => { return payload; }
    },

    datasetDeleted: {
      subscribe: () => pubsub.asyncIterator('datasetDeleted'),
      resolve: payload => { return payload; }
    }
  }
};

module.exports = Resolvers;
