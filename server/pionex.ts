import crypto from 'crypto';

const PIONEX_API_BASE = 'https://api.pionex.com';

interface PionexBalance {
  coin: string;
  free: string;
  frozen: string;
}

interface PionexBalanceResponse {
  data: {
    balances: PionexBalance[];
  };
  result: boolean;
  timestamp: number;
}

interface PionexTicker {
  symbol: string;
  close: string;
}

interface PionexTickerResponse {
  data: {
    tickers: PionexTicker[];
  };
  result: boolean;
  timestamp: number;
}

export interface PionexBalanceWithValue {
  asset: string;
  free: string;
  frozen: string;
  total: string;
  accountType: string;
  price: string;
  usdtValue: string;
}

function generateSignature(
  apiSecret: string,
  method: string,
  path: string,
  queryParams: Record<string, string>,
  body?: string
): string {
  const sortedParams = Object.keys(queryParams)
    .sort()
    .map(key => `${key}=${queryParams[key]}`)
    .join('&');

  const pathUrl = sortedParams ? `${path}?${sortedParams}` : path;
  let signatureBase = `${method}${pathUrl}`;
  
  if (body) {
    signatureBase += body;
  }

  return crypto
    .createHmac('sha256', apiSecret)
    .update(signatureBase)
    .digest('hex');
}

async function pionexRequest<T>(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  queryParams: Record<string, string> = {},
  body?: object
): Promise<T> {
  const timestamp = Date.now().toString();
  const params: Record<string, string> = { ...queryParams, timestamp };
  
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const signature = generateSignature(apiSecret, method, path, params, bodyStr);

  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');

  const url = `${PIONEX_API_BASE}${path}?${sortedParams}`;

  const headers: Record<string, string> = {
    'PIONEX-KEY': apiKey,
    'PIONEX-SIGNATURE': signature,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Pionex API error:', response.status, errorText);
    throw new Error(`Pionex API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export async function validatePionexCredentials(apiKey: string, apiSecret: string): Promise<boolean> {
  try {
    const result = await pionexRequest<PionexBalanceResponse>(
      apiKey,
      apiSecret,
      'GET',
      '/api/v1/account/balances'
    );
    return result.result === true;
  } catch (error) {
    console.error('Pionex credential validation failed:', error);
    return false;
  }
}

async function getPionexPrices(): Promise<Map<string, string>> {
  const priceMap = new Map<string, string>();
  
  try {
    const response = await fetch(`${PIONEX_API_BASE}/api/v1/market/tickers`);
    if (!response.ok) {
      console.error('Failed to fetch Pionex prices');
      return priceMap;
    }
    
    const data = await response.json() as PionexTickerResponse;
    if (data.result && data.data?.tickers) {
      for (const ticker of data.data.tickers) {
        if (ticker.symbol.endsWith('_USDT')) {
          const base = ticker.symbol.replace('_USDT', '');
          priceMap.set(base, ticker.close);
        }
      }
    }
    
    priceMap.set('USDT', '1');
  } catch (error) {
    console.error('Error fetching Pionex prices:', error);
  }
  
  return priceMap;
}

export async function getPionexBalances(apiKey: string, apiSecret: string): Promise<PionexBalance[]> {
  try {
    const result = await pionexRequest<PionexBalanceResponse>(
      apiKey,
      apiSecret,
      'GET',
      '/api/v1/account/balances'
    );
    
    if (!result.result) {
      console.error('Pionex API returned unsuccessful result');
      return [];
    }
    
    return result.data?.balances || [];
  } catch (error) {
    console.error('Error fetching Pionex balances:', error);
    return [];
  }
}

export async function getPionexBalancesWithValues(apiKey: string, apiSecret: string): Promise<PionexBalanceWithValue[]> {
  const [balances, priceMap] = await Promise.all([
    getPionexBalances(apiKey, apiSecret),
    getPionexPrices(),
  ]);

  const balancesWithValues: PionexBalanceWithValue[] = [];

  for (const balance of balances) {
    const free = parseFloat(balance.free) || 0;
    const frozen = parseFloat(balance.frozen) || 0;
    const total = free + frozen;
    
    if (total <= 0) continue;

    const price = priceMap.get(balance.coin) || '0';
    const priceNum = parseFloat(price) || 0;
    const usdtValue = total * priceNum;

    if (usdtValue < 0.01) continue;

    balancesWithValues.push({
      asset: balance.coin,
      free: balance.free,
      frozen: balance.frozen,
      total: total.toString(),
      accountType: '交易账户',
      price,
      usdtValue: usdtValue.toFixed(2),
    });
  }

  balancesWithValues.sort((a, b) => parseFloat(b.usdtValue) - parseFloat(a.usdtValue));

  return balancesWithValues;
}
