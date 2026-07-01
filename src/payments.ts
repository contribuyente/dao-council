import { encodeFunctionData, isAddress, parseEther, type Address } from 'viem';

export const ETHEREUM_CHAIN_ID = 1;
export const MANA_TOKEN_ADDRESS = '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942';

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export type PaymentRecipient = {
  name: string;
  address: string;
  amountMana: number;
};

export type PaymentTransaction = {
  to: string;
  value: string;
  data: string;
};

export function generateMultisigCSV(payments: PaymentRecipient[]) {
  const rows = payments.map((payment) => {
    const totalAmountWei = parseEther(formatTokenAmount(payment.amountMana)).toString();
    return `erc20,${MANA_TOKEN_ADDRESS},${payment.address},${totalAmountWei}`;
  });

  return ['token_type,token_address,receiver,amount', ...rows].join('\n');
}

export function buildSafeTransactions(payments: PaymentRecipient[]): PaymentTransaction[] {
  return payments.map((payment) => {
    if (!isAddress(payment.address)) {
      throw new Error(`Invalid payment address for ${payment.name}`);
    }

    if (!Number.isFinite(payment.amountMana) || payment.amountMana <= 0) {
      throw new Error(`Invalid MANA amount for ${payment.name}`);
    }

    return {
      to: MANA_TOKEN_ADDRESS,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [
          payment.address as Address,
          parseEther(formatTokenAmount(payment.amountMana)),
        ],
      }),
    };
  });
}

export function formatManaAmount(amount: number, maximumFractionDigits = 2) {
  return `${Number(amount.toFixed(maximumFractionDigits)).toLocaleString()} MANA`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenAmount(amount: number): `${number}` {
  return amount.toFixed(18).replace(/\.?0+$/, '') as `${number}`;
}
