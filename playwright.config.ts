import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const browserRoot=join(homedir(),'.agent-browser','browsers');
const installedBrowser=existsSync(browserRoot)?readdirSync(browserRoot).filter(name=>name.startsWith('chrome-')).map(name=>join(browserRoot,name,'chrome.exe')).find(file=>existsSync(file)):undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [['list'],['html',{open:'never'}]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: {width:1440,height:1000},
    headless: true,
    launchOptions: {
      executablePath: process.env.NBA_CHROME || installedBrowser,
      args: ['--enable-webgl','--ignore-gpu-blocklist'],
    },
    screenshot: 'only-on-failure',
  },
});
