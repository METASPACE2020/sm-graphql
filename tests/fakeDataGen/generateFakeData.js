const fetch = require('node-fetch');
const faker = require('faker');
const {generateProcessingConfig} = require('../../config-gen.js');
const JSOG = require('jsog');
const fs = require('fs');

const MOL_FORMULAS = [
  'C27H44O3', 'C19H23ClN2O', 'C38H76NO7P', 'C23H29NO7', 'C55H94O6', 'C91H146O17P2', 'C16H14F3N3O3S',
  'C59H114O5', 'C83H148O17P2', 'C58H102O6', 'C93H148O17P2', 'C10H14N5O10PSe', 'C7H12O', 'C8H18N4O2',
  'C67H118O6', 'C36H60O9', 'C17H26N2O2', 'C52H88O6', 'C39H76NO7P', 'C87H144O17P2', 'C48H85N3O15P2',
  'C73H136O17P2', 'C65H112O6', 'C63H112O6', 'C32H46O16', 'C17H17N3O6S2', 'C59H104O6', 'C68H116O6',
  'C63H104O6', 'C63H110O6', 'C91H148O17P2', 'C21H34O8', 'C58H73N7O17', 'C8H16N2O3S2', 'C42H81NO11S',
  'C61H104O6', 'C29H60O', 'C61H116O6', 'C13H22O', 'C59H102O6', 'C69H114O6', 'C45H70O5', 'C58H96O6',
  'C35H62O7', 'C20H16O', 'C19H17ClFN3O5S', 'C61H108O5', 'C61H102O6', 'C91H148O17P2', 'C91H148O17P2',
  'C58H98O6', 'C61H96O6', 'C12H16O2', 'C12H18O13', 'C12H11NO4', 'C41H72O5','C57H96O6', 'C61H92O6',
  'C30H46O5', 'C10H13ClN2O4S', 'C33H56O14', 'C47H84O5', 'C4H6O4', 'C5H13N3O', 'C9H8ClN5S', 'C6H8N2O',
  'C51H94O6', 'C59H104O5', 'C20H18O7', 'C20H37NO3', 'C55H96O6', 'C41H85N2O6P','C19H32O2', 'C39H66O5',
  'C28H48O2', 'C53H98O6', 'C61H100O6', 'C12H22O11', 'C23H26N2O5', 'C7H15NS', 'C10H16', 'C6H6O2S',
  'C14H26O7', 'C59H112O6',  'C7H6O4', 'C43H74NO7P', 'C47H82O2', 'C60H106O5', 'C26H28O15', 'C45H72O5',
  'C86H146O17P2', 'C65H98O6', 'C15H24', 'C45H78O5', 'C6H10O7', 'C61H108O6', 'C15H22O4', 'C65H100O6',
  'C61H100O6', 'C62H114O6', 'C49H94O5', 'C6H12N2O2', 'C43H76NO7P', 'C63H110O6', 'C85H152O17P2',
  'C66H122O6', 'C67H110O6', 'C13H28O', 'C7H10O7', 'C61H116O6', 'C12H10O3', 'C61H102O5', 'C71H138O6',
  'C58H108O5', 'C59H96O29', 'C69H108O6', 'C17H23ClO2', 'C52H94NO8P', 'C6H6AsNO5', 'C83H148O17P2',
  'C59H100O6', 'C59H98O6', 'C30H46O4', 'C21H16O6', 'C24H34O5S', 'C16H28O6', 'C16H18O4', 'C5H6O2S',
  'C24H33FO6', 'C12H16O12', 'C26H28O5', 'C63H108O6', 'C20H30O5', 'C17H20N2S', 'C18H28O2', 'C19H32O4',
  'C17H21N2O7',  'C15H24O5', 'C46H77O10P', 'C18H28O4', 'C80H146O17P2', 'C21H31N5O3', 'C83H144O17P2',
  'C42H74O46S6', 'C87H150O17P2', 'C21H22O9', 'C14H28O', 'C104H182N4O47', 'C63H116O6', 'C67H122O6',
  'C63H114O6', 'C39H66N7O17P3S', 'C12H15N5O3', 'C63H120O5', 'C67H120O5', 'C61H112O6', 'C45H84NO8P',
  'C83H148O17P2', 'C12H26N8O3', 'C41H78NO7P', 'C53H94O5', 'C59H104O6', 'C44H77O10P', 'C40H38N4O16',
  'C63H116O5', 'C45H62O4', 'C22H30O3', 'C19H40NO7P', 'C11H20O2', 'C63H104O6', 'C24H48O2', 'C10H18O5',
  'C28H40O4', 'C27H35N9O15P2', 'C57H96O6', 'C77H138O17P2', 'C41H72O5', 'C87H146O17P2', 'C61H114O6',
  'C62H110O6', 'C22H32O5', 'C22H28FN3O6S', 'C57H104O6', 'C41H78O5', 'C87H154N4O37', 'C57H100O6',
  'C162H270N2O72P2', 'C63H110O6', 'C11H14O2', 'C10H14N5O8P', 'C9H10O2', 'C87H142O17P2', 'C65H118O6',
  'C47H81O13P', 'C17H28O4', 'C9H10O2', 'C45H91N2O6P', 'C67H116O6', 'C91H146O17P2', 'C40H36O11',
];

