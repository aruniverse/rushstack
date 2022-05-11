import inquirer from 'inquirer';
import type * as inquirerTypes from 'inquirer';
import { AnsiEscape } from '@rushstack/node-core-library';

import _ from 'lodash';
import colors from 'colors/safe';
import table from 'text-table';
import Separator from 'inquirer/lib/objects/separator';

export interface IUIGroup {
  title: string;
  bgColor?: string;
  filter: {
    mismatch?: boolean;
    bump?: undefined | 'major' | 'minor' | 'patch' | 'nonSemver';
    notInstalled?: boolean;
  };
}

export interface IUpgradeInteractiveDepChoice {
  value: NpmCheck.INpmCheckPackage;
  name: string | string[];
  short: string;
}

type ChoiceTable = (Separator | IUpgradeInteractiveDepChoice | boolean | undefined)[] | undefined;

function greenUnderlineBold(text: string): string {
  return colors.underline(colors.bold(colors.green(text)));
}

function yellowUnderlineBold(text: string): string {
  return colors.underline(colors.bold(colors.yellow(text)));
}

function redUnderlineBold(text: string): string {
  return colors.underline(colors.bold(colors.red(text)));
}

function magentaUnderlineBold(text: string): string {
  return colors.underline(colors.bold(colors.magenta(text)));
}

export const UI_GROUPS: IUIGroup[] = [
  {
    title: greenUnderlineBold('Update package.json to match version installed.'),
    filter: { mismatch: true, bump: undefined }
  },
  {
    title: `${greenUnderlineBold('Missing.')} ${colors.green('You probably want these.')}`,
    filter: { notInstalled: true, bump: undefined }
  },
  {
    title: `${greenUnderlineBold('Patch Update')} ${colors.green('Backwards-compatible bug fixes.')}`,
    filter: { bump: 'patch' }
  },
  {
    title: `${yellowUnderlineBold('Minor Update')} ${colors.yellow('New backwards-compatible features.')}`,
    bgColor: 'yellow',
    filter: { bump: 'minor' }
  },
  {
    title: `${redUnderlineBold('Major Update')} ${colors.red(
      'Potentially breaking API changes. Use caution.'
    )}`,
    filter: { bump: 'major' }
  },
  {
    title: `${magentaUnderlineBold('Non-Semver')} ${colors.magenta('Versions less than 1.0.0, caution.')}`,
    filter: { bump: 'nonSemver' }
  }
];

function label(dep: NpmCheck.INpmCheckPackage): string[] {
  const bumpInstalled: string = dep.bump ? dep.installed : '';
  const installed: string = dep.mismatch ? dep.packageJson : bumpInstalled;
  const name: string = colors.yellow(dep.moduleName);
  const type: string = dep.devDependency ? colors.green(' devDep') : '';
  const missing: string = dep.notInstalled ? colors.red(' missing') : '';
  const homepage: string = dep.homepage ? colors.blue(colors.underline(dep.homepage)) : '';

  return [
    name + type + missing,
    installed,
    installed && '>',
    colors.bold(dep.latest || ''),
    dep.latest ? homepage : dep.regError || dep.pkgError
  ];
}

function short(dep: NpmCheck.INpmCheckPackage): string {
  return `${dep.moduleName}@${dep.latest}`;
}

function choice(dep: NpmCheck.INpmCheckPackage): IUpgradeInteractiveDepChoice | boolean | Separator {
  if (!dep.mismatch && !dep.bump && !dep.notInstalled) {
    return false;
  }

  return {
    value: dep,
    name: label(dep),
    short: short(dep)
  };
}

function unselectable(options?: { title: string }): Separator {
  return new inquirer.Separator(colors.reset(options ? options.title : ''));
}

function createChoices(packages: NpmCheck.INpmCheckPackage[], options: IUIGroup): ChoiceTable {
  const filteredChoices: NpmCheck.INpmCheckPackage[] = _.filter(
    packages,
    options.filter
  ) as NpmCheck.INpmCheckPackage[];

  const choices: (IUpgradeInteractiveDepChoice | Separator | boolean)[] = filteredChoices
    .map(choice)
    .filter(Boolean);

  const choicesAsATable: string[] = table(_.map(choices, 'name'), {
    align: ['l', 'l', 'l'],
    stringLength: function (str: string) {
      return AnsiEscape.removeCodes(str).length;
    }
  }).split('\n');

  const choicesWithTableFormatting: boolean[] = _.map(choices, (choice: IUpgradeInteractiveDepChoice, i) => {
    choice.name = choicesAsATable[i];
    return choice;
  });

  if (choicesWithTableFormatting.length) {
    choices.unshift(unselectable(options));
    choices.unshift(unselectable());
    return choices;
  }
}

export const upgradeInteractive = async (
  packages: NpmCheck.INpmCheckPackage[]
): Promise<inquirerTypes.Answers | void> => {
  const choicesGrouped: ChoiceTable[] = UI_GROUPS.map((group) => createChoices(packages, group)).filter(
    Boolean
  );

  const choices: ChoiceTable = _.flatten(choicesGrouped);

  if (!choices.length) {
    console.log('All dependencies are up to date!');
    return;
  }

  choices.push(unselectable());
  choices.push(unselectable({ title: 'Space to select. Enter to start upgrading. Control-C to cancel.' }));

  const promptQuestions: inquirer.QuestionCollection = [
    {
      name: 'packages',
      message: 'Choose which packages to upgrade',
      type: 'checkbox',
      choices: choices.concat(unselectable()),
      pageSize: process.stdout.rows - 2
    }
  ];

  return inquirer.prompt(promptQuestions);
};
