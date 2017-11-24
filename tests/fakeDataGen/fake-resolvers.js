const {readFileSync} = require('fs');
const JSOG = require('jsog');

const data = JSOG.parse(readFileSync("fake_data.json"));
const jwt = require('jwt-simple');
const config = require('config');
const {UserError} = require('graphql-errors');

function getById(fieldName) {
  return id => data[fieldName].filter(x => x.id == id)[0];
}

const getDataset = getById('datasets');
const getProject = getById('projects');
const getAnnotation = getById('annotations');
const getUser = getById('people');

console.log(data.projects[0].manager.id);

module.exports = {
  Query: {
    group(_, {id}, ctx) {
      if (!ctx.token)
        throw new UserError('You must log in in order to access group information');
      const {sub} = jwt.decode(ctx.token, config.jwt.secret);
      const group = data.groups.filter(g => g.id == id)[0];
      if (!group || group.members.filter(m => m.id == sub).length == 0)
        throw new UserError('You do not have access to this group, go away!');
      return group;
    },
    project: (_, {id}) => getProject(id),
    dataset: (_, {id}) => getDataset(id),
    annotation: (_, {id}) => getAnnotation(id),
    user: (_, {id}) => getUser(id),

    allAnnotations(_, {datasetFilter, filter}) {
      // only support filtering by dataset id
      // anything more than that requires storing the records in ES
      const n = filter.sumFormula ? 3 : 20;
      if (datasetFilter.ids)
        return data.annotations.filter(a => a.dataset.id == datasetFilter.ids).slice(0, n);
      else
        return data.annotations.slice(0, n);
    },

    allDatasets(_, {filter}) {
      if (filter.status != 'FINISHED')
        return [];
      if (filter.ids)
        return data.datasets.filter(d => d.id == filter.ids);
      else
        return data.datasets;
    },

    countAnnotations() { return 100; },
    countDatasets() { return 10; },
    metadataSuggestions() { return ['A', 'B', 'C']; },
    peopleSuggestions() { return data.datasets.map(d => d.submitter); },
    molecularDatabases() { return [{name: 'HMDB', version: '2016'}]; }
  },

  Annotation: {
    isotopeImages(a) {
      const {_width, _height} = a.dataset;
      return [{
        minIntensity: 0, maxIntensity: 100, totalIntensity: 1000, mz: a.mz,
        url: 'https://picsum.photos/' + _width + '/' + _height + '/?random&did=' + a.id
      }];
    },
    peakChartData(a) {
      return JSON.stringify({
        ppm: 3.0,
        mz_grid: {min_mz: a.mz - 0.5, max_mz: a.mz + 4.5},
        theor: {
          centroid_mzs: [a.mz, a.mz + 1, a.mz + 2, a.mz + 3],
          mzs: [a.mz], ints: [100]
        }
      });       
    }
  },

  Mutation: {
    removeUserFromGroup(_, {userId, groupId}, ctx) {
      return {success: true};
    },

    addDatasetToProject(_, {projectId, datasetId}) {
      const project = getProject(projectId);
      const dataset = getDataset(datasetId);
      if (project.datasets.indexOf(dataset) == -1) {
        project.datasets.push(dataset);
        dataset.projects.push(project);
      }
      return {success: true}
    },

    removeDatasetFromProject(_, {projectId, datasetId}) {
      const project = getProject(projectId);
      const dataset = getDataset(datasetId);
      const idxP = project.datasets.indexOf(dataset);
      const idxD = dataset.projects.indexOf(project);
      console.log(idxP, idxD);
      if (idxP >= 0) {
        project.datasets.splice(idxP, 1);
        dataset.projects.splice(idxD, 1);
      }

      return {success: true}
    }
  }
}