function fakeUser() {
  return {
    id: faker.random.uuid(),
    name: faker.name.findName(),
    secondaryEmails: [],
    groups: [],
    projects: []
  }
}

function fakeCompound() {
  return {
    name: faker.random.word(),
    imageURL: "http://52.19.27.255/mol-images/HMDB/HMDB00001.svg",
    information: [{database: "HMDB", url: "about:blank"}]
  }
}

function fakeAnnotation(dataset) {
  const adducts = dataset.polarity == 'Positive' ? ['+H', '+K', '+Na'] : ['-H', '+Cl'];
  return {
    id: faker.random.uuid(),
    dataset,
    sumFormula: faker.random.arrayElement(MOL_FORMULAS),
    adduct: faker.random.arrayElement(adducts),
    mz: faker.random.number({min: 150, max: 1200, precision: 0.0001}),
    possibleCompounds: [fakeCompound()],
    fdrLevel: faker.random.arrayElement([0.05, 0.1, 0.2, 0.5]),
    msmScore: faker.random.number({max: 1, precision: 0.001}),
    rhoSpatial: faker.random.number({max: 1, precision: 0.001}),
    rhoSpectral: faker.random.number({max: 1, precision: 0.001}),
    rhoChaos: faker.random.number({max: 1, precision: 0.001})
  }
}

