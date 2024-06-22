import { invoke } from "@tauri-apps/api";
import { addNotification } from "../stores/notificationStore.js";
import { fetchDefaultUserOrError } from "../stores/credentialsStore.js";

export function startMicrosoftAuth() {
  invoke("microsoft_auth")
    .then(async result => {
      console.log("Result", result)
      await fetchDefaultUserOrError();
    }).catch(async e => {
    await fetchDefaultUserOrError();
    //addNotification(e);
  });
}
