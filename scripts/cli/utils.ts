import * as readline from 'readline';

let rl: readline.Interface | null = null;

export function getReadlineInterface(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

export function closeReadlineInterface(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

export function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    getReadlineInterface().question(question, resolve);
  });
}
