
let fs = require('fs-extra');
let fg = require('fast-glob');
let path = require('path');
let util = require('util');
let chalk = require('chalk');
let yargs = require('yargs');
let Diff = require('diff');

let argv = yargs
  .option('verbose', {alias: 'v', type: 'boolean'})
  .option('organizedBy', {choices: ['type', 'change']})
  .option('rawNames', {type: 'boolean'})
  .option('package', {type: 'string'})
  .option('interface', {type: 'string'})
  .option('isCI', {type: 'boolean'})
  .option('base-api-dir', {type: 'string'})
  .option('branch-api-dir', {type: 'string'})
  .argv;

let allChanged = new Set();

// {'useSliderState' => [ 'SliderStateOptions', 'SliderState' ], ... }
let dependantOnLinks = new Map();
let currentlyProcessing = '';
let depth = 0;

compare().catch(err => {
  console.error(err.stack);
  process.exit(1);
});


/**
 * This takes the json files generated by the buildBranchAPI and buildPublishedAPI and
 * reconstructs our interfaces and create a graph of all dependencies between interfaces.
 * From there, we diff the reconstructed interfaces and track all that have changes.
 * We use the graph to communicate what interfaces have changed as a result of a
 * dependency changing.
 * We build up strings of the diffs and make them easy to read in both a github comment
 * as well as the local console.
 */
async function compare() {
  let branchDir = argv['branch-api-dir'] || path.join(__dirname, '..', 'dist', 'branch-api');
  let publishedDir = argv['base-api-dir'] || path.join(__dirname, '..', 'dist', 'base-api');
  if (!(fs.existsSync(branchDir) && fs.existsSync(publishedDir))) {
    console.log(chalk.redBright(`you must have both a branchDir ${branchDir} and baseDir ${publishedDir}`));
    return;
  }

  let branchAPIs = fg.sync(`${branchDir}/**/api.json`);
  let publishedAPIs = fg.sync(`${publishedDir}/**/api.json`);
  let pairs = [];

  // find all matching pairs based on what's been published
  for (let pubApi of publishedAPIs) {
    let pubApiPath = pubApi.split(path.sep);
    let sharedPath = path.join(...pubApiPath.slice(pubApiPath.length - 4));
    let found = false;
    for (let branchApi of branchAPIs) {
      if (branchApi.includes(sharedPath)) {
        found = true;
        pairs.push({pubApi, branchApi});
        break;
      }
    }
    if (!found) {
      pairs.push({pubApi, branchApi: null});
    }
  }

  // don't care about private APIs, but we do care if we're about to publish a new one
  for (let branchApi of branchAPIs) {
    let branchApiPath = branchApi.split(path.sep);
    let sharedPath = path.join(...branchApiPath.slice(branchApiPath.length - 4));
    let found = false;
    for (let pubApi of publishedAPIs) {
      if (pubApi.includes(sharedPath)) {
        found = true;
        break;
      }
    }
    let json = JSON.parse(fs.readFileSync(path.join(branchApi, '..', '..', 'package.json')), 'utf8');
    if (!found && !json.private) {
      pairs.push({pubApi: null, branchApi});
    }
  }

  let allDiffs = {};
  for (let pair of pairs) {
    let {diffs, name} = getDiff(pair);
    if (diffs && diffs.length > 0) {
      allDiffs[name] = diffs;
    }
  }

  for (let [, diffs] of Object.entries(allDiffs)) {
    for (let {result: diff, simplifiedName} of diffs) {
      if (diff.length > 0) {
        if (allChanged.has(simplifiedName)) {
          console.log(simplifiedName, 'already in set');
        } else {
          allChanged.add(simplifiedName);
        }
      }
    }
  }
  let invertedDeps = invertDependencies();
  let messages = [];
  for (let [name, diffs] of Object.entries(allDiffs)) {
    let changes = [];
    for (let {result: diff, simplifiedName} of diffs) {
      let changedByDeps = followDependencies(simplifiedName);
      if (diff.length > 0) {
        let affected = followInvertedDependencies(simplifiedName, invertedDeps);
        // combine export change messages
        changes.push(`
#### ${simplifiedName}
${changedByDeps.length > 0 ? `changed by:
 - ${changedByDeps.join('\n - ')}\n\n` : ''}${diff.length > 0 ? diff : ''}${affected.length > 0 ? `
it changed:
 - ${affected.join('\n - ')}
` : ''}
`);
      }
    }
    if (changes.length > 0) {
      // combine the package change messages
      messages.push(`
### ${name.replace('/dist/api.json', '').replace(/^\//, '')}
${changes.join('\n')}
-----------------------------------
`
      );
    }
  }
  if (messages.length) {
    messages.forEach(message => {
      console.log(message);
    });
  }
}

