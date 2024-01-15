import { exec } from "node:child_process";

export function executeScript(script: string) {
  exec(script, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }

    if (stdout) {
      console.log(`stdout: ${stdout}`);
    }

    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }
  });
}
