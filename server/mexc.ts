import crypto from 'crypto';

const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): string {
  const key = process.env.SESSION_SECRET;
  if (!key) {
    throw new Error('SESSION_SECRET environment variable is required for credential encryption');
  }
  return key;
}

function getKey(): Buffer {
  const hash = crypto.createHash('sha256').update(getEncryptionKey()).digest();
  return hash;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function createMexcSignature(queryString: string, apiSecret: string): string {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

export interface MexcBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface MexcAccountInfo {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  accountType: string;
  balances: MexcBalance[];
}

export interface MexcTicker {
  symbol: string;
  price: string;
}

export async function fetchMexcAccountInfo(apiKey: string, apiSecret: string): Promise<MexcAccountInfo> {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createMexcSignature(queryString, apiSecret);
  
  const url = `https://api.mexc.com/api/v3/account?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MEXC-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ msg: 'Unknown error' }));
    throw new Error(error.msg || `MEXC API error: ${response.status}`);
  }

  return response.json();
}

export async function fetchMexcTickers(): Promise<Map<string, string>> {
  const url = 'https://api.mexc.com/api/v3/ticker/price';
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch tickers: ${response.status}`);
  }

  const tickers: MexcTicker[] = await response.json();
  const priceMap = new Map<string, string>();
  
  for (const ticker of tickers) {
    priceMap.set(ticker.symbol, ticker.price);
  }
  
  return priceMap;
}

export interface BalanceWithValue extends MexcBalance {
  usdtValue?: string;
  price?: string;
  accountType?: string;
}

export interface FuturesAsset {
  currency: string;
  positionMargin: number;
  availableBalance: number;
  cashBalance: number;
  frozenBalance: number;
  equity: number;
  unrealized: number;
  bonus: number;
}

export interface FuturesAccountResponse {
  success: boolean;
  code: number;
  data: FuturesAsset[];
}

function createFuturesSignature(apiKey: string, timestamp: string, paramString: string, apiSecret: string): string {
  const signString = apiKey + timestamp + paramString;
  return crypto
    .createHmac('sha256', apiSecret)
    .update(signString)
    .digest('hex');
}

export async function fetchMexcFuturesAssets(apiKey: string, apiSecret: string): Promise<FuturesAsset[]> {
  const timestamp = Date.now().toString();
  const paramString = '';
  const signature = createFuturesSignature(apiKey, timestamp, paramString, apiSecret);
  
  const url = 'https://contract.mexc.com/api/v1/private/account/assets';
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'ApiKey': apiKey,
      'Request-Time': timestamp,
      'Signature': signature,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ msg: 'Unknown error' }));
    console.log('Futures API error:', error);
    return [];
  }

  const result: FuturesAccountResponse = await response.json();
  
  if (!result.success || !result.data) {
    console.log('Futures API unsuccessful:', result);
    return [];
  }

  return result.data;
}

export async function getBalancesWithValues(apiKey: string, apiSecret: string): Promise<BalanceWithValue[]> {
  const [accountInfo, futuresAssets, priceMap] = await Promise.all([
    fetchMexcAccountInfo(apiKey, apiSecret),
    fetchMexcFuturesAssets(apiKey, apiSecret).catch(() => []),
    fetchMexcTickers(),
  ]);

  const balances: BalanceWithValue[] = [];
  const processedAssets = new Set<string>();

  for (const balance of accountInfo.balances) {
    const total = parseFloat(balance.free) + parseFloat(balance.locked);
    
    if (total <= 0) continue;

    const enhanced: BalanceWithValue = { 
      ...balance,
      accountType: '现货'
    };

    if (balance.asset === 'USDT') {
      enhanced.price = '1';
      enhanced.usdtValue = total.toFixed(2);
    } else {
      const symbol = `${balance.asset}USDT`;
      const price = priceMap.get(symbol);
      
      if (price) {
        enhanced.price = price;
        enhanced.usdtValue = (total * parseFloat(price)).toFixed(2);
      }
    }

    balances.push(enhanced);
    processedAssets.add(`spot-${balance.asset}`);
  }

  for (const asset of futuresAssets) {
    const equity = asset.equity || 0;
    const availableBalance = asset.availableBalance || 0;
    const total = equity > 0 ? equity : availableBalance;
    
    if (total <= 0) continue;
    if (asset.currency === 'MXPOINT') continue;

    const enhanced: BalanceWithValue = {
      asset: asset.currency,
      free: availableBalance.toString(),
      locked: asset.frozenBalance.toString(),
      accountType: '合约'
    };

    if (asset.currency === 'USDT' || asset.currency === 'USDC') {
      enhanced.price = '1';
      enhanced.usdtValue = total.toFixed(2);
    } else {
      const symbol = `${asset.currency}USDT`;
      const price = priceMap.get(symbol);
      
      if (price) {
        enhanced.price = price;
        enhanced.usdtValue = (total * parseFloat(price)).toFixed(2);
      }
    }

    balances.push(enhanced);
  }

  balances.sort((a, b) => {
    const aValue = parseFloat(a.usdtValue || '0');
    const bValue = parseFloat(b.usdtValue || '0');
    return bValue - aValue;
  });

  return balances;
}
