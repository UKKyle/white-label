import type { RuntimeEnv } from './runtimeEnv';

const SUMUP_CHECKOUTS_URL = 'https://api.sumup.com/v0.1/checkouts';

export type CreateHostedCheckoutInput = {
  amount: number;
  checkoutReference: string;
  description: string;
  redirectUrl: string;
  returnUrl?: string;
};

export type HostedCheckoutResult = {
  id: string;
  status: string;
  checkoutReference: string;
  hostedCheckoutUrl: string;
};

export type RetrievedCheckoutResult = {
  id: string;
  status: string;
  checkoutReference: string;
  amount: number;
  currency: string;
  date: string;
  validUntil?: string;
  transactionId?: string;
  transactionCode?: string;
  transactionDate?: string;
};

type SumUpCheckoutResponse = {
  id?: unknown;
  status?: unknown;
  checkout_reference?: unknown;
  hosted_checkout_url?: unknown;
  amount?: unknown;
  currency?: unknown;
  date?: unknown;
  valid_until?: unknown;
  transactions?: unknown;
  message?: unknown;
  error_code?: unknown;
  [key: string]: unknown;
};

type SumUpTransaction = {
  id?: unknown;
  transaction_code?: unknown;
  timestamp?: unknown;
  date?: unknown;
};

export class SumUpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SumUpConfigError';
  }
}

export class SumUpApiError extends Error {
  status: number;
  responseBody: unknown;

  constructor(message: string, status: number, responseBody: unknown) {
    super(message);
    this.name = 'SumUpApiError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

function getRequiredEnvValue(env: RuntimeEnv, key: keyof RuntimeEnv) {
  const value = env[key];

  if (typeof value !== 'string' || !value.trim()) {
    throw new SumUpConfigError(`Missing required environment variable: ${String(key)}`);
  }

  return value.trim();
}

function validateAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Checkout amount must be greater than zero.');
  }

  return Math.round(amount * 100) / 100;
}

function parseResponse(text: string): unknown {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readResponse(response: Response) {
  return parseResponse(await response.text()) as SumUpCheckoutResponse;
}

function getStringField(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SumUpApiError(`SumUp response did not include a valid ${fieldName}.`, 502, value);
  }

  return value.trim();
}

function getOptionalStringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumberField(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SumUpApiError(`SumUp response did not include a valid ${fieldName}.`, 502, value);
  }

  return value;
}

export async function createHostedSumUpCheckout(env: RuntimeEnv, input: CreateHostedCheckoutInput): Promise<HostedCheckoutResult> {
  const apiKey = getRequiredEnvValue(env, 'SUMUP_API_KEY');
  const merchantCode = getRequiredEnvValue(env, 'SUMUP_MERCHANT_CODE');
  const amount = validateAmount(input.amount);
  const checkoutReference = input.checkoutReference.trim();
  const description = input.description.trim();

  if (!checkoutReference) {
    throw new Error('Checkout reference is required.');
  }

  if (!description) {
    throw new Error('Checkout description is required.');
  }

  const response = await fetch(SUMUP_CHECKOUTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      amount,
      checkout_reference: checkoutReference,
      currency: 'GBP',
      description,
      merchant_code: merchantCode,
      redirect_url: input.redirectUrl,
      return_url: input.returnUrl,
      hosted_checkout: {
        enabled: true
      }
    })
  });

  const responseBody = await readResponse(response);

  if (!response.ok) {
    throw new SumUpApiError(`SumUp checkout creation failed with status ${response.status}.`, response.status, responseBody);
  }

  return {
    id: getStringField(responseBody.id, 'id'),
    status: getStringField(responseBody.status, 'status'),
    checkoutReference: getStringField(responseBody.checkout_reference, 'checkout_reference'),
    hostedCheckoutUrl: getStringField(responseBody.hosted_checkout_url, 'hosted_checkout_url')
  };
}

export async function retrieveSumUpCheckout(env: RuntimeEnv, checkoutId: string): Promise<RetrievedCheckoutResult> {
  const apiKey = getRequiredEnvValue(env, 'SUMUP_API_KEY');
  const response = await fetch(`${SUMUP_CHECKOUTS_URL}/${encodeURIComponent(checkoutId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  const responseBody = await readResponse(response);

  if (!response.ok) {
    throw new SumUpApiError(`SumUp checkout retrieval failed with status ${response.status}.`, response.status, responseBody);
  }

  const transactions = Array.isArray(responseBody.transactions)
    ? responseBody.transactions as SumUpTransaction[]
    : [];
  const latestTransaction = transactions.at(-1);

  return {
    id: getStringField(responseBody.id, 'id'),
    status: getStringField(responseBody.status, 'status'),
    checkoutReference: getStringField(responseBody.checkout_reference, 'checkout_reference'),
    amount: getNumberField(responseBody.amount, 'amount'),
    currency: getStringField(responseBody.currency, 'currency'),
    date: getStringField(responseBody.date, 'date'),
    validUntil: getOptionalStringField(responseBody.valid_until),
    transactionId: getOptionalStringField(latestTransaction?.id),
    transactionCode: getOptionalStringField(latestTransaction?.transaction_code),
    transactionDate: getOptionalStringField(latestTransaction?.timestamp) ?? getOptionalStringField(latestTransaction?.date),
  };
}
