import fs from "fs";

interface Preference {
  [key: string]: string[];
}

export function generateRobotsTxt({
  preferences,
  directory,
}: {
  preferences: Preference;
  directory: string;
}): void {
  let data = "";

  for (let userAgent in preferences) {
    data += `user-agent: ${userAgent}\n`;
    preferences[userAgent].forEach((path) => {
      data += `disallow: ${path}\n`;
    });
    data += "\n";
  }

  fs.writeFileSync(directory + "/robots.txt", data);
}
