import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.GITHUB_TOKEN;
const owner = "demandio";
const repo = process.argv[2] || "simplycodes-extension";
const pr_number = parseInt(process.argv[3], 10) || 982;

if (!owner || !repo || isNaN(pr_number)) {
  console.error(
    "Usage: ts-node generate-pr-payload.ts [owner] [repo] [pr_number]",
  );
  process.exit(1);
}

async function generatePRPayload() {
  const octokit = new Octokit({ auth: token });

  // Get PR details
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pr_number,
  });

  // Get PR diff
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pr_number,
  });

  // Format as GitHub webhook payload
  const payload = {
    action: "opened",
    pull_request: {
      ...pr,
      files: files, // Add the files with their diffs
    },
    repository: {
      name: repo,
      owner: {
        login: owner,
      },
    },
    number: pr_number,
  };

  const fileName = `scripts/pull-requests/test-pr-payload-${pr_number}.json`;
  fs.writeFileSync(fileName, JSON.stringify(payload, null, 2));
  console.log(`Payload saved to ${fileName}`);
}

generatePRPayload().catch(console.error);