function fakeDataset({submitter}) {
  const [name, surname] = submitter.name.split(' ', 2),
        group = submitter.groups[0],
        pi = group.manager,
        [pi_name, pi_surname] = pi.name.split(' ', 2);
  let d = faker.date.recent();
  const z = x => ("0" + x).slice(-2);
  let id = d.getFullYear() + '-' + z(d.getMonth()+1) + "-" + z(d.getDate()) + "_" + 
    z(d.getHours()) + "h" + z(d.getMinutes()) + "m" + z(d.getSeconds()) + "s";

  let ds = {
    id,
    name: faker.system.fileName(),
    _height: faker.random.number({min: 50, max: 150}),
    _width: faker.random.number({min: 50, max: 150}),
    polarity: faker.random.arrayElement(['POSITIVE', 'NEGATIVE']),
    institution: submitter.groups[0].institutionName,
    submitter: {name, surname, email: submitter.email},
    principalInvestigator: {name: pi_name, surname: pi_surname, email: pi.email},
    ionisationSource: faker.random.arrayElement(['DESI', 'MALDI']),
    analyzer: {type: faker.random.arrayElement(['Orbitrap', 'FTICR']),
               resolvingPower: 140000},
    organism: faker.random.arrayElement(['Human', 'Rat', 'Mouse', 'Kangaroo', 'Zebrafish']),
    organismPart: faker.random.arrayElement(['Brain', 'Liver', 'Lung', 'Heart', 'Tail']),
    condition: 'none',
    growthConditions: 'none',
    maldiMatrix: faker.random.arrayElement(['DHB', 'none']),
    status: 'FINISHED',
    inputPath: 's3a://' + faker.system.fileName(),
    uploadDateTime: d.toString(),
    access: faker.random.arrayElement(['VIEW', 'EDIT'])
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function person(_) { return {First_Name: _.name, Surname: _.surname, Email: _.email}; }

  ds.metadataJson = JSON.stringify({
    Sample_Information: {
      Organism: ds.organism,
      Organism_Part: ds.organismPart,
      Condition: ds.condition,
      Sample_Growth_Conditions: ds.growthConditions,
    },
    Sample_Preparation: {
      Sample_Stabilisation: 'none',
      Tissue_Modification: 'none',
      MALDI_Matrix: ds.maldiMatrix,
      Solvent: 'none',
      MALDI_Matrix_Application: 'none'
    },
    MS_Analysis: {
      Polarity: capitalize(ds.polarity.toLowerCase()),
      Ionisation_Source: ds.ionisationSource,
      Analyzer: ds.analyzer.type,
      Detector_Resolving_Power: {
        mz:  faker.random.number({min: 150, max: 400}),
        Resolving_Power: faker.random.number({min: 70000, max: 280000})
      }
    },
    Submitted_By: {
      Institution: ds.institution,
      Submitter: person(ds.submitter),
      Principal_Investigator: person(ds.principalInvestigator)
    },
    metaspace_options: {
      Metabolite_Database: ['HMDB'],
      Dataset_Name: ds.name
    },
    Additional_Information: {}
  });

  ds.configJson = JSON.stringify(generateProcessingConfig(JSON.parse(ds.metadataJson)));

  return ds;
}

function fakeGroup() {
  let manager = fakeUser();
  let members = [manager];

  const n = faker.random.number({min:3, max:10});
  for (let i = 0; i < n; i++) {
    members.push(fakeUser());
  }

  let datasets = [];
  let group = {
    id: faker.random.uuid(),
    name: faker.company.companyName(),
    institutionName: faker.company.companyName(),
    manager,
    members,
    datasets: []
  }

  const domain = faker.internet.domainName();

  for (let i = 0; i < members.length; i++) {
    members[i].groups = [group];
    members[i].email = members[i].name.replace(/\./g, '').replace(/ /g, '.')
                                 .toLowerCase() + '@' + domain;
    const nDatasets = faker.random.number({min: 3, max: 10});
    for (let j = 0; j < nDatasets; j++) {
      let d = fakeDataset({submitter: members[i]});
      group.datasets.push(d);
    }
  }

  return group;
}

function fakeProject(users, datasets) {
  const rnd = faker.random.arrayElement;

  let project = {
    id: faker.random.uuid(),
    name: faker.random.word(),
    public: rnd([true, false]),
    members: faker.helpers.shuffle(users).slice(0, faker.random.number({min: 2, max: 20})),
    datasets: faker.helpers.shuffle(datasets).slice(0, faker.random.number({min: 5, max: 10}))
  };

  project.manager = rnd(project.members);
  return project;
}

function main() {
  let annotations = [];
  let groups = [];
  let datasets = [];
  let people = [];
  let projects = [];

  let nGroups = faker.random.number({min: 3, max: 10});
  for (let i = 0; i < nGroups; i++) {
    let group = fakeGroup();
    for (let d of group.datasets) {
      datasets.push(d);
      let n = faker.random.number({min: 1, max: 50});
      for (let i = 0; i < n; i++)
        annotations.push(fakeAnnotation(d));
    }
    people = people.concat(group.members);
    groups.push(group);
  }

  let nProjects = faker.random.number({min: 3, max: 5});
  for (let i = 0; i < nProjects; i++) {
    let project = fakeProject(people, datasets);
    project.members.forEach((member) => {
      const idx = people.indexOf(member);
      people[idx].projects.push(project);
    });
    projects.push(project);
  }


  const objectGraph = {
    groups,
    annotations,
    datasets,
    people,
    projects
  };

  fs.writeFileSync("fake_data.json", JSOG.stringify(objectGraph));
}

main();
