import { createHash } from "node:crypto";
import type { PrismaClient } from "@animeshadow/db";
import { LEGAL_VERSION, PROMO, PRO_PLANS } from "@animeshadow/shared";
import { z } from "zod";
import { BadRequestError, ConflictError, NotFoundError, UpstreamUnavailableError } from "../lib/errors.js";

export interface MulenPayConfig {
  enabled: boolean;
  apiKey?: string | undefined;
  secretKey?: string | undefined;
  shopId?: number | undefined;
  prices: Partial<Record<"1" | "3" | "12", string>>;
}

/** Follow the current API documentation; no secret ever leaves this module. */
export function mulenSignature(currency: string, amount: string, shopId: number, secret: string): string {
  return createHash("sha1").update(`${currency}${amount}${shopId}${secret}`).digest("hex");
}

export function moneyMinor(value: string): number | null {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, cents = ""] = value.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
}

export function addMonthsClamped(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

const createdSchema = z.object({ success: z.literal(true), id: z.number().int().positive(), paymentUrl: z.string().url() });
const paymentSchema = z.object({ success: z.literal(true), payment: z.object({
  id: z.number().int().positive(), uuid: z.string(), amount: z.string(), currency: z.string(), status: z.number().int().min(0).max(6),
}) });

export class MulenPayService {
  constructor(private readonly prisma: PrismaClient, private readonly config: MulenPayConfig, private readonly fetcher: typeof fetch = fetch) {}

  available(): boolean {
    return Boolean(this.config.enabled && this.config.apiKey && this.config.secretKey && this.config.shopId && Object.keys(this.config.prices).length);
  }

  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.available()) throw new UpstreamUnavailableError("Оплата Mulen Pay ещё не подключена.");
    const response = await this.fetcher(`https://mulenpay.ru/api${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(12_000),
      headers: { authorization: `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new UpstreamUnavailableError("Платёжный сервис временно недоступен. Проверьте статус перед повторной оплатой.");
    return response.json();
  }

  async plans(userId?: string) {
    if (!this.available()) return { available: false, plans: [] };
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { trialUntil: true, proSince: true, proUntil: true } }) : null;
    const now = Date.now();
    const paid = user?.proSince && (!user.proUntil || user.proUntil.getTime() > now);
    const discount = !paid && user?.trialUntil && user.trialUntil.getTime() <= now && user.trialUntil.getTime() + PROMO.discountDays * 86_400_000 > now;
    return { available: true, plans: PRO_PLANS.flatMap((plan) => {
      const raw = this.config.prices[String(plan.months) as "1" | "3" | "12"];
      const minor = raw ? moneyMinor(raw) : null;
      if (!minor) return [];
      const amount = discount && plan.months === 1 ? Math.round(minor * (100 - PROMO.discountPercent) / 100) : minor;
      return [{ months: plan.months, amountMinor: amount, currency: "RUB", discountPercent: discount && plan.months === 1 ? PROMO.discountPercent : 0 }];
    }) };
  }

  async create(userId: string, months: number, requestId: string, expectedAmountMinor: number) {
    const quote = (await this.plans(userId)).plans.find((p) => p.months === months);
    if (!quote) throw new UpstreamUnavailableError("Этот тариф Mulen Pay ещё не подключён.");
    if (quote.amountMinor !== expectedAmountMinor) throw new ConflictError("Цена обновилась. Обновите страницу перед оплатой.");
    const previous = await this.prisma.supportPayment.findUnique({ where: { id: requestId } });
    if (previous) {
      if (previous.userId !== userId || previous.months !== months) throw new ConflictError();
      if (previous.checkoutUrl && previous.status === "pending") return { id: previous.id, paymentUrl: previous.checkoutUrl };
      throw new ConflictError("Счёт уже создаётся или обработан. Проверьте его статус.");
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const invoice = await this.prisma.supportPayment.create({ data: { id: requestId, userId, months, amountMinor: quote.amountMinor, consentVersion: LEGAL_VERSION } }).catch((error: unknown) => {
      if ((error as { code?: string }).code === "P2002") throw new ConflictError("Счёт уже создаётся. Проверьте его статус.");
      throw error;
    });
    const amount = (invoice.amountMinor / 100).toFixed(2);
    const description = `AnimeShadow PRO · ${months} мес.`;
    const response = createdSchema.parse(await this.request("/v2/payments", {
      uuid: invoice.id, amount, currency: "rub", shopId: this.config.shopId,
      description, client: user.email, language: "ru", subscribe: null,
      website_url: `https://animeshadow.online/support?payment=${invoice.id}`,
      items: [{ description, quantity: 1, price: Number(amount), vat_code: 0, payment_subject: 4, payment_mode: 4 }],
      sign: mulenSignature("rub", amount, this.config.shopId!, this.config.secretKey!),
    }));
    const checkout = new URL(response.paymentUrl);
    if (checkout.protocol !== "https:" || checkout.username || checkout.password || checkout.port || !/^(?:[a-z0-9-]+\.)*mulenpay\.(ru|com)$/.test(checkout.hostname)) throw new UpstreamUnavailableError("Платёжный сервис вернул неизвестный адрес.");
    await this.prisma.supportPayment.update({ where: { id: invoice.id }, data: { providerId: response.id, checkoutUrl: checkout.href, status: "pending" } });
    return { id: invoice.id, paymentUrl: checkout.href };
  }

  async verify(id: string, userId?: string) {
    const invoice = await this.prisma.supportPayment.findFirst({ where: { id, ...(userId ? { userId } : {}) } });
    if (!invoice) throw new NotFoundError();
    if (invoice.processedAt || !invoice.providerId) return { id, status: invoice.status };
    // Callback bodies and browser redirects are only a hint: query the authenticated API ourselves.
    const { payment } = paymentSchema.parse(await this.request(`/v2/payments/${invoice.providerId}`));
    if (payment.id !== invoice.providerId || payment.uuid !== invoice.id || moneyMinor(payment.amount) !== invoice.amountMinor || payment.currency.toLowerCase() !== invoice.currency) throw new BadRequestError("Параметры платежа не совпали со счётом.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SupportPayment" WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.supportPayment.findUniqueOrThrow({ where: { id } });
      if (locked.processedAt) return { id, status: locked.status };
      const status = payment.status === 3 ? "paid" : payment.status === 2 ? "cancelled" : payment.status === 4 ? "failed" : "pending";
      if (status === "paid") {
        // Different invoices for the same user also serialize their entitlement extension.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${invoice.userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: invoice.userId }, select: { proSince: true, proUntil: true, trialUntil: true } });
        if (!(user.proSince && !user.proUntil)) {
          const now = new Date();
          const from = new Date(Math.max(now.getTime(), user.proUntil?.getTime() ?? 0, user.trialUntil?.getTime() ?? 0));
          await tx.user.update({ where: { id: invoice.userId }, data: { proSince: user.proSince ?? now, proUntil: addMonthsClamped(from, invoice.months) } });
        }
      }
      await tx.supportPayment.update({ where: { id }, data: { status, ...(status === "paid" ? { processedAt: new Date() } : {}) } });
      return { id, status };
    });
  }

  async callback(providerId: number) {
    const invoice = await this.prisma.supportPayment.findUnique({ where: { providerId }, select: { id: true } });
    if (!invoice) throw new NotFoundError();
    return this.verify(invoice.id);
  }
}
