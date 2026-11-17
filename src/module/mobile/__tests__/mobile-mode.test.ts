import type { QuenchMethods } from "../../../e2e";
import { suppressResolutionNotifications } from "../mobile-mode";

export const key = "vf.mobile.mode";
export const options = { displayName: "VF: Mobile: Mode" };

export default ({ it, expect }: QuenchMethods) => {
  it("suppresses only Foundry's unsupported resolution errors", () => {
    const active = new Set<number>();
    const calls: { message: string; options?: { console?: boolean } }[] = [];
    const notifications = {
      error(message: string, options?: { console?: boolean }) {
        const id = calls.length + 1;
        calls.push({ message, options });
        active.add(id);
        return { id };
      },
      remove(notification: { id: number }) {
        active.delete(notification.id);
      },
    };
    suppressResolutionNotifications(notifications as unknown as typeof ui.notifications);

    for (const message of ["ERROR.RESOLUTION.Screen", "ERROR.RESOLUTION.Scale", "ERROR.RESOLUTION.Window"]) {
      notifications.error(message, { console: true });
      expect(active.size).equal(0);
      expect(calls.at(-1)?.options?.console).equal(false);
    }

    notifications.error("ERROR.Unrelated", { console: true });
    expect(active.size).equal(1);
    expect(calls.at(-1)?.options?.console).equal(true);
  });
};
