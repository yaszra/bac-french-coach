/**
 * How a message actually reaches a family — and what we say when it cannot.
 *
 * The rule this file exists to enforce: there is no silent failure and no
 * queued message that will never go. Every channel resolves, right now, to one
 * of three honest outcomes:
 *
 *   send            — it will be delivered on this channel.
 *   manual_fallback — we cannot deliver it; here is the text, send it yourself.
 *   refused         — we may not use this channel at all (no consent, no
 *                     address). Nothing is queued in the hope it changes.
 *
 * WhatsApp is the reason the file is not trivial. Outside the 24-hour customer
 * service window, only an APPROVED template may be sent. Inside it, free text
 * is allowed. A template that is pending review is not a template we may send,
 * and pretending otherwise produces a message that silently never arrives.
 */

export const CHANNELS = ["in_app", "push", "email", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

export type TemplateApproval = "approved" | "pending" | "rejected" | "none";

export type ChannelContext = {
  /** Consents the guardian has granted, by purpose (comms_email, comms_whatsapp). */
  readonly consents: Readonly<Record<string, boolean>>;
  readonly hasEmailAddress: boolean;
  readonly hasPushSubscription: boolean;
  readonly hasWhatsappNumber: boolean;
  /** When the guardian last messaged us. null = never. */
  readonly lastInboundAt: Date | null;
  /** Approval state of the template this message would use. */
  readonly templateApproval: TemplateApproval;
};

export type DeliveryPlan =
  | { readonly kind: "send"; readonly channel: Channel; readonly mode: "free_form" | "template" }
  | {
      readonly kind: "manual_fallback";
      readonly channel: Channel;
      readonly reasonKey: string;
      /** The screen shows the text and a copy control. Nothing is queued. */
      readonly copyForGuardian: true;
    }
  | { readonly kind: "refused"; readonly channel: Channel; readonly reasonKey: string };

export const WHATSAPP_WINDOW_HOURS = 24;

export function whatsappWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  if (lastInboundAt === null) return false;
  const elapsedHours = (now.getTime() - lastInboundAt.getTime()) / 3_600_000;
  return elapsedHours >= 0 && elapsedHours < WHATSAPP_WINDOW_HOURS;
}

export function planChannel(channel: Channel, ctx: ChannelContext, now: Date): DeliveryPlan {
  switch (channel) {
    case "in_app":
      // The in-app notification IS the record. It needs no address and no
      // consent beyond having an account, so it always succeeds.
      return { kind: "send", channel, mode: "free_form" };

    case "push":
      return ctx.hasPushSubscription
        ? { kind: "send", channel, mode: "free_form" }
        : { kind: "refused", channel, reasonKey: "family.channel.refused.noPushDevice" };

    case "email":
      if (!ctx.hasEmailAddress) {
        return { kind: "refused", channel, reasonKey: "family.channel.refused.noEmailAddress" };
      }
      if (ctx.consents.comms_email !== true) {
        return { kind: "refused", channel, reasonKey: "family.channel.refused.noEmailConsent" };
      }
      return { kind: "send", channel, mode: "free_form" };

    case "whatsapp": {
      if (!ctx.hasWhatsappNumber) {
        return { kind: "refused", channel, reasonKey: "family.channel.refused.noWhatsappNumber" };
      }
      if (ctx.consents.comms_whatsapp !== true) {
        return { kind: "refused", channel, reasonKey: "family.channel.refused.noWhatsappConsent" };
      }
      if (whatsappWindowOpen(ctx.lastInboundAt, now)) {
        return { kind: "send", channel, mode: "free_form" };
      }
      if (ctx.templateApproval === "approved") {
        return { kind: "send", channel, mode: "template" };
      }
      // Outside the window with no approved template there is nothing we may
      // send. We say so, and hand the parent the words.
      return {
        kind: "manual_fallback",
        channel,
        reasonKey:
          ctx.templateApproval === "pending"
            ? "family.channel.fallback.templatePending"
            : ctx.templateApproval === "rejected"
              ? "family.channel.fallback.templateRejected"
              : "family.channel.fallback.windowClosed",
        copyForGuardian: true,
      };
    }
  }
}

export type Dispatch = {
  /** Every plan considered, in preference order — the UI may show them all. */
  readonly plans: readonly DeliveryPlan[];
  /** The channel that will actually carry it. in_app is always present. */
  readonly delivering: readonly DeliveryPlan[];
  /** Text the guardian must send by hand, if any channel ended there. */
  readonly manual: readonly DeliveryPlan[];
};

/**
 * Plan a notification across the guardian's preferred channels.
 *
 * in_app is always included and always first: whatever else happens, the
 * message exists somewhere the family can find it, so "delivered nowhere" is
 * not a state this product can reach.
 */
export function planDispatch(
  preferred: readonly Channel[],
  ctx: ChannelContext,
  now: Date,
): Dispatch {
  const ordered: Channel[] = ["in_app", ...preferred.filter((c) => c !== "in_app")];
  const seen = new Set<Channel>();
  const plans: DeliveryPlan[] = [];
  for (const channel of ordered) {
    if (seen.has(channel)) continue;
    seen.add(channel);
    plans.push(planChannel(channel, ctx, now));
  }
  return {
    plans,
    delivering: plans.filter((p) => p.kind === "send"),
    manual: plans.filter((p) => p.kind === "manual_fallback"),
  };
}

/**
 * The context of someone we hold nothing but an account for.
 *
 * Most notifications in the product are in-app and nothing else: no address is
 * known, no comms consent has been given, and none is needed. Naming that
 * context means the in-app path goes through the same planner as every other
 * channel rather than around it, so a row's delivery state is always something
 * the planner decided.
 */
export const IN_APP_ONLY: ChannelContext = {
  consents: {},
  hasEmailAddress: false,
  hasPushSubscription: false,
  hasWhatsappNumber: false,
  lastInboundAt: null,
  templateApproval: "none",
};

/** The delivery state written on a Notification row, from a plan. Never "queued". */
export function deliveryStateOf(plan: DeliveryPlan): "sent" | "manual_fallback" | "refused" {
  return plan.kind === "send" ? "sent" : plan.kind;
}
