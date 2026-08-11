interface ProviderTestStatus {
  ok?: boolean;
  category?: string;
  userAction?: string;
}

interface Window {
  sublingoProviderTestStatusMessage(result: ProviderTestStatus): string;
}

function providerTestStatusMessage(result: ProviderTestStatus): string {
  if (result.ok) return "Connection test passed. Select this profile to authorize translation.";
  switch (result.userAction) {
    case "CHECK_CREDENTIALS":
      return "Authentication failed. Re-enter the API key and test again.";
    case "CHECK_MODEL":
      return "The service rejected this model. Check the exact model identifier and availability.";
    case "CHECK_QUOTA":
      return "The service reported a quota or billing limit. Check the provider account before retrying.";
    case "RESTART_IINA":
      return "The secure transport helper is unavailable. Restart IINA and test again.";
    case "CHECK_NETWORK":
      return result.category === "timeout"
        ? "The service timed out. Check network reachability and service status, then retry."
        : "The service could not be reached. Check the network and service status, then retry.";
    case "CHECK_ENDPOINT":
      return "The endpoint rejected the request. Check the API URL and OpenAI-compatible chat-completions support.";
    default:
      return "Connection test failed. Review the endpoint, credentials, model, and service status.";
  }
}

(globalThis as typeof globalThis & Window).sublingoProviderTestStatusMessage =
  providerTestStatusMessage;
