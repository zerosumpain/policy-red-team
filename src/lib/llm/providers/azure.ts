import OpenAI from 'openai';
import type { ProviderDefinition } from './types';

/**
 * AZURE AI FOUNDRY — a model you have already provisioned.
 *
 * A Foundry deployment is not a model id, it is an endpoint plus a name you gave
 * it, and the distinction matters here: the deployment name is what goes in the
 * `model` field of every request, so what an assessment records as the model it
 * used is that name and not the family underneath. A reader looking at
 * `policy_model_calls` six months later should still be able to tell which
 * deployment answered, which is why the panel asks for it rather than deriving
 * a prettier label.
 *
 * WHY THE SDK IS CONFIGURED THIS WAY. Azure puts the deployment in the PATH and
 * the version in a QUERY parameter, and authenticates with an `api-key` header
 * rather than a bearer token. The `openai` package supports all three through
 * `baseURL`, `defaultQuery` and `defaultHeaders`, so no second SDK is needed —
 * and `apiKey` is still set because the constructor requires it even when the
 * header is what actually authenticates.
 *
 * Provisioned throughput and standard deployments speak the same API; the
 * difference is billing, not shape. Nothing here needs to know which you have.
 */
export const azure: ProviderDefinition = {
  id: 'azure',
  label: 'Azure AI Foundry',
  blurb:
    'A model you have already provisioned in Azure — including provisioned throughput. Calls go to your own deployment and bill to your Azure subscription, which is usually the reason for choosing it over per-token access.',
  fields: [
    {
      name: 'endpoint',
      label: 'Endpoint',
      hint: 'The resource endpoint from the Azure portal, without a path.',
      placeholder: 'https://my-resource.openai.azure.com',
    },
    {
      name: 'deployment',
      label: 'Deployment name',
      hint: 'What you called the deployment, not the model family. This is what every request asks for, and what the assessment records as the model it used.',
      placeholder: 'gpt-5-policy',
    },
    {
      name: 'apiKey',
      label: 'API key',
      hint: 'Either key from the resource. Keys and Endpoint in the portal.',
      secret: true,
    },
    {
      name: 'apiVersion',
      label: 'API version',
      hint: 'Leave blank unless your deployment needs a particular one.',
      placeholder: DEFAULT_API_VERSION(),
      optional: true,
    },
  ],
  problem: (config) => {
    const endpoint = config.endpoint?.trim();
    if (!endpoint) return 'Put the resource endpoint in.';
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:') return 'An Azure endpoint is https.';
    } catch {
      return 'That is not an endpoint this can reach.';
    }
    if (!config.deployment?.trim()) return 'Say which deployment to call.';
    if (!config.apiKey?.trim()) return 'Put one of the resource keys in.';
    return null;
  },
  model: (config) => config.deployment.trim(),
  client: (config) => {
    const endpoint = config.endpoint.trim().replace(/\/+$/, '');
    const deployment = config.deployment.trim();
    const key = config.apiKey.trim();
    return new OpenAI({
      baseURL: `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}`,
      defaultQuery: { 'api-version': config.apiVersion?.trim() || DEFAULT_API_VERSION() },
      defaultHeaders: { 'api-key': key },
      // Required by the constructor; the header above is what authenticates.
      apiKey: key,
    });
  },
  models: (config) =>
    config.deployment?.trim()
      ? [
          {
            id: config.deployment.trim(),
            name: config.deployment.trim(),
            note: 'Your Azure deployment. Whatever model is behind it is what answers.',
          },
        ]
      : [],
};

/**
 * A version that exists rather than the newest that does.
 *
 * Azure retires preview versions, and a default that names one turns into a
 * service that stopped working on a date nobody wrote down. This is a stable GA
 * version, and the field is editable for anyone whose deployment wants another.
 */
function DEFAULT_API_VERSION(): string {
  return '2024-10-21';
}