// takes an interface name and follows all the interfaces dependencies to
// see if the interface changed as a result of a dependency changing
function followDependencies(iname) {
  let visited = new Set();
  let changedDeps = [];
  function visit(iname) {
    if (visited.has(iname)) {
      return;
    }
    visited.add(iname);
    let dependencies = dependantOnLinks.get(iname);
    if (dependencies && dependencies.length > 0) {
      for (let dep of dependencies) {
        if (allChanged.has(dep)) {
          changedDeps.push(dep);
        }
        visit(dep);
      }
    }
  }
  visit(iname);
  return changedDeps;
}

function invertDependencies() {
  let changedUpstream = new Map();
  for (let [key, value] of dependantOnLinks.entries()) {
    for (let name of value) {
      if (changedUpstream.has(name)) {
        changedUpstream.get(name).push(key);
      } else {
        changedUpstream.set(name, [key]);
      }
    }
  }

  return changedUpstream;
}

// takes an interface name and follows all the interfaces dependencies to
// see if the interface changed as a result of a dependency changing
function followInvertedDependencies(iname, deps) {
  let visited = new Set();
  let affectedInterfaces = [];
  function visit(iname) {
    if (visited.has(iname)) {
      return;
    }
    visited.add(iname);
    if (deps.has(iname)) {
      let affected = deps.get(iname);
      if (affected && affected.length > 0) {
        for (let dep of affected) {
          affectedInterfaces.push(dep);
          visit(dep);
        }
      }
    }
  }
  visit(iname);
  return affectedInterfaces;
}

function getAPI(filePath) {
  let json = fs.readJsonSync(filePath);

  return json;
}

// bulk of the logic, read the api files, rebuild the interfaces, diff those reconstructions
function getDiff(pair) {
  let name;
  if (pair.branchApi) {
    name = pair.branchApi.replace(/.*branch-api/, '');
  } else {
    name = pair.pubApi.replace(/.*published-api/, '');
  }

  if (argv.package && !argv.package.includes(name)) {
    return {diff: {}, name};
  }
  if (argv.verbose) {
    console.log(`diffing ${name}`);
  }
  let publishedApi = pair.pubApi === null ? {exports:{}} : getAPI(pair.pubApi);
  let branchApi = pair.branchApi === null ? {exports:{}} : getAPI(pair.branchApi);
  let publishedInterfaces = rebuildInterfaces(publishedApi);
  let branchInterfaces = rebuildInterfaces(branchApi);
  let allExportNames = [...new Set([...Object.keys(publishedApi.exports), ...Object.keys(branchApi.exports)])];
  let allInterfaces = [...new Set([...Object.keys(publishedInterfaces), ...Object.keys(branchInterfaces)])];
  let formattedPublishedInterfaces = '';
  let formattedBranchInterfaces = '';
  formattedPublishedInterfaces = formatInterfaces(publishedInterfaces, allInterfaces);
  formattedBranchInterfaces = formatInterfaces(branchInterfaces, allInterfaces);

  let diffs = [];
  allInterfaces.forEach((iname, index) => {
    if (argv.interface && argv.interface !== iname) {
      return;
    }
    let simplifiedName = allExportNames[index];
    let codeDiff = Diff.structuredPatch(iname, iname, formattedPublishedInterfaces[index], formattedBranchInterfaces[index], {newlineIsToken: true});
    if (argv.verbose) {
      console.log(util.inspect(codeDiff, {depth: null}));
    }
    let result = [];
    let prevEnd = 1; // diff lines are 1 indexed
    let lines = formattedPublishedInterfaces[index].split('\n');
    codeDiff.hunks.forEach(hunk => {
      if (hunk.oldStart > prevEnd) {
        result = [...result, ...lines.slice(prevEnd - 1, hunk.oldStart - 1).map((item, index) => ` ${item}`)];
      }
      if (argv.isCI) {
        result = [...result, ...hunk.lines];
      } else {
        result = [...result, ...hunk.lines.map(line => {
          if (line.startsWith('+')) {
            return chalk.whiteBright.bgGreen(line);
          } else if (line.startsWith('-')) {
            return chalk.whiteBright.bgRed(line);
          }
          return line;
        })];
      }
      prevEnd = hunk.oldStart + hunk.oldLines;
    });
    let joinedResult = '';
    if (codeDiff.hunks.length > 0) {
      joinedResult = [...result, ...lines.slice(prevEnd).map((item, index) => ` ${item}`)].join('\n');
    }
    if (argv.isCI && result.length > 0) {
      joinedResult = `\`\`\`diff
${joinedResult}
\`\`\``;
    }
    diffs.push({iname, result: joinedResult, simplifiedName});
  });

  return {diffs, name};
}

