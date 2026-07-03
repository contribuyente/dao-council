export const COUNCIL_SAFE_ADDRESS = '0x184e4D9A26Add0aF1eAfC145550E890a421f16d7';

export function buildSafeAppOpenUrl(
  appUrl: string,
  safeAddress = COUNCIL_SAFE_ADDRESS
) {
  return `https://app.safe.global/apps/open?${new URLSearchParams({
    safe: `eth:${safeAddress}`,
    appUrl,
  }).toString()}`;
}
