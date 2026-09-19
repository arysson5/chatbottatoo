import { hasSchedulingFlow } from "@/lib/flows/flow-store";
import { handlePixFlow, isInPixFlow } from "@/lib/flows/pix-flow";
import { handleSchedulingFlow } from "@/lib/flows/scheduling-flow";
import { handleClientDataFlow } from "@/lib/flows/client-data-flow";
import { handleFaqFlow } from "@/lib/flows/faq-flow";

export function hasExtendedActiveFlow(db, number, hasLegacyActiveFlow, instance = "") {
  return hasLegacyActiveFlow() || hasSchedulingFlow(db, number, instance);
}

export async function processSchedulingFlows(ctx) {
  const { db, number, instance = "" } = ctx;

  if (await handleFaqFlow(ctx)) return true;

  if (isInPixFlow(db, number, instance)) {
    const handled = await handlePixFlow(ctx);
    if (handled) return true;
  }

  if (await handleSchedulingFlow(ctx)) return true;
  if (await handleClientDataFlow(ctx)) return true;

  return false;
}

export { startClientDataFlow, askClientName } from "@/lib/flows/client-data-flow";
export { startFaqFlow } from "@/lib/flows/faq-flow";
