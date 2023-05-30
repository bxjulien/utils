import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import chalk from 'chalk';
import dotenv from 'dotenv';
import he from 'he';
import puppeteer from 'puppeteer';

dotenv.config();

const { TELEGRAM_TOKEN, TELEGRAM_USER_ID, JSONBIN_ENDPOINT, JSONBIN_API_KEY } =
  process.env;

if (
  !TELEGRAM_TOKEN ||
  !TELEGRAM_USER_ID ||
  !JSONBIN_ENDPOINT ||
  !JSONBIN_API_KEY
)
  throw new Error('Missing environment variables');

const telegramToken = TELEGRAM_TOKEN;
const telegramUserId = TELEGRAM_USER_ID;

const jsonBinEndpoint = `https://api.jsonbin.io/v3/b/${JSONBIN_ENDPOINT}`;
const jsonBinApiKey = JSONBIN_API_KEY;

const keywords = [
  'react',
  'react.js',
  'react-native',
  'node',
  'node.js',
  'nextjs',
  'next.js',
];

const excludeKeywordsFromTitle = [
  'php',
  'symfony',
  'ruby',
  'rust',
  'c#',
  'kotlin',
  'python',
  'senior',
  'lead',
];

const pages = [1];

async function scrapJobsWTTJ() {
  console.log(chalk.green('### START !'));

  const jobLinks = [];

  const browser = await puppeteer.launch({ headless: 'new' });

  for (const page of pages) {
    console.log('Searching jobs on page:', page);

    const newJobs = await extractJobsFromPage(browser, page);

    jobLinks.push(...newJobs);
  }

  const jobNb = jobLinks.length;

  console.log('Found jobs:', jobNb);

  const newJobs = [];

  console.log('Getting jobs from JSONBin');

  const sentJobs = await getSentJobs();

  console.log('Checking jobs for keywords:', keywords);

  const page = await browser.newPage();

  for (const jobLink of jobLinks) {
    const indexIndication = `${jobLinks.indexOf(jobLink) + 1} / ${jobNb}`;

    await page.goto(jobLink);

    await page.waitForSelector('h1');

    const title = await page.evaluate(() => {
      const title = document.querySelector('h1');
      if (title) {
        return title.innerText;
      }
      return '';
    });

    const pageContent = await page.evaluate(() => {
      const relatedJobsDiv = document.querySelector(
        '[data-testid="job-section-related-jobs"]'
      );
      if (relatedJobsDiv) {
        relatedJobsDiv.remove();
      }
      return document.documentElement.innerText;
    });

    const titleIsSafe = !excludeKeywordsFromTitle.some((word) =>
      title.toLowerCase().includes(word)
    );

    const titleHasKeywords = title
      .split(' ')
      .some((word) => keywords.includes(word.toLowerCase()));

    const pageContentHasKeywords = pageContent
      .split(' ')
      .some((word) => keywords.includes(word.toLowerCase()));

    const company = jobLink.split('/')[5];

    if (titleHasKeywords || (titleIsSafe && pageContentHasKeywords)) {
      if (
        sentJobs.some((job) => job.title === title && job.company === company)
      ) {
        console.log(
          chalk.yellow(
            `${indexIndication} - Job already sent: ${title}`
          )
        );
        continue;
      }

      newJobs.push({ title, company, link: jobLink });

      console.log(
        chalk.green(`${indexIndication} - Job found: ${title}`)
      );
    } else {
      console.log(
        chalk.red(
          `${indexIndication} - Job excluded: ${title}${!titleIsSafe ? ' - Title is not safe' : ''
          }${!pageContentHasKeywords ? ' - No keywords found' : ''}`
        )
      );
    }
  }

  await browser.close();

  const bot = new TelegramBot(telegramToken, { polling: false });

  // format date as 'Jeudi 5 mai à 14h30'
  const date = new Date();
  const formattedDate = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: 'numeric',
  });

  const message = newJobs.length
    ? `Found ${newJobs.length} new jobs`
    : 'No new jobs found';

  bot.sendMessage(telegramUserId, `🤖 ${message} | ${formattedDate}`);

  if (!newJobs.length) console.log('No new jobs found');
  else {
    console.log('Sending new jobs to Telegram:', newJobs.length);

    for (const job of newJobs) {
      const formattedMessage = `<a href="${he.encode(job.link)}">${job.title}</a>`;

      bot.sendMessage(telegramUserId, formattedMessage, { parse_mode: 'HTML' });
    }

    console.log('Updating sent jobs at JSONBin');

    await updateSentJobs([...sentJobs, ...newJobs]);
  }

  console.log(chalk.green('### DONE !'));
}

async function getSentJobs() {
  try {
    const response = await axios.get(jsonBinEndpoint, {
      headers: { 'X-Master-Key': jsonBinApiKey },
    });
    return response.data?.record || [];
  } catch (error) {
    console.error('Error fetching sent jobs:', error.response?.data?.message);
    return [];
  }
}

async function updateSentJobs(jobs) {
  try {
    await axios.put(jsonBinEndpoint, jobs, {
      headers: { 'X-Master-Key': jsonBinApiKey },
    });
  } catch (error) {
    console.error('Error updating sent jobs:', error);
  }
}

function getWTTJUrl(pageNb) {
  const url = new URL('https://www.welcometothejungle.com/fr/jobs');

  url.searchParams.set('refinementList[contract_type][]', 'FULL_TIME');
  //url.searchParams.set('refinementList[remote][]', 'no');
  url.searchParams.append('refinementList[remote][]', 'fulltime');
  url.searchParams.append(
    'refinementList[profession_name.fr.Tech][]',
    'Dev Fullstack'
  );
  url.searchParams.append(
    'refinementList[profession_name.fr.Tech][]',
    'Dev Mobile'
  );
  url.searchParams.append(
    'refinementList[profession_name.fr.Tech][]',
    'Dev Frontend'
  );
  url.searchParams.append(
    'refinementList[profession_name.fr.Tech][]',
    'Dev Backend'
  );
  url.searchParams.append(
    'refinementList[organization.nb_employees][]',
    '0-15'
  );
  url.searchParams.append(
    'refinementList[organization.nb_employees][]',
    '15-50'
  );
  url.searchParams.append(
    'refinementList[organization.nb_employees][]',
    '50-250'
  );
  url.searchParams.append('refinementList[experience_level_minimum][]', '0-1');
  url.searchParams.append('refinementList[experience_level_minimum][]', '1-3');
  url.searchParams.set('page', pageNb);

  return url.toString();
}

async function extractJobsFromPage(browser, pageNb) {
  const url = getWTTJUrl(pageNb);
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForSelector('#job-search-results');

  const jobLinks = await page.$$eval(
    '#job-search-results div div div a',
    (links) => links.map((link) => link.href)
  );

  return jobLinks;
}

export default scrapJobsWTTJ;
