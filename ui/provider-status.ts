interface ProviderTestStatus {
  ok?: boolean;
  category?: string;
  statusCode?: number;
  code?: string;
  userAction?: string;
}

interface Window {
  sublingoProviderTestStatusMessage(result: ProviderTestStatus): string;
  sublingoCredentialStatusMessage(result: CredentialStatus): string;
  sublingoModelCatalogStatusMessage(result: ModelCatalogStatus): string;
}

interface ModelCatalogStatus {
  ok?: boolean;
  count?: number;
  category?: string;
  statusCode?: number;
}

interface CredentialStatus {
  state?: string;
  code?: string;
  userAction?: string;
}

function providerTestStatusMessage(result: ProviderTestStatus): string {
  if (result.ok) return "Connection test passed. Select this profile for translation.";
  switch (result.userAction) {
    case "CHECK_CREDENTIALS":
      return "Authentication failed. Re-enter the API key and test again.";
    case "CHECK_MODEL":
      return "The service rejected this model. Check the exact model identifier and availability.";
    case "CHECK_QUOTA":
      return "The service reported a quota or billing limit. Check the provider account before retrying.";
    case "RESTART_IINA":
      return "The secure transport helper is unavailable. Restart IINA and test again.";
    case "CHECK_INSTALLATION":
      return "The bundled transport helper could not be found. Re-link or reinstall the SubLingo plugin, then restart IINA.";
    case "CHECK_NETWORK":
      if (typeof result.statusCode === "number")
        return `The service returned HTTP ${result.statusCode}. Check service health or try a different network route.`;
      return result.category === "timeout"
        ? "The service timed out. Check network reachability and service status, then retry."
        : "The service could not be reached. Check the network and service status, then retry.";
    case "CHECK_ENDPOINT":
      return "The endpoint rejected the request. Check the API URL and OpenAI chat-completions support.";
    default:
      return "Connection test failed. Review the endpoint, credentials, model, and service status.";
  }
}

(globalThis as typeof globalThis & Window).sublingoProviderTestStatusMessage =
  providerTestStatusMessage;

function credentialStatusMessage(result: CredentialStatus): string {
  if (result.state === "ready")
    return "Credential saved in SubLingo's private local file (mode 0600).";
  switch (result.code) {
    case "HELPER_UNAVAILABLE":
    case "HELPER_PROTOCOL":
    case "HELPER_START_FAILED":
    case "HELPER_START_TIMEOUT":
    case "PACKAGED_HELPER_NOT_FOUND":
    case "PACKAGED_HELPER_AMBIGUOUS":
      return "Credential was not saved because the secure transport helper is unavailable.";
    case "CREDENTIAL_STORE_UNAVAILABLE":
      return "Credential was not saved because SubLingo's private credential file is unavailable.";
    default:
      return "Credential was not saved. Check the plugin installation and local data-directory permissions.";
  }
}

(globalThis as typeof globalThis & Window).sublingoCredentialStatusMessage =
  credentialStatusMessage;

function modelCatalogStatusMessage(result: ModelCatalogStatus): string {
  if (result.ok)
    return result.count === 0
      ? "No models were returned. Custom model ID remains available."
      : "Model list refreshed.";
  if (result.category === "authentication") return "Model refresh failed. Check the saved API key.";
  if (result.category === "timeout") return "Model refresh timed out. Try again.";
  if (typeof result.statusCode === "number")
    return `Model refresh failed with HTTP ${result.statusCode}. Check the endpoint.`;
  return "Model refresh failed. Check the endpoint and network route.";
}

(globalThis as typeof globalThis & Window).sublingoModelCatalogStatusMessage =
  modelCatalogStatusMessage;
