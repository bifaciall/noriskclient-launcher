import { invoke } from "@tauri-apps/api";
import { addNotification } from "../stores/notificationStore.js";
import { get, writable } from "svelte/store";
import { launcherOptions, saveOptions } from "../stores/optionsStore.js";
import { pop, push } from "svelte-spa-router";
import { defaultUser, fetchDefaultUserOrError } from "../stores/credentialsStore.js";
import { profiles } from "../stores/profilesStore.js";

export const isClientRunning = writable(false);
export const isCheckingForUpdates = writable(true);
export const startProgress = writable({
  progressBarMax: 0,
  progressBarProgress: 0,
  progressBarLabel: "",
});
export const featureWhitelist = writable([]);
export const customServerProgress = writable({});
export const forceServer = writable("");

export async function runClient(branch, checkedForNewBranch = false) {
  if (get(isClientRunning)) {
    addNotification("Client is already running");
    return;
  }

  if (!checkedForNewBranch) {
    let showNewBranchScreen;

    await invoke("check_for_new_branch", { branch: branch }).then(result => {
      console.log("Checked for new branch: ", result);
      showNewBranchScreen = result;
    }).catch(reason => {
      showNewBranchScreen = "ERROR";
      addNotification(reason);
    });

    if (showNewBranchScreen === "ERROR") {
      return;
    } else if (showNewBranchScreen == null) {
      await push("/first-install");
      return;
    } else if (showNewBranchScreen) {
      await push("/new-branch");
      return;
    }
  }


  noriskLog("Client started");

  let options = get(launcherOptions);
  let launcherProfiles = get(profiles);
  let installedMods = [];

  if (options.experimentalMode) {
    options.latestDevBranch = branch;
  } else {
    options.latestBranch = branch;
  }

  await saveOptions();

  await push("/start-progress");

  let launcherProfile;
  if (options.experimentalMode) {
    const activeProfileId = launcherProfiles.selectedExperimentalProfiles[branch];
    launcherProfile = launcherProfiles.experimentalProfiles.find(p => p.id === activeProfileId);
  } else {
    const activeProfileId = launcherProfiles.selectedMainProfiles[branch];
    launcherProfile = launcherProfiles.mainProfiles.find(p => p.id === activeProfileId);
  }

  launcherProfile?.mods?.forEach(mod => {
    noriskLog(`Pushing Mod: ${JSON.stringify(mod.value)}`);
    installedMods.push(mod.value);
    mod.dependencies.forEach((dependency) => {
      noriskLog(`Pushing Dependency: ${JSON.stringify(dependency.value)}`);
      installedMods.push(dependency.value);
    });
  });

  await invoke("run_client", {
    branch: branch,
    options: options,
    forceServer: get(forceServer).length > 0 ? get(forceServer) : null,
    mods: installedMods,
    shaders: get(profiles)?.addons[branch]?.shaders ?? [],
    resourcepacks: get(profiles)?.addons[branch]?.resourcePacks ?? [],
    datapacks: get(profiles)?.addons[branch]?.datapacks ?? [],
  }).then(() => {
    isClientRunning.set(true);
    if (get(forceServer).length > 0) {
      forceServer.set(get(forceServer) + ":RUNNING");
    }
  }).catch(reason => {
    isClientRunning.set(false);
    console.error("Error: ", reason);
    forceServer.set("");
    pop();
    addNotification(reason);
  });

  // NoRisk Token Changed So Update
  await fetchDefaultUserOrError(false)
}

export async function stopClient() {
  push("/");
  await invoke("terminate").catch(reason => {
    addNotification(reason);
  });
}

export async function openMinecraftLogsWindow() {
  await invoke("open_minecraft_logs_window").catch(reason => {
    addNotification(reason);
  });
}

export function getNoRiskToken() {
  let options = get(launcherOptions);
  let user = get(defaultUser);
  return options.experimentalMode ? user.norisk_credentials.experimental.value : user.norisk_credentials.production.value;
}

export function noriskLog(message) {
  invoke("console_log_info", { message }).catch(e => console.error(e));
}

export function noriskError(message) {
  console.error(`Norisk Error: ${message}`);
  invoke("console_log_error", { message }).catch(e => console.error(e));
}

export async function setForceServer(server) {
  forceServer.set(server);
}

export async function setCustomServerProgress(serverId, progress) {
  let currentProgress = get(customServerProgress);
  currentProgress[serverId] = progress;
  customServerProgress.set(currentProgress);
}

export async function fetchFeature(feature) {
  let options = get(launcherOptions);
  let user = get(defaultUser);

  feature = feature.toUpperCase().replaceAll(" ", "_");

  await invoke("check_feature_whitelist", {
    feature: feature,
    noriskToken: options.experimentalMode ? user.norisk_credentials.experimental.value : user.norisk_credentials.production.value,
    uuid: user.id
  }).then(result => {
    let currentFeatures = get(featureWhitelist);
    if (currentFeatures.includes(feature)) { return; }
    featureWhitelist.set([...currentFeatures, feature]);
  })
}

export async function getFeatureWhitelist() {
  featureWhitelist.set([]);
  await fetchFeature("INVITE_FRIENDS");
  await fetchFeature("CUSTOM_SERVERS");
  await fetchFeature("MCREAL_APP");
  console.log("Feature Whitelist: " + get(featureWhitelist).join(", "));
}