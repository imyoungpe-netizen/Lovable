import { z } from "zod";

export const darkAceCryptoNetworkIdSchema = z.enum([
  "usdt_ton",
  "usdt_tron",
  "usdt_ethereum",
  "usdt_bsc",
  "usdt_solana",
  "usdt_polygon",
]);

export const darkAceCryptoNetworkAddressesSchema = z.object({
  usdt_ton: z.string().max(200),
  usdt_tron: z.string().max(200),
  usdt_ethereum: z.string().max(200),
  usdt_bsc: z.string().max(200),
  usdt_solana: z.string().max(200),
  usdt_polygon: z.string().max(200),
});

export const cryptoTopupSettingsResponseSchema = z.object({
  schemaReady: z.boolean(),
  depositProcessingEnabled: z.boolean(),
  creditRubPerMillion: z.number().int().min(1).max(100_000),
  networkAddresses: darkAceCryptoNetworkAddressesSchema,
  updatedAt: z.coerce.date().nullable(),
});

export const updateCryptoTopupSettingsBodySchema = z.object({
  depositProcessingEnabled: z.boolean(),
  creditRubPerMillion: z.number().int().min(1).max(100_000),
  networkAddresses: darkAceCryptoNetworkAddressesSchema,
});

export const updateCryptoTopupSettingsResponseSchema = cryptoTopupSettingsResponseSchema;

export const CRYPTO_TOPUP_CREDIT_AMOUNTS = [
  500_000,
  1_000_000,
  2_500_000,
  5_000_000,
  10_000_000,
  15_000_000,
  20_000_000,
  25_000_000,
] as const;

export const createCryptoTopupBodySchema = z.object({
  credits: z.number().int().refine(
    (amount) => CRYPTO_TOPUP_CREDIT_AMOUNTS.includes(amount as typeof CRYPTO_TOPUP_CREDIT_AMOUNTS[number]),
    "Выберите доступный пакет кредитов.",
  ),
  idempotencyKey: z.string().uuid(),
});

export const createCryptoTopupResponseSchema = z.object({
  requestId: z.string().uuid(),
  requestNumber: z.number().int().positive(),
  credits: z.number().int(),
  rublesAmount: z.number().int(),
  rateRubPerUsdt: z.string(),
  expiresAt: z.coerce.date(),
  botUrl: z.string().url(),
});

export type DarkAceCryptoNetworkId = z.infer<typeof darkAceCryptoNetworkIdSchema>;
export type CryptoTopupNetworkAddresses = z.infer<typeof darkAceCryptoNetworkAddressesSchema>;
export type CreateCryptoTopupBody = z.infer<typeof createCryptoTopupBodySchema>;
export type CreateCryptoTopupResponse = z.infer<typeof createCryptoTopupResponseSchema>;