// mirrors dev/docs/src/types.js for the most part
// "rendering" our types to a string instead of React components
function processType(value) {
  if (!value) {
    console.trace('UNTYPED', value);
    return 'UNTYPED';
  }
  if (Object.keys(value).length === 0) {
    return '{}';
  }
  if (value.type === 'any') {
    return 'any';
  }
  if (value.type === 'null') {
    return 'null';
  }
  if (value.type === 'undefined') {
    return 'undefined';
  }
  if (value.type === 'void') {
    return 'void';
  }
  if (value.type === 'unknown') {
    return 'unknown';
  }
  if (value.type === 'never') {
    return 'never';
  }
  if (value.type === 'this') {
    return 'this';
  }
  if (value.type === 'symbol') {
    return 'symbol';
  }
  if (value.type === 'identifier') {
    return value.name;
  }
  if (value.type === 'string') {
    if (value.value) {
      return `'${value.value}'`;
    }
    return 'string';
  }
  if (value.type === 'number') {
    return 'number';
  }
  if (value.type === 'boolean') {
    return 'boolean';
  }
  if (value.type === 'union') {
    return value.elements.map(processType).join(' | ');
  }
  if (value.type === 'intersection') {
    return `(${value.types.map(processType).join(' & ')})`;
  }
  if (value.type === 'application') {
    let name = value.base.name;
    if (!name) {
      name = processType(value.base);
    }
    return `${name}<${value.typeParameters.map(processType).join(', ')}>`;
  }
  if (value.type === 'typeOperator') {
    return `${value.operator} ${processType(value.value)}`;
  }
  if (value.type === 'function') {
    return `(${value.parameters.map(processType).join(', ')}) => ${value.return ? processType(value.return) : 'void'}`;
  }
  if (value.type === 'parameter') {
    return processType(value.value);
  }
  if (value.type === 'link' && value.id) {
    let name = value.id.substr(value.id.lastIndexOf(':') + 1);
    if (dependantOnLinks.has(currentlyProcessing)) {
      let foo = dependantOnLinks.get(currentlyProcessing);
      if (!foo.includes(name)) {
        foo.push(name);
      }
    } else {
      dependantOnLinks.set(currentlyProcessing, [name]);
    }
    return name;
  }
  // interface still needed if we have it at top level?
  if (value.type === 'object') {
    if (value.properties) {
      return `${value.exact ? '{\\' : '{'}
  ${Object.values(value.properties).map(property => {
    depth += 2;
    let result = ' '.repeat(depth);
    result = `${result}${property.indexType ? '[' : ''}${property.name}${property.indexType ? `: ${processType(property.indexType)}]` : ''}${property.optional ? '?' : ''}: ${processType(property.value)}`;
    depth -= 2;
    return result;
  }).join('\n')}
${value.exact ? '\\}' : '}'}`;
    }
    return '{}';
  }
  if (value.type === 'alias') {
    return processType(value.value);
  }
  if (value.type === 'array') {
    return `Array<${processType(value.elementType)}>`;
  }
  if (value.type === 'tuple') {
    return `[${value.elements.map(processType).join(', ')}]`;
  }
  if (value.type === 'typeParameter') {
    let typeParam = value.name;
    if (value.constraint) {
      typeParam = typeParam + ` extends ${processType(value.constraint)}`;
    }
    if (value.default) {
      typeParam = typeParam + ` = ${processType(value.default)}`;
    }
    return typeParam;
  }
  if (value.type === 'component') {
    let props = value.props;
    if (props.type === 'application') {
      props = props.base;
    }
    if (props.type === 'link') {
      // create links provider
      // props = links[props.id];
    }
    return processType(props);
  }
  if (value.type === 'conditional') {
    return `${processType(value.checkType)} extends ${processType(value.extendsType)} ? ${processType(value.trueType)}${value.falseType.type === 'conditional' ? ' :\n' : ' : '}${processType(value.falseType)}`;
  }
  if (value.type === 'indexedAccess') {
    return `${processType(value.objectType)}[${processType(value.indexType)}]`;
  }
  if (value.type === 'keyof') {
    return `keyof ${processType(value.keyof)}`;
  }
  console.log('unknown type', value);
}

