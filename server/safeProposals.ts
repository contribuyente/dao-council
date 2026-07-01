import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { OperationType, type MetaTransactionData } from '@safe-global/types-kit';
import { getAddress, isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildSafeTransactions,
  ETHEREUM_CHAIN_ID,
  type PaymentRecipient,
} from '../src/payments';

export type SafeProposalEnv = {
  AUTOMATION_PROPOSER_PRIVATE_KEY?: string;
  ETHEREUM_RPC_URL?: string;
  SAFE_API_KEY?: string;
  SAFE_ADDRESS?: string;
  SAFE_CHAIN_ID?: string;
};

export type SafeProposal = {
  safeTxHash: string;
  safeTxUrl: string;
  safeQueueUrl: string;
  nonce: number;
  proposerAddress: string;
  origin: string;
};

export async function getSafeNextNonce(env: SafeProposalEnv) {
  const apiKit = createSafeApiKit(env);
  const safeAddress = getRequiredSafeAddress(env);
  const nextNonce = Number(await apiKit.getNextNonce(safeAddress));

  if (!Number.isInteger(nextNonce) || nextNonce < 0) {
    throw new Error('Safe Transaction Service returned an invalid next nonce.');
  }

  return nextNonce;
}

export async function proposeSafePaymentTransaction({
  env,
  payments,
  nonce,
  origin,
}: {
  env: SafeProposalEnv;
  payments: PaymentRecipient[];
  nonce: number;
  origin: string;
}): Promise<SafeProposal> {
  const apiKit = createSafeApiKit(env);
  const safeAddress = getRequiredSafeAddress(env);
  const privateKey = getRequiredPrivateKey(env);
  const proposerAddress = privateKeyToAccount(privateKey).address;
  const protocolKit = await Safe.init({
    provider: getRequiredEnv(env.ETHEREUM_RPC_URL, 'ETHEREUM_RPC_URL'),
    signer: privateKey,
    safeAddress,
  });
  const safeTransaction = await protocolKit.createTransaction({
    transactions: buildSafeTransactions(payments).map(toMetaTransactionData),
    options: {
      nonce,
    },
  });
  const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
  const signature = await protocolKit.signHash(safeTxHash);

  await apiKit.proposeTransaction({
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: proposerAddress,
    senderSignature: signature.data,
    origin,
  });

  return {
    safeTxHash,
    safeTxUrl: getSafeTransactionUrl(safeAddress, safeTxHash),
    safeQueueUrl: getSafeQueueUrl(safeAddress),
    nonce,
    proposerAddress,
    origin,
  };
}

export function getSafeTransactionUrl(safeAddress: string, safeTxHash: string) {
  const checksumSafeAddress = getAddress(safeAddress);
  return `https://app.safe.global/transactions/tx?safe=eth:${checksumSafeAddress}&id=multisig_${checksumSafeAddress}_${safeTxHash}`;
}

export function getSafeQueueUrl(safeAddress: string) {
  return `https://app.safe.global/transactions/queue?safe=eth:${getAddress(safeAddress)}`;
}

function createSafeApiKit(env: SafeProposalEnv) {
  const chainId = parseSafeChainId(env.SAFE_CHAIN_ID);
  return new SafeApiKit({
    chainId: BigInt(chainId),
    apiKey: getRequiredEnv(env.SAFE_API_KEY, 'SAFE_API_KEY'),
  });
}

function toMetaTransactionData(
  transaction: ReturnType<typeof buildSafeTransactions>[number]
): MetaTransactionData {
  return {
    ...transaction,
    operation: OperationType.Call,
  };
}

function getRequiredSafeAddress(env: SafeProposalEnv) {
  const safeAddress = getRequiredEnv(env.SAFE_ADDRESS, 'SAFE_ADDRESS');

  if (!isAddress(safeAddress)) {
    throw new Error('SAFE_ADDRESS must be an Ethereum address.');
  }

  return getAddress(safeAddress);
}

function getRequiredPrivateKey(env: SafeProposalEnv): Hex {
  const privateKey = getRequiredEnv(
    env.AUTOMATION_PROPOSER_PRIVATE_KEY,
    'AUTOMATION_PROPOSER_PRIVATE_KEY'
  );
  const normalizedPrivateKey = privateKey.startsWith('0x')
    ? privateKey
    : `0x${privateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPrivateKey)) {
    throw new Error('AUTOMATION_PROPOSER_PRIVATE_KEY must be a 32-byte hex key.');
  }

  return normalizedPrivateKey as Hex;
}

function parseSafeChainId(value: string | undefined) {
  if (!value) {
    return ETHEREUM_CHAIN_ID;
  }

  const chainId = Number(value);

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('SAFE_CHAIN_ID must be a positive integer.');
  }

  if (chainId !== ETHEREUM_CHAIN_ID) {
    throw new Error('Only Ethereum mainnet Safe proposals are supported.');
  }

  return chainId;
}

function getRequiredEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
