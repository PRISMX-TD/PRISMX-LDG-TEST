import crypto from 'crypto';

const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

// SECURITY: Credential encryption key. Prefer dedicated ENCRYPTION_KEY env var
// so rotating SESSION_SECRET does not invalidate stored exchange API credentials.
// If only SESSION_SECRET is set, we fall back to it for backward compatibility,
// but emit a warning encouraging migration.
let _legacyKeyWarned = false;
function getEncryptionKey(): string {
  if (process.env.ENCRYPTION_KEY) {
    if (process.env.ENCRYPTION_KEY.length < 16) {
      throw new Error('ENCRYPTION_KEY is too short (need ≥16 chars)');
    }
    return process.env.ENCRYPTION_KEY;
  }
  if (process.env.SESSION_SECRET) {
    if (!_legacyKeyWarned) {
      console.warn(
        '[security] Falling back to SESSION_SECRET for credential encryption. ' +
        'Set ENCRYPTION_KEY env var and re-encrypt existing credentials before rotating SESSION_SECRET.'
      );
      _legacyKeyWarned = true;
    }
    return process.env.SESSION_SECRET;
  }
  throw new Error('ENCRYPTION_KEY (preferred) or SESSION_SECRET is required for credential encryption');
}

function getLegacyKey(): string | null {
  if (process.env.ENCRYPTION_KEY && process.env.SESSION_SECRET && process.env.ENCRYPTION_KEY !== process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  return null;
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(getEncryptionKey()), iv);
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
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(getEncryptionKey()), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    const legacy = getLegacyKey();
    if (legacy) {
      const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(legacy), iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    throw err;
  }
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