function rebuildInterfaces(json) {
  let exports = {};
  if (!json.exports) {
    return exports;
  }
  Object.keys(json.exports).forEach((key) => {
    currentlyProcessing = key;
    if (key === 'links') {
      console.log('skipping links');
      return;
    }
    let item = json.exports[key];
    if (item?.type == null) {
      // todo what to do here??
      return;
    }
    if (item.props?.type === 'identifier') {
      // todo what to do here??
      return;
    }
    if (item.type === 'component') {
      let compInterface = {};
      if (item.props && item.props.properties) {
        Object.entries(item.props.properties).sort((([keyA], [keyB]) => keyA > keyB ? 1 : -1)).forEach(([, prop]) => {
          if (prop.access === 'private') {
            return;
          }
          let name = prop.name;
          if (item.name === null) {
            name = key;
          }
          let optional = prop.optional;
          let defaultVal = prop.default;
          let value = processType(prop.value);
          compInterface[name] = {optional, defaultVal, value};
        });
      } else if (item.props && item.props.type === 'link') {
        let prop = item.props;
        let name = item.name;
        if (item.name === null) {
          name = key;
        }
        let optional = prop.optional;
        let defaultVal = prop.default;
        let value = processType(prop);
        compInterface[name] = {optional, defaultVal, value};
      }
      let name = item.name ?? key;
      if (item.typeParameters.length > 0) {
        name = name + `<${item.typeParameters.map(processType).sort().join(', ')}>`;
      }
      exports[name] = compInterface;
    } else if (item.type === 'function') {
      let funcInterface = {};
      Object.entries(item.parameters).sort((([keyA], [keyB]) => keyA > keyB ? 1 : -1)).forEach(([, param]) => {
        if (param.access === 'private') {
          return;
        }
        let name = param.name;
        let optional = param.optional;
        let defaultVal = param.default;
        let value = processType(param.value);
        funcInterface[name] = {optional, defaultVal, value};
      });
      let returnVal = processType(item.return);
      let name = item.name ?? key;
      if (item.typeParameters.length > 0) {
        name = name + `<${item.typeParameters.map(processType).sort().join(', ')}>`;
      }
      exports[name] = {...funcInterface, returnVal};
    } else if (item.type === 'interface') {
      let funcInterface = {};
      Object.entries(item.properties).sort((([keyA], [keyB]) => keyA > keyB ? 1 : -1)).forEach(([, property]) => {
        if (property.access === 'private' || property.access === 'protected') {
          return;
        }
        let name = property.name;
        let optional = property.optional;
        let defaultVal = property.default;
        let value = processType(property.value);
        // TODO: what to do with defaultVal and optional
        funcInterface[name] = {optional, defaultVal, value};
      });
      let name = item.name ?? key;
      if (item.typeParameters.length > 0) {
        name = name + `<${item.typeParameters.map(processType).sort().join(', ')}>`;
      }
      exports[name] = funcInterface;
    } else if (item.type === 'link') {
      let links = json.links;
      if (links[item.id]) {
        let link = links[item.id];

        let name = link.name;
        let optional = link.optional;
        let defaultVal = link.default;
        let value = processType(link.value);
        let isType = true;
        exports[name] = {isType, optional, defaultVal, value};
      }
    } else {
      console.log('unknown top level export', item);
    }
  });
  return exports;
}

function formatProp([name, prop]) {
  return `  ${name}${prop.optional ? '?' : ''}: ${prop.value}${prop.defaultVal != null ? ` = ${prop.defaultVal}` : ''}`;
}

function formatInterfaces(interfaces, allInterfaces) {
  return allInterfaces.map(name => {
    if (interfaces[name]) {
      let output = `${name} {\n`;
      output += interfaces[name].isType ? formatProp(name, interfaces[name]) : Object.entries(interfaces[name]).map(formatProp).join('\n');
      return `${output}\n}\n`;
    } else {
      return '\n';
    }
  });
}