import Stripe from "stripe";
import type { Invoice } from "../../shared/types";
import { getBaseUrl } from "../env";

export async function createInvoicePaymentLink(
  invoice: Invoice,
  campaignId: string
): Promise<{ state: "completed" | "simulated" | "failed"; url?: string; detail: string }> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      state: "simulated",
      url: `${getBaseUrl()}/pay/demo-${invoice.id}`,
      detail: "STRIPE_SECRET_KEY is missing; generated a local demo payment URL."
    };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${getBaseUrl()}/?paid=${invoice.id}&campaign=${campaignId}`,
      cancel_url: `${getBaseUrl()}/?cancelled=${invoice.id}&campaign=${campaignId}`,
      client_reference_id: invoice.id,
      metadata: {
        campaignId,
        invoiceId: invoice.id,
        demo: "true"
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: invoice.currency.toLowerCase(),
            unit_amount: Math.round(invoice.amount * 100),
            product_data: {
              name: `Invoice ${invoice.id}`,
              description: invoice.description
            }
          }
        }
      ]
    });

    return {
      state: "completed",
      url: session.url || undefined,
      detail: "Stripe Checkout session created in the configured account."
    };
  } catch (error) {
    return {
      state: "failed",
      detail: error instanceof Error ? error.message : "Stripe Checkout session creation failed."
    };
  }
}
