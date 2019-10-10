const fs = require('fs');
const chalk = require('chalk');
const pkgDir = require('pkg-dir');
const globby = require('globby');
const j = require('jscodeshift').withParser('ts');
const debug = require('debug')('tagless-ember-components-codemod');

async function run() {
  let path = await pkgDir();
  await runForPath(path);
}

async function runForPath(path, options = {}) {
  debug('runForPath(%o, %o)', path, options);

  let log = options.log || console.log;

  // TODO check for ember-component-css dependency

  log(` 🔍  Searching for component files...`);
  let componentPaths = await globby('app/components/*.js', { cwd: path });
  debug('componentPaths = %O', componentPaths);

  for (let componentPath of componentPaths) {
    let dimPath = chalk.dim(componentPath);

    let source = fs.readFileSync(componentPath, 'utf8');

    let root = j(source);

    // find `export default Component.extend({ ... });` AST node
    let exportDefaultDeclarations = root.find(j.ExportDefaultDeclaration, {
      declaration: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { name: 'Component' },
          property: { name: 'extend' },
        },
      },
    });

    if (exportDefaultDeclarations.length !== 1) {
      console.log(
        chalk.yellow(`${dimPath}: Could not find \`export default Component.extend({ ... });\``)
      );
      continue;
    }

    let exportDefaultDeclaration = exportDefaultDeclarations.get();

    // find first `{ ... }` inside `Component.extend()` arguments
    let extendObjectArgs = exportDefaultDeclaration
      .get('declaration', 'arguments')
      .filter(path => path.value.type === 'ObjectExpression');

    let objectArg = extendObjectArgs[0];
    if (!objectArg) {
      console.log(
        chalk.yellow(
          `${dimPath}: Could not find object argument in \`export default Component.extend({ ... });\``
        )
      );
      continue;
    }

    // find `tagName` property if it exists
    let properties = objectArg.get('properties');

    let tagName = 'div';

    let tagNameProperty = properties.filter(
      ({ value: node }) =>
        node.type === 'ObjectProperty' &&
        node.key.type === 'Identifier' &&
        node.key.name === 'tagName'
    )[0];
    if (tagNameProperty) {
      let tagNamePath = tagNameProperty.get('value');
      if (tagNamePath.value.type !== 'StringLiteral') {
        console.log(
          chalk.yellow(`${dimPath}: Unexpected \`tagName\` value: ${j(tagNamePath).toSource()}`)
        );
        continue;
      }

      tagName = tagNamePath.value.value;
    }

    // skip tagless components (silent)
    if (tagName === '') {
      debug(`${componentPath}: tagName detected: %o -> skip`, tagName);
      continue;
    }

    debug(`${componentPath}: tagName detected: %o`, tagName);

    // TODO skip components that use `this.element` (warn)
    // TODO skip components that use `click()` etc. (warn)

    // TODO analyze `tagName`, `attributeBindings`, `classNames`, ...
    // TODO skip on error (warn incl. please report)

    // TODO find corresponding template files
    // TODO skip if not found (warn)

    // TODO set `tagName: ''` and remove `attributeBindings`, `classNames`, ...
    // TODO wrap existing template with root element
  }

  debug('runForPath() finished');
}

module.exports = { run };