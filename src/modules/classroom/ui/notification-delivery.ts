/**
 * What a row says about its own delivery.
 *
 * The states are the delivery planner's, not a second vocabulary invented
 * here — the two used to disagree, so a notification the planner called "sent"
 * was displayed as "waiting to send" for ever. A delivered notification says
 * nothing extra: the row itself is the delivery.
 */
export function deliveryNoteKey(state: string): string | null {
  switch (state) {
    case "manual_fallback":
      return "teacher.notifications.failedDelivery";
    case "refused":
      return "teacher.notifications.refused";
    case "pending":
      return "teacher.notifications.pending";
    default:
      return null;
  }
}
