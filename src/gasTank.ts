import { ETHEREUM_CHAIN_ID, MANA_TOKEN_ADDRESS } from './payments';
import { buildSafeAppOpenUrl } from './safeAppLinks';

export const POLYGON_CHAIN_ID = 137;
export const GAS_TANK_EOA = '0xd9030810ecb1db2d614fe0981369c87f41d4c419';
export const NATIVE_POL_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const DEFAULT_GAS_TANK_REFILL_SELL_AMOUNT = '10000';
export const DEFAULT_GAS_TANK_LOW_POL_BALANCE = 1000;
export const DEFAULT_GAS_TANK_URGENT_POL_BALANCE = 100;
export const GAS_TANK_POLYGONSCAN_URL = `https://polygonscan.com/address/${GAS_TANK_EOA}`;

export function buildCowSwapRefillUrl() {
  return (
    `https://swap.cow.fi/#/${ETHEREUM_CHAIN_ID}/swap/${MANA_TOKEN_ADDRESS}/${NATIVE_POL_ADDRESS}` +
    `?recipient=${GAS_TANK_EOA}&sellAmount=${DEFAULT_GAS_TANK_REFILL_SELL_AMOUNT}&targetChainId=${POLYGON_CHAIN_ID}`
  );
}

export function buildSafeAppRefillUrl(safeAddress: string) {
  return buildSafeAppOpenUrl(buildCowSwapRefillUrl(), safeAddress);
}
