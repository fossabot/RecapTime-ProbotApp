const getConfig = require("probot-config");
const mongoose = require("mongoose");
const commands = require("probot-commands");
const createScheduler = require("probot-scheduler");
const RT_Stale = require("./lib/stale");

// The first code was derivied from probot-stale plugin
module.exports = async app => {
  // Visit all repositories to mark and sweep stale issues
  const scheduler = createScheduler(app);

  // Unmark stale issues if a user comments
  const events = [
    "issue_comment",
    "issues",
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment"
  ];

  app.on(events, unmark);
  app.on("schedule.repository", markAndSweep);

  async function unmark(context) {
    if (!context.isBot) {
      const recaptime_plugins_stale = await forRepository(context);
      let issue = context.payload.issue || context.payload.pull_request;
      const type = context.payload.issue ? "issues" : "pulls";

      // Some payloads don't include labels
      if (!issue.labels) {
        try {
          issue = (await context.github.issues.get(context.issue())).data;
        } catch (error) {
          context.log("Issue not found");
        }
      }

      const staleLabelAdded =
        context.payload.action === "labeled" &&
        context.payload.label.name ===
          recaptime_plugins_stale.config.staleLabel;

      if (
        recaptime_plugins_stale.hasStaleLabel(type, issue) &&
        issue.state !== "closed" &&
        !staleLabelAdded
      ) {
        recaptime_plugins_stale.unmarkIssue(type, issue);
      }
    }
  }

  async function markAndSweep(context) {
    const stale = await forRepository(context);
    await stale.markAndSweep("pulls");
    await stale.markAndSweep("issues");
  }

  async function forRepository(context) {
    let config = await getConfig(context, "recaptime_config.yml");

    if (!config) {
      scheduler.stop(context.payload.repository);
      // Don't actually perform for repository without a config
      config = { perform: false };
      print("Something fishy on some repositories: No configuration files.");
    }

    config = Object.assign(config, context.repo({ logger: app.log }));

    return new RT_Stale(context.github, config);
  }
};

module.exports = robot => {
  // Type `/label foo, bar` in a comment box for an Issue or Pull Request
  commands(robot, "addlabel", (context, command) => {
    const labels = command.arguments.split(/, */);
    return context.github.issues.addLabels(context.issue({ labels }));
  });
  commands(robot, "rmlabel", (context, command) => {
    const labels = command.arguments.split(/, */);
    const confirmation_rmlabel = context.issue({
      body:
        "Successfully removed the specified labels in the `label` parameter. Refresh the page to" +
        "see latest content. If the problem occurs, please [contact Support](https://forums.devhubcentral.ml)"
    });
    return context.github.issues.removeLabels(context.issue({ labels }));
    return context.github.issues.createComment(confirmation_rmlabel);
  });
  commands(robot, "help", (context, command) => {
    const botcommands_help = context.issue({
      body:
        "## Bot Commands Help\n" + "To see the full list of the commands, see"
    });
    return context.github.issues.createComment(botcommands_help);
  });
};
