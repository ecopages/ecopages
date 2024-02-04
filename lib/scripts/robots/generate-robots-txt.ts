import fs from "fs";

export interface RobotsPreference {
  /**
   * The user agent
   * If an empty array is provided, it will enable all paths for the user agent
   * If a path is provided, it will disallow the path for the user agent
   */
  [key: string]: string[];
}

export function generateRobotsTxt({
  preferences,
  directory,
}: {
  preferences: RobotsPreference;
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

  try {
    fs.writeFileSync(directory + "/robots.txt", data);
  } catch (err) {
    console.error("Failed to write robots.txt file: ", err);
  }
}
