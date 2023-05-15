import inquirer from 'inquirer';
import scrapJobsWTTJ from './jobsWTTJ.js';

const questions = [
  {
    type: 'list',
    name: 'functions',
    message: 'Which function do you want to execute?',
    choices: ['WTTJ Jobs Scraper'],
  },
];

inquirer.prompt(questions).then((answers) => {
  switch (answers.functions) {
    case questions[0].choices[0]:
      scrapJobsWTTJ();
      break;
    default:
      console.log('Invalid selection');
  }
});
